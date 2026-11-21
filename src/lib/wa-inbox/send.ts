// Envío de mensajes desde la bandeja, para todos los canales. Server-only.
//
// Flujo: se guarda el mensaje como "sending", se llama a Meta (Cloud API de
// WhatsApp, o el adaptador del canal social: src/lib/channels/adapters) y se
// actualiza a "sent" con el id externo, o a "failed" con el código de Meta.
//
// Comentarios: se responde a un comentario puntual (commentId) o, si no viene, al
// último del cliente en el hilo. La respuesta por privado sale una sola vez por
// comentario y dentro de los 7 días; además se copia en la conversación de DM de esa
// persona (Meta la entrega como mensaje directo).

import { adapterFor } from "../channels/adapters";
import { humanAgentEnabled } from "../channels/config";
import { pickErrorCode } from "../crm/meta-errors";
import { replyAvailability, type ReplyKind } from "../crm/reply-window";
import { getSocialAccount, type SocialAccount, type SocialChannel } from "../meta-social/accounts";
import { isCommentChannel, supportsPrivateReply, type ChannelId } from "../crm/channels";
import { MetaApiError, MetaConfigError, sendWhatsAppMessage, type TemplateMessageInput } from "../meta-whatsapp";
import { getInboxStore, type InboxStore } from "./store";
import { listApprovedInboxTemplates } from "./templates";
import { renderTemplateText, type InboxConversation, type InboxMessage, type InboxTemplate } from "./types";

export type ReplyMode = "public" | "private";

export type SendInput =
  // replyMode y commentId solo aplican a comentarios (en público / por privado, a cuál comentario).
  | { type: "text"; body: string; replyMode?: ReplyMode; commentId?: string }
  | {
      type: "template";
      name: string;
      language: string;
      headerParams: string[];
      bodyParams: string[];
    };

export class InboxSendError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "invalid_body"
      | "window_closed"
      | "template_not_found"
      | "not_retryable"
      | "already_replied",
    message: string,
    public readonly httpStatus: number
  ) {
    super(message);
  }
}

export interface SendResult {
  saved: InboxMessage;
  error: { code: number | null; title: string } | null;
}

interface SendDeps {
  store?: InboxStore;
  findTemplates?: () => Promise<InboxTemplate[]>;
  // Nombre de quien envía desde el panel (queda en author_name del mensaje).
  authorName?: string | null;
  getAccount?: (channel: SocialChannel, accountId: string) => Promise<SocialAccount | null>;
  // META_HUMAN_AGENT_ENABLED (los tests lo pasan directo)
  humanAgent?: boolean;
}

// Tipo del mensaje saliente según canal y modo (lo usa la UI para la etiqueta).
function outgoingType(channel: InboxConversation["channel"], replyMode?: ReplyMode) {
  if (!isCommentChannel(channel)) return "text";
  return replyMode === "private" ? "private_reply" : "comment_reply";
}

// Con qué cuenta se envía cada canal.
function accountChannelOf(channel: ChannelId): SocialChannel {
  if (channel === "fb" || channel === "fbc") return "fb";
  if (channel === "th") return "th";
  return "ig";
}

const ACCOUNT_NAMES: Record<SocialChannel, string> = { fb: "Facebook", ig: "Instagram", th: "Threads" };

function replyKind(type: string): ReplyKind {
  if (type === "comment_reply") return "comment_public";
  if (type === "private_reply") return "comment_private";
  return "message";
}

function assertCanReply(conversation: InboxConversation, type: string, deps: SendDeps, comment?: InboxMessage | null) {
  const availability = replyAvailability(conversation, replyKind(type), undefined, {
    humanAgent: deps.humanAgent ?? humanAgentEnabled(),
    commentAt: comment?.messageAt ?? null,
  });
  if (!availability.allowed) {
    throw new InboxSendError("window_closed", availability.reason ?? "No se puede responder ahora.", 409);
  }
  return availability;
}

