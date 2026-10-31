// Procesa los webhooks de la WhatsApp Cloud API (/webhooks/whatsapp). Server-only.
//
// Campos soportados:
//   messages            -> value.messages[] (entrantes) y value.statuses[] (estados de salientes)
//   smb_message_echoes  -> mensajes enviados desde la app de WhatsApp Business (coexistencia)
// Cualquier otra cosa se loguea y se ignora sin romper.

import { createHmac, timingSafeEqual } from "crypto";
import { getInboxStore, type InboxStore } from "./store";
import type { MessageStatus } from "./types";

const LOG = "[wa-webhook]";

export function isValidSignature(rawBody: string, header: string | null, appSecret: string | undefined) {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function isValidVerifyToken(token: string | null, expected: string | undefined) {
  if (!expected || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- Formas del payload de la Cloud API (solo lo que usamos) ---

interface WaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  location?: { name?: string; address?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  reaction?: { emoji?: string };
}

interface WaEcho extends WaMessage {
  to: string;
}

interface WaStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  errors?: { code?: number; title?: string; message?: string }[];
}

interface ChangeValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
  message_echoes?: WaEcho[];
}

interface WebhookPayload {
  object?: string;
  entry?: { id?: string; changes?: { field?: string; value?: ChangeValue }[] }[];
}

const PLACEHOLDERS: Record<string, string> = {
  image: "[imagen]",
  audio: "[audio]",
  voice: "[audio]",
  video: "[video]",
  document: "[documento]",
  sticker: "[sticker]",
  location: "[ubicación]",
  contacts: "[contacto]",
  order: "[pedido]",
  unsupported: "[mensaje no soportado]",
};

function withDetail(placeholder: string, detail?: string) {
  return detail ? `${placeholder} ${detail}` : placeholder;
}

// Texto legible que se guarda en body y se usa como preview de la conversación.
export function describeMessage(message: WaMessage): string {
  switch (message.type) {
    case "text":
      return message.text?.body ?? "";
    case "image":
      return withDetail(PLACEHOLDERS.image, message.image?.caption);
    case "video":
      return withDetail(PLACEHOLDERS.video, message.video?.caption);
    case "document":
      return withDetail(PLACEHOLDERS.document, message.document?.caption || message.document?.filename);
    case "location":
      return withDetail(
        PLACEHOLDERS.location,
        [message.location?.name, message.location?.address].filter(Boolean).join(" · ")
      );
    case "button":
      return message.button?.text || message.button?.payload || "[botón]";
    case "interactive":
      return (
        message.interactive?.button_reply?.title ||
        message.interactive?.list_reply?.title ||
        "[respuesta interactiva]"
      );
    case "reaction":
      return withDetail("[reacción]", message.reaction?.emoji);
    default:
      return PLACEHOLDERS[message.type] ?? `[${message.type}]`;
  }
}

function toUnix(timestamp: string | undefined) {
  const value = Number(timestamp);
  return Number.isFinite(value) && value > 0 ? value : Math.floor(Date.now() / 1000);
}

const KNOWN_STATUSES: MessageStatus[] = ["sent", "delivered", "read", "failed"];

async function handleMessagesChange(value: ChangeValue, store: InboxStore) {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) {
    console.warn(`${LOG} Cambio "messages" sin metadata.phone_number_id, se ignora.`);
    return;
  }

  const names = new Map<string, string>();
  for (const contact of value.contacts ?? []) {
    if (contact.wa_id && contact.profile?.name) names.set(contact.wa_id, contact.profile.name);
  }

  for (const message of value.messages ?? []) {
    const conversationId = await store.upsertConversation(
      phoneNumberId,
      message.from,
      names.get(message.from) ?? null
    );
    const body = describeMessage(message);
    const at = toUnix(message.timestamp);

    const id = await store.insertMessage({
      conversationId,
      wamid: message.id,
      direction: "in",
      type: message.type,
      body,
      status: "received",
      rawPayload: message,
      messageAt: at,
    });
    if (id === null) continue; // wamid repetido: Meta reintentó el webhook

    await store.recordActivity(conversationId, { preview: body, at, inbound: true });
  }

  for (const status of value.statuses ?? []) {
    if (!KNOWN_STATUSES.includes(status.status as MessageStatus)) {
      console.info(`${LOG} Estado "${status.status}" no manejado para ${status.id}.`);
      continue;
    }
    const error = status.errors?.[0];
    const updated = await store.updateStatusByWamid(
      status.id,
      status.status as MessageStatus,
      status.status === "failed"
        ? { code: error?.code ?? null, title: error?.title || error?.message || null }
        : null
    );
    if (!updated) {
      // Normal si el mensaje lo mandó otro sistema (ej: el bot) o si el estado llegó desordenado.
      console.info(`${LOG} Estado "${status.status}" sin cambios para ${status.id}.`);
    }
  }
}

async function handleEchoesChange(value: ChangeValue, store: InboxStore) {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) {
    console.warn(`${LOG} Cambio "smb_message_echoes" sin metadata.phone_number_id, se ignora.`);
    return;
  }

  for (const echo of value.message_echoes ?? []) {
    const conversationId = await store.upsertConversation(phoneNumberId, echo.to, null);
    const body = describeMessage(echo);
    const at = toUnix(echo.timestamp);

    const id = await store.insertMessage({
      conversationId,
      wamid: echo.id,
      direction: "out",
      type: echo.type,
      body,
      status: "sent",
      rawPayload: echo,
      messageAt: at,
    });
    if (id === null) continue;

    await store.recordActivity(conversationId, { preview: body, at, inbound: false });
  }
}

export async function processWebhookPayload(payload: unknown, store?: InboxStore) {
  const data = payload as WebhookPayload;
  if (data?.object !== "whatsapp_business_account" || !Array.isArray(data.entry)) {
    console.warn(`${LOG} Payload desconocido:`, JSON.stringify(payload).slice(0, 2000));
    return;
  }

  const inbox = store ?? (await getInboxStore());

  for (const entry of data.entry) {
    for (const change of entry.changes ?? []) {
      if (!change.value) continue;
      switch (change.field) {
        case "messages":
          await handleMessagesChange(change.value, inbox);
          break;
        case "smb_message_echoes":
          await handleEchoesChange(change.value, inbox);
          break;
        default:
          console.warn(
            `${LOG} Campo "${change.field}" no manejado:`,
            JSON.stringify(change.value).slice(0, 2000)
          );
      }
    }
  }
}
