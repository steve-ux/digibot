// Contrato de persistencia de la bandeja. La implementación real es MySQL
// (mysql-store.ts); los tests usan una en memoria con la misma interfaz para no
// tocar la base compartida de la VPS.

import type { AttributeValues } from "../crm/attributes";
import type { ChannelId } from "../crm/channels";
import type {
  ConversationStatus,
  InboxConversation,
  InboxPost,
  InboxMessage,
  MessageAuthor,
  MessageDirection,
  MessageStatus,
  MessageStatusUpdate,
} from "./types";

export interface NewMessage {
  conversationId: number;
  wamid: string | null;
  direction: MessageDirection;
  // Por defecto: in -> customer, out -> agent, internal -> system.
  author?: MessageAuthor;
  authorName?: string | null;
  type: string;
  body: string | null;
  templateName?: string | null;
  status: MessageStatus;
  errorCode?: number | null;
  errorTitle?: string | null;
  rawPayload?: unknown;
  messageAt: number;
  // Respuesta a un comentario: id del comentario respondido
  inReplyTo?: string | null;
}

export interface MessagePatch {
  wamid?: string | null;
  status?: MessageStatus;
  errorCode?: number | null;
  errorTitle?: string | null;
  rawPayload?: unknown;
}

// Cambios de la conversación hechos desde el panel (resolver, tomar, asignar…).
export interface ConversationPatch {
  status?: ConversationStatus;
  botActive?: boolean;
  assigneeId?: number | null;
  tags?: string[];
  // Reemplaza todos los valores (la acción ya los mezcló con los anteriores).
  attributes?: AttributeValues;
  note?: string;
  // Archivar / desarchivar (la lista no muestra las archivadas)
  archived?: boolean;
}

export type ActivityAuthor = "customer" | "bot" | "agent";

// Datos extra al crear/actualizar una conversación de Instagram o Messenger.
export interface ConversationIdentity {
  channel?: ChannelId;
  // Cuenta dueña. En MySQL se deduce del número / página conectada; si no viene,
  // queda en la cuenta por defecto (la primera de web_clients).
  accountId?: number;
  handle?: string | null;
  post?: InboxPost | null;
}

export interface StatusError {
  code: number | null;
  title: string | null;
}

export interface InboxStore {
  // Crea la conversación si no existe y devuelve su id. Actualiza nombre/handle/post si vienen.
  // businessId = phone_number_id / page_id / ig_user_id; contactId = wa_id / PSID / IGSID.
  upsertConversation(
    businessId: string,
    contactId: string,
    contactName: string | null,
    identity?: ConversationIdentity
  ): Promise<number>;
  getConversation(id: number): Promise<InboxConversation | null>;
  // Busca sin crear (para eventos como "leído" que no deben abrir conversaciones nuevas).
  findConversationId(channel: ChannelId, businessId: string, contactId: string): Promise<number | null>;
  // Conversaciones de una cuenta, las más recientes primero (sin las archivadas).
  listConversations(accountId: number, limit: number): Promise<InboxConversation[]>;
  // Actualiza preview/hora/autor del último mensaje; si es entrante, también
  // last_inbound_at y no leídos, y reabre la conversación si estaba resuelta o archivada.
  // historical (historial de la app de WhatsApp Business): solo last_inbound_at, sin no leídos ni reabrir.
  recordActivity(
    conversationId: number,
    activity: { preview: string; at: number; inbound: boolean; author?: ActivityAuthor; historical?: boolean }
  ): Promise<void>;
  markConversationRead(id: number): Promise<void>;
  updateConversation(id: number, patch: ConversationPatch): Promise<void>;
  // Al renombrar o borrar una etiqueta / un atributo en Configuración.
  renameTag(accountId: number, from: string, to: string): Promise<void>;
  removeTag(accountId: number, name: string): Promise<void>;
  removeAttribute(accountId: number, key: string): Promise<void>;

  // Devuelve el id insertado, o null si el wamid ya existía (idempotencia del webhook).
  insertMessage(message: NewMessage): Promise<number | null>;
  getMessage(id: number): Promise<InboxMessage | null>;
  updateMessage(id: number, patch: MessagePatch): Promise<void>;
  // Aplica un webhook de estado respetando STATUS_RANK. Devuelve false si el wamid no existe o no avanzó.
  updateStatusByWamid(wamid: string, status: MessageStatus, error: StatusError | null): Promise<boolean>;
  // Mensajes con id > afterId en orden ascendente. Con afterId 0 trae los últimos `limit`.
  listMessages(conversationId: number, afterId: number, limit: number): Promise<InboxMessage[]>;
  recentOutboundStatuses(conversationId: number, limit: number): Promise<MessageStatusUpdate[]>;
  // Messenger avisa "leído hasta tal hora": marca leídos los salientes anteriores.
  markOutboundReadUntil(conversationId: number, untilUnix: number): Promise<void>;

  // Comentarios editados / borrados por su autor. Devuelven false si el comentario no está guardado.
  editMessageByWamid(wamid: string, body: string, at: number): Promise<boolean>;
  markDeletedByWamid(wamid: string, at: number): Promise<boolean>;
  // ¿Ya se respondió por privado este comentario? (Meta permite una sola vez)
  hasPrivateReply(commentId: string): Promise<boolean>;
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