// Comentario al que se responde: el pedido (tiene que ser de este hilo) o el último del cliente.
async function findTargetComment(store: InboxStore, conversation: InboxConversation, commentId?: string | null) {
  const recent = await store.listMessages(conversation.id, 0, 200);
  const comments = recent.filter((m) => m.direction === "in" && m.wamid);
  const target = commentId
    ? comments.find((m) => m.wamid === commentId)
    : [...comments].reverse().find((m) => !m.deletedAt);
  if (!target?.wamid) throw new InboxSendError("not_found", "No se encontró el comentario para responder.", 404);
  if (target.deletedAt) throw new InboxSendError("invalid_body", "Ese comentario fue borrado: ya no se puede responder.", 409);
  return target;
}

async function assertPrivateReplyAvailable(store: InboxStore, conversation: InboxConversation, comment: InboxMessage) {
  if (!supportsPrivateReply(conversation.channel)) return;
  if (comment.wamid && (await store.hasPrivateReply(comment.wamid))) {
    throw new InboxSendError(
      "already_replied",
      "Ya respondiste por privado a este comentario. Meta permite una sola respuesta privada por comentario.",
      409
    );
  }
}

const MAX_TEXT_LENGTH = 4096;
// Messenger e Instagram aceptan hasta 2000 caracteres por mensaje (Threads, 500).
const MAX_SOCIAL_TEXT_LENGTH = 2000;
const MAX_THREADS_TEXT_LENGTH = 500;

// Los webhooks traen los celulares de Argentina como 549XXXXXXXXXX y los de México
// como 521XXXXXXXXXX, pero la lista de destinatarios permitidos (números de prueba)
// los guarda sin el 9 / el 1 y el envío falla con 131030. Meta resuelve el formato
// corto a la misma cuenta, así que se envía siempre así; el wa_id guardado no cambia.
export function toRecipient(waId: string) {
  if (/^549\d{10}$/.test(waId)) return `54${waId.slice(3)}`;
  if (/^521\d{10}$/.test(waId)) return `52${waId.slice(3)}`;
  return waId;
}

function toParams(values: string[]) {
  return Object.fromEntries(values.map((v, i) => [String(i + 1), v]));
}

async function buildTemplate(
  input: Extract<SendInput, { type: "template" }>,
  findTemplates: () => Promise<InboxTemplate[]>
) {
  const templates = await findTemplates();
  const template = templates.find((t) => t.name === input.name && t.language === input.language);
  if (!template) {
    throw new InboxSendError(
      "template_not_found",
      "La plantilla no existe o no está aprobada.",
      400
    );
  }

  const headerParams = input.headerParams.map((p) => p.trim());
  const bodyParams = input.bodyParams.map((p) => p.trim());
  if (
    headerParams.length !== template.headerVars.length ||
    bodyParams.length !== template.bodyVars.length ||
    [...headerParams, ...bodyParams].some((p) => !p)
  ) {
    throw new InboxSendError("invalid_body", "Completá todas las variables de la plantilla.", 400);
  }

  const components: TemplateMessageInput["components"] = [];
  if (headerParams.length > 0) {
    components.push({ type: "header", parameters: headerParams.map((text) => ({ type: "text", text })) });
  }
  if (bodyParams.length > 0) {
    components.push({ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) });
  }

  const header = template.header ? renderTemplateText(template.header, toParams(headerParams)) : null;
  const body = renderTemplateText(template.body, toParams(bodyParams));

  return {
    payload: { name: template.name, language: template.language, components },
    preview: header ? `${header}\n${body}` : body,
  };
}

