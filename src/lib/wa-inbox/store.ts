// Contrato de persistencia de la bandeja. La implementación real es MySQL
// (mysql-store.ts); los tests usan una en memoria con la misma interfaz para no
// tocar la base compartida de la VPS.

import type {
  InboxConversation,
  InboxMessage,
  MessageDirection,
  MessageStatus,
  MessageStatusUpdate,
} from "./types";

export interface NewMessage {
  conversationId: number;
  wamid: string | null;
  direction: MessageDirection;
  type: string;
  body: string | null;
  templateName?: string | null;
  status: MessageStatus;
  errorCode?: number | null;
  errorTitle?: string | null;
  rawPayload?: unknown;
  messageAt: number;
}

export interface MessagePatch {
  wamid?: string | null;
  status?: MessageStatus;
  errorCode?: number | null;
  errorTitle?: string | null;
  rawPayload?: unknown;
}

export interface StatusError {
  code: number | null;
  title: string | null;
}

export interface InboxStore {
  // Crea la conversación si no existe y devuelve su id. Actualiza el nombre si viene uno.
  upsertConversation(phoneNumberId: string, waId: string, contactName: string | null): Promise<number>;
  getConversation(id: number): Promise<InboxConversation | null>;
  listConversations(limit: number): Promise<InboxConversation[]>;
  // Actualiza preview/hora del último mensaje; si es entrante, también last_inbound_at y no leídos.
  recordActivity(
    conversationId: number,
    activity: { preview: string; at: number; inbound: boolean }
  ): Promise<void>;
  markConversationRead(id: number): Promise<void>;

  // Devuelve el id insertado, o null si el wamid ya existía (idempotencia del webhook).
  insertMessage(message: NewMessage): Promise<number | null>;
  getMessage(id: number): Promise<InboxMessage | null>;
  updateMessage(id: number, patch: MessagePatch): Promise<void>;
  // Aplica un webhook de estado respetando STATUS_RANK. Devuelve false si el wamid no existe o no avanzó.
  updateStatusByWamid(wamid: string, status: MessageStatus, error: StatusError | null): Promise<boolean>;
  // Mensajes con id > afterId en orden ascendente. Con afterId 0 trae los últimos `limit`.
  listMessages(conversationId: number, afterId: number, limit: number): Promise<InboxMessage[]>;
  recentOutboundStatuses(conversationId: number, limit: number): Promise<MessageStatusUpdate[]>;
}

let store: InboxStore | null = null;

export async function getInboxStore(): Promise<InboxStore> {
  if (!store) {
    const { MySqlInboxStore } = await import("./mysql-store");
    store = new MySqlInboxStore();
  }
  return store;
}

// Solo para tests.
export function setInboxStore(next: InboxStore | null) {
  store = next;
}
