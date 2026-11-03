// Envío de mensajes desde la bandeja, para todos los canales. Server-only.
//
// Flujo: se guarda el mensaje como "sending", se llama a Meta (Cloud API de
// WhatsApp o Graph API de Messenger/Instagram) y se actualiza a "sent" con el id
// externo, o a "failed" con el código de Meta.

import { pickErrorCode } from "../crm/meta-errors";
import { replyAvailability, type ReplyKind } from "../crm/reply-window";
import { getSocialAccount, type SocialAccount, type SocialChannel } from "../meta-social/accounts";
import { replyToComment, sendDirectMessage, sendPrivateReply } from "../meta-social/graph";
import { MetaApiError, MetaConfigError, sendWhatsAppMessage, type TemplateMessageInput } from "../meta-whatsapp";
import { getInboxStore, type InboxStore } from "./store";
import { listApprovedInboxTemplates } from "./templates";
import { renderTemplateText, type InboxConversation, type InboxMessage, type InboxTemplate } from "./types";

export type ReplyMode = "public" | "private";

export type SendInput =
  // replyMode solo aplica a comentarios de Instagram (en público / por privado).
  | { type: "text"; body: string; replyMode?: ReplyMode }
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
      | "not_retryable",
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
}

// Tipo del mensaje saliente según canal y modo (lo usa la UI para la etiqueta).
function outgoingType(channel: InboxConversation["channel"], replyMode?: ReplyMode) {
  if (channel !== "igc") return "text";
  return replyMode === "private" ? "private_reply" : "comment_reply";
}

function replyKind(type: string): ReplyKind {
  if (type === "comment_reply") return "comment_public";
  if (type === "private_reply") return "comment_private";
  return "message";
}

function assertCanReply(conversation: InboxConversation, type: string) {
  const availability = replyAvailability(conversation, replyKind(type));
  if (!availability.allowed) {
    throw new InboxSendError("window_closed", availability.reason ?? "No se puede responder ahora.", 409);
  }
  return availability;
}

const MAX_TEXT_LENGTH = 4096;
// Messenger e Instagram aceptan hasta 2000 caracteres por mensaje.
const MAX_SOCIAL_TEXT_LENGTH = 2000;

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

  if (input.type === "text") {
    body = input.body.trim();
    if (!body) throw new InboxSendError("invalid_body", "El mensaje está vacío.", 400);
    const max = conversation.channel === "wa" ? MAX_TEXT_LENGTH : MAX_SOCIAL_TEXT_LENGTH;
    if (body.length > max) {
      throw new InboxSendError("invalid_body", `El mensaje supera los ${max} caracteres.`, 400);
    }
    type = outgoingType(conversation.channel, input.replyMode);
    // Las reglas de ventana se validan acá para no depender de que la UI lo haya bloqueado.
    assertCanReply(conversation, type);
    outgoing = { type: "text", text: body };
  } else {
    if (conversation.channel !== "wa") {
      throw new InboxSendError("invalid_body", "Las plantillas solo existen en WhatsApp.", 400);
    }
    const template = await buildTemplate(input, deps.findTemplates ?? listApprovedInboxTemplates);
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
  assertCanReply(conversation, message.type);

  await store.updateMessage(messageId, { status: "sending", errorCode: null, errorTitle: null });
  return deliver(store, conversation, messageId, { type: "text", text: message.body }, message.type, deps);
}

// Envío por Messenger / Instagram (DM, respuesta pública o privada a un comentario).
async function sendSocial(
  store: InboxStore,
  conversation: InboxConversation,
  text: string,
  type: string,
  deps: SendDeps
): Promise<{ id: string | null }> {
  const channel: SocialChannel = conversation.channel === "fb" ? "fb" : "ig";
  const account = await (deps.getAccount ?? getSocialAccount)(channel, conversation.phoneNumberId);
  if (!account) {
    throw new MetaConfigError(
      `La cuenta de ${channel === "fb" ? "Messenger" : "Instagram"} no está conectada. Conectala desde Canales.`
    );
  }

  if (conversation.channel === "igc") {
    // Se responde al último comentario del cliente en ese hilo.
    const recent = await store.listMessages(conversation.id, 0, 200);
    const comment = [...recent].reverse().find((m) => m.direction === "in" && m.wamid);
    if (!comment?.wamid) throw new MetaConfigError("No se encontró el comentario para responder.");
    return type === "private_reply"
      ? sendPrivateReply(account, comment.wamid, text)
      : replyToComment(account, comment.wamid, text);
  }

  const { humanAgent } = replyAvailability(conversation, "message");
  return sendDirectMessage(account, conversation.waId, text, humanAgent ? "human_agent" : "standard");
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
      const result = await sendSocial(store, conversation, outgoing.text, type, deps);
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
