// Tipos compartidos de la bandeja de WhatsApp. Este archivo no importa nada de
// servidor, así que lo pueden usar tanto las rutas API como los componentes cliente.
// Las fechas viajan como unix timestamp en segundos.

export type MessageDirection = "in" | "out";
export type MessageStatus = "received" | "sending" | "sent" | "delivered" | "read" | "failed";

export interface InboxConversation {
  id: number;
  phoneNumberId: string;
  waId: string;
  contactName: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: number | null;
  lastInboundAt: number | null;
  unreadCount: number;
  // Segundos que quedan de la ventana de 24 h desde el último mensaje del cliente (0 = cerrada)
  windowSecondsLeft: number;
}

export interface InboxMessage {
  id: number;
  conversationId: number;
  wamid: string | null;
  direction: MessageDirection;
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