export async function sendFromInbox(
  conversationId: number,
  input: SendInput,
  deps: SendDeps = {}
): Promise<SendResult> {
  const store = deps.store ?? (await getInboxStore());
  const conversation = await store.getConversation(conversationId);
  if (!conversation) {
    throw new InboxSendError("not_found", "La conversación no existe.", 404);
  }

  let body: string;
  let templateName: string | null = null;
  let type: string = input.type;
  let outgoing: Parameters<typeof sendWhatsAppMessage>[1];
  let comment: InboxMessage | null = null;

  if (input.type === "text") {
    body = input.body.trim();
    if (!body) throw new InboxSendError("invalid_body", "El mensaje está vacío.", 400);
    const max =
      conversation.channel === "wa"
        ? MAX_TEXT_LENGTH
        : conversation.channel === "th"
          ? MAX_THREADS_TEXT_LENGTH
          : MAX_SOCIAL_TEXT_LENGTH;
    if (body.length > max) {
      throw new InboxSendError("invalid_body", `El mensaje supera los ${max} caracteres.`, 400);
    }
    type = outgoingType(conversation.channel, input.replyMode);
    // Primero las reglas del canal (ej. Threads no tiene privado); después las del comentario puntual.
    assertCanReply(conversation, type, deps);
    if (isCommentChannel(conversation.channel)) {
      comment = await findTargetComment(store, conversation, input.commentId);
      if (type === "private_reply") await assertPrivateReplyAvailable(store, conversation, comment);
    }
    // Las reglas de ventana se validan acá para no depender de que la UI lo haya bloqueado.
    assertCanReply(conversation, type, deps, comment);
    outgoing = { type: "text", text: body };
  } else {
    if (conversation.channel !== "wa") {
      throw new InboxSendError("invalid_body", "Las plantillas solo existen en WhatsApp.", 400);
    }
    const template = await buildTemplate(input, deps.findTemplates ?? (() => listApprovedInboxTemplates(conversation.accountId)));
    body = template.preview;
    templateName = template.payload.name;
    outgoing = { type: "template", template: template.payload };
  }

  const now = Math.floor(Date.now() / 1000);
  const messageId = await store.insertMessage({
    conversationId,
    wamid: null,
    direction: "out",
    author: "agent",
    authorName: deps.authorName ?? null,
    type,
    body,
    templateName,
    status: "sending",
    messageAt: now,
    inReplyTo: comment?.wamid ?? null,
  });
  if (messageId === null) throw new Error("No se pudo guardar el mensaje saliente.");

  await store.recordActivity(conversationId, { preview: body, at: now, inbound: false, author: "agent" });

  return deliver(store, conversation, messageId, outgoing, type, deps);
}

// "Reintentar" de un mensaje fallido: se reenvía el mismo registro (no se duplica).
// Las plantillas no se reintentan acá porque no guardamos sus variables: la UI
// abre el selector de plantillas para mandarla de nuevo.
export async function retryFromInbox(
  conversationId: number,
  messageId: number,
  deps: SendDeps = {}
): Promise<SendResult> {
  const store = deps.store ?? (await getInboxStore());
  const conversation = await store.getConversation(conversationId);
  if (!conversation) throw new InboxSendError("not_found", "La conversación no existe.", 404);

  const message = await store.getMessage(messageId);
  if (!message || message.conversationId !== conversationId) {
    throw new InboxSendError("not_found", "El mensaje no existe.", 404);
  }
  const retryable = ["text", "comment_reply", "private_reply"];
  if (message.direction !== "out" || message.status !== "failed" || !retryable.includes(message.type) || !message.body) {
    throw new InboxSendError("not_retryable", "Este mensaje no se puede reintentar.", 400);
  }
  assertCanReply(conversation, message.type, deps);
  let comment: InboxMessage | null = null;
  if (isCommentChannel(conversation.channel)) {
    comment = await findTargetComment(store, conversation, message.inReplyTo);
    if (message.type === "private_reply") await assertPrivateReplyAvailable(store, conversation, comment);
  }
  assertCanReply(conversation, message.type, deps, comment);

  await store.updateMessage(messageId, { status: "sending", errorCode: null, errorTitle: null });
  return deliver(store, conversation, messageId, { type: "text", text: message.body }, message.type, deps);
}

