// Tipos compartidos de la bandeja de WhatsApp. Este archivo no importa nada de
// servidor, así que lo pueden usar tanto las rutas API como los componentes cliente.
// Las fechas viajan como unix timestamp en segundos.

import type { AttributeValues } from "../crm/attributes";
import type { ChannelId } from "../crm/channels";

// internal = notas del equipo y avisos del sistema (nunca salen hacia Meta).
export type MessageDirection = "in" | "out" | "internal";
// Quién escribió: el cliente, DigiBot (IA), una persona del equipo, el sistema o una nota interna.
export type MessageAuthor = "customer" | "bot" | "agent" | "system" | "note";
export type ConversationStatus = "open" | "resolved";
export type MessageStatus = "received" | "sending" | "sent" | "delivered" | "read" | "failed";

// Publicación de Instagram sobre la que comentó el cliente (canal igc).
export interface InboxPost {
  mediaId?: string;
  caption: string;
  likes: number;
  comments: number;
  thumbnailUrl: string | null;
  permalink?: string | null;
}

export interface InboxConversation {
  id: number;
  // Cuenta (web_clients.id) dueña de la conversación.
  accountId: number;
  channel: ChannelId;
  phoneNumberId: string;
  waId: string;
  contactName: string | null;
  lastMessagePreview: string | null;
  lastMessageAuthor: "customer" | "bot" | "agent" | null;
  lastMessageAt: number | null;
  lastInboundAt: number | null;
  unreadCount: number;
  // Segundos que quedan de la ventana de 24 h desde el último mensaje del cliente (0 = cerrada)
  windowSecondsLeft: number;
  status: ConversationStatus;
  // "IA respondiendo": DigiBot atiende el chat. Tomarlo lo pone en false.
  botActive: boolean;
  assigneeId: number | null;
  // Nombres de las etiquetas de la cuenta (["Venta", "Turno"]).
  tags: string[];
  // Atributos propios de la cuenta: { "dni": "30111222", "obra_social": "OSDE" }
  attributes: AttributeValues;
  note: string;
  createdAt: number;
  sessionCount: number;
  // Canales sin número (Instagram/Messenger): @usuario o nombre de la cuenta.
  handle?: string | null;
  post?: InboxPost | null;
}

export interface InboxMessage {
  id: number;
  conversationId: number;
  wamid: string | null;
  direction: MessageDirection;
  author: MessageAuthor;
  authorName: string | null;
  // Tipo de la API (text, image, template…) o del CRM (note, system, comment, comment_reply, private_reply).
  type: string;
  body: string | null;
  templateName: string | null;
  status: MessageStatus;
  errorCode: number | null;
  errorTitle: string | null;
  messageAt: number;
}

export type MessageStatusUpdate = Pick<InboxMessage, "id" | "wamid" | "status" | "errorCode" | "errorTitle">;

// Plantilla aprobada, simplificada para el selector de la bandeja.
export interface InboxTemplate {
  name: string;
  language: string;
  category: string;
  header: string | null;
  body: string;
  footer: string | null;
  headerVars: string[];
  bodyVars: string[];
}

// Los webhooks de estado pueden llegar desordenados (un "read" antes que el
// "delivered"): solo se avanza a un estado de mayor rango. "failed" siempre pisa.
export const STATUS_RANK: Record<MessageStatus, number> = {
  received: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
};

export const WINDOW_SECONDS = 24 * 60 * 60;

export function extractTemplateVariables(text: string) {
  const matches = text.match(/{{\s*\d+\s*}}/g) ?? [];
  const unique = Array.from(new Set(matches.map((m) => m.replace(/\D/g, ""))));
  return unique.sort((a, b) => Number(a) - Number(b));
}

export function renderTemplateText(text: string, params: Record<string, string>) {
  return text.replace(/{{\s*(\d+)\s*}}/g, (_, n) => params[n] || `{{${n}}}`);
}
