// Envío de mensajes desde la bandeja (texto libre o plantilla). Server-only.
//
// Flujo: se guarda el mensaje como "sending", se llama a la Cloud API y se
// actualiza a "sent" con el wamid, o a "failed" con el código/título de Meta.

import { MetaApiError, MetaConfigError, sendWhatsAppMessage, type TemplateMessageInput } from "../meta-whatsapp";
import { getInboxStore, type InboxStore } from "./store";
import { listApprovedInboxTemplates } from "./templates";
import { renderTemplateText, type InboxMessage, type InboxTemplate } from "./types";

export type SendInput =
  | { type: "text"; body: string }
  | {
      type: "template";
      name: string;
      language: string;
      headerParams: string[];
      bodyParams: string[];
    };

export class InboxSendError extends Error {
  constructor(
    public readonly code: "not_found" | "invalid_body" | "window_closed" | "template_not_found",
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
}

const MAX_TEXT_LENGTH = 4096;

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
  let outgoing: Parameters<typeof sendWhatsAppMessage>[1];

  if (input.type === "text") {
    body = input.body.trim();
    if (!body) throw new InboxSendError("invalid_body", "El mensaje está vacío.", 400);
    if (body.length > MAX_TEXT_LENGTH) {
      throw new InboxSendError("invalid_body", `El mensaje supera los ${MAX_TEXT_LENGTH} caracteres.`, 400);
    }
    // Fuera de la ventana de 24 h Meta solo acepta plantillas: se corta acá para
    // no depender de que la UI lo haya bloqueado.
    if (conversation.windowSecondsLeft <= 0) {
      throw new InboxSendError(
        "window_closed",
        "La ventana de 24 h está cerrada. Solo podés enviar una plantilla aprobada.",
        409
      );
    }
    outgoing = { type: "text", text: body };
  } else {
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
    type: input.type,
    body,
    templateName,
    status: "sending",
    messageAt: now,
  });
  if (messageId === null) throw new Error("No se pudo guardar el mensaje saliente.");

  await store.recordActivity(conversationId, { preview: body, at: now, inbound: false });

  let error: SendResult["error"] = null;
  try {
    const result = await sendWhatsAppMessage(toRecipient(conversation.waId), outgoing, conversation.phoneNumberId);
    await store.updateMessage(messageId, {
      wamid: result.messages?.[0]?.id ?? null,
      status: "sent",
      rawPayload: result,
    });
  } catch (err) {
    if (err instanceof MetaApiError) {
      error = { code: err.code, title: err.title || err.message };
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