// Envío por Messenger / Instagram / Threads (DM, respuesta pública o privada a un comentario).
async function sendSocial(
  store: InboxStore,
  conversation: InboxConversation,
  messageId: number,
  text: string,
  type: string,
  deps: SendDeps
): Promise<SendResultLike> {
  const channel = accountChannelOf(conversation.channel);
  const account = await (deps.getAccount ?? getSocialAccount)(channel, conversation.phoneNumberId);
  if (!account) {
    throw new MetaConfigError(`La cuenta de ${ACCOUNT_NAMES[channel]} no está conectada. Conectala desde Canales.`);
  }
  const adapter = adapterFor(account);

  if (isCommentChannel(conversation.channel)) {
    const saved = await store.getMessage(messageId);
    const commentId = saved?.inReplyTo ?? (await findTargetComment(store, conversation)).wamid!;
    if (type === "private_reply") {
      if (!adapter.replyPrivate) throw new MetaConfigError(`${ACCOUNT_NAMES[channel]} no permite responder por privado.`);
      const result = await adapter.replyPrivate(account, commentId, text);
      await mirrorPrivateReply(store, conversation, result.recipientId ?? null, text, commentId, deps).catch((err) =>
        console.error("[wa-inbox] No se pudo copiar la respuesta privada al DM:", (err as Error).message)
      );
      return result;
    }
    return adapter.replyPublic(account, commentId, text);
  }

  if (!adapter.sendMessage) throw new MetaConfigError(`${ACCOUNT_NAMES[channel]} no tiene mensajes directos.`);
  const { humanAgent } = replyAvailability(conversation, "message", undefined, {
    humanAgent: deps.humanAgent ?? humanAgentEnabled(),
  });
  return adapter.sendMessage(account, conversation.waId, text, humanAgent ? "human_agent" : "standard");
}

type SendResultLike = { id: string | null; recipientId?: string | null };

// La respuesta por privado le llega a la persona como mensaje directo: se deja también
// en su conversación de DM (la crea si no existía), así el equipo sigue la charla ahí.
async function mirrorPrivateReply(
  store: InboxStore,
  conversation: InboxConversation,
  recipientId: string | null,
  text: string,
  commentId: string,
  deps: SendDeps
) {
  const dmChannel: ChannelId = conversation.channel === "igc" ? "ig" : "fb";
  // En Instagram el id de quien comenta es su IGSID; en Facebook solo sirve el recipient_id que devuelve Meta.
  const contactId = recipientId ?? (conversation.channel === "igc" ? conversation.waId.split(":")[0] : null);
  if (!contactId || contactId.startsWith("anon-")) return;
  const dmId = await store.upsertConversation(conversation.phoneNumberId, contactId, conversation.contactName, {
    channel: dmChannel,
    accountId: conversation.accountId,
    handle: conversation.handle ?? null,
  });
  const now = Math.floor(Date.now() / 1000);
  // Sin wamid: el mid ya lo tiene el mensaje del hilo de comentarios (es único).
  const id = await store.insertMessage({
    conversationId: dmId,
    wamid: null,
    direction: "out",
    author: "agent",
    authorName: deps.authorName ?? null,
    type: "private_reply",
    body: text,
    status: "sent",
    messageAt: now,
    inReplyTo: commentId,
  });
  if (id !== null) await store.recordActivity(dmId, { preview: text, at: now, inbound: false, author: "agent" });
}

async function deliver(
  store: InboxStore,
  conversation: InboxConversation,
  messageId: number,
  outgoing: Parameters<typeof sendWhatsAppMessage>[1],
  type: string,
  deps: SendDeps
): Promise<SendResult> {
  let error: SendResult["error"] = null;
  try {
    if (conversation.channel === "wa") {
      const result = await sendWhatsAppMessage(toRecipient(conversation.waId), outgoing, conversation.phoneNumberId);
      await store.updateMessage(messageId, {
        wamid: result.messages?.[0]?.id ?? null,
        status: "sent",
        rawPayload: result,
      });
    } else {
      if (outgoing.type !== "text") throw new MetaConfigError("Las plantillas solo existen en WhatsApp.");
      const result = await sendSocial(store, conversation, messageId, outgoing.text, type, deps);
      await store.updateMessage(messageId, { wamid: result.id, status: "sent", rawPayload: result });
    }
  } catch (err) {
    if (err instanceof MetaApiError) {
      error = { code: pickErrorCode(err.code, err.subcode, conversation.channel), title: err.title || err.message };
    } else if (err instanceof MetaConfigError) {
      error = { code: null, title: err.message };
    } else {
      console.error("[wa-inbox] Error inesperado al enviar:", err);
      error = { code: null, title: "No se pudo conectar con la API de Meta." };
    }
    await store.updateMessage(messageId, {
      status: "failed",
      errorCode: error.code,
      errorTitle: error.title,
    });
  }

  const saved = await store.getMessage(messageId);
  if (!saved) throw new Error("No se encontró el mensaje recién guardado.");
  return { saved, error };
}
