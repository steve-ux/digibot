// Implementación MySQL de InboxStore sobre las tablas web_wa_conversations y
// web_wa_messages (ver db/migrations/0004_web_wa_inbox.sql). Server-only.

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "../db";
import type { ChannelId } from "../crm/channels";
import type {
  ActivityAuthor,
  ConversationIdentity,
  ConversationPatch,
  InboxStore,
  MessagePatch,
  NewMessage,
  StatusError,
} from "./store";
import type {
  ConversationStatus,
  InboxConversation,
  InboxMessage,
  InboxPost,
  MessageAuthor,
  MessageDirection,
  MessageStatus,
  MessageStatusUpdate,
} from "./types";

const CONVERSATION_COLUMNS = `
  id, channel, phone_number_id, wa_id, contact_name, handle, post, last_message_preview, last_message_author,
  unread_count, status, bot_active, assignee_id, tags, note, session_count,
  UNIX_TIMESTAMP(created_at) AS created_ts,
  UNIX_TIMESTAMP(last_message_at) AS last_message_ts,
  UNIX_TIMESTAMP(last_inbound_at) AS last_inbound_ts,
  GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), last_inbound_at + INTERVAL 24 HOUR), 0)) AS window_seconds_left`;

const MESSAGE_COLUMNS = `
  id, conversation_id, wamid, direction, author, author_name, type, body, template_name, status,
  error_code, error_title, UNIX_TIMESTAMP(message_at) AS message_ts`;

interface ConversationRow extends RowDataPacket {
  id: number;
  channel: ChannelId;
  phone_number_id: string;
  wa_id: string;
  contact_name: string | null;
  handle: string | null;
  post: unknown;
  last_message_preview: string | null;
  last_message_author: ActivityAuthor | null;
  unread_count: number;
  status: ConversationStatus;
  bot_active: number;
  assignee_id: number | null;
  tags: unknown;
  note: string | null;
  session_count: number;
  created_ts: number | string;
  last_message_ts: number | string | null;
  last_inbound_ts: number | string | null;
  window_seconds_left: number | string;
}

interface MessageRow extends RowDataPacket {
  id: number;
  conversation_id: number;
  wamid: string | null;
  direction: MessageDirection;
  author: MessageAuthor | null;
  author_name: string | null;
  type: string;
  body: string | null;
  template_name: string | null;
  status: MessageStatus;
  error_code: number | null;
  error_title: string | null;
  message_ts: number | string;
}

function toNumberOrNull(value: number | string | null) {
  return value === null ? null : Number(value);
}

// mysql2 devuelve las columnas JSON ya parseadas, pero por las dudas se acepta string.
function parseTags(value: unknown): string[] {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
}

function parsePost(value: unknown): InboxPost | null {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<InboxPost>;
  return {
    mediaId: p.mediaId,
    caption: p.caption ?? "",
    likes: Number(p.likes) || 0,
    comments: Number(p.comments) || 0,
    thumbnailUrl: p.thumbnailUrl ?? null,
    permalink: p.permalink ?? null,
  };
}

function defaultAuthor(direction: MessageDirection): MessageAuthor {
  if (direction === "in") return "customer";
  if (direction === "out") return "agent";
  return "system";
}

function mapConversation(row: ConversationRow): InboxConversation {
  return {
    id: row.id,
    channel: row.channel ?? "wa",
    phoneNumberId: row.phone_number_id,
    waId: row.wa_id,
    contactName: row.contact_name,
    handle: row.handle ?? null,
    post: parsePost(row.post),
    lastMessagePreview: row.last_message_preview,
    lastMessageAuthor: row.last_message_author ?? null,
    lastMessageAt: toNumberOrNull(row.last_message_ts),
    lastInboundAt: toNumberOrNull(row.last_inbound_ts),
    unreadCount: row.unread_count,
    windowSecondsLeft: Number(row.window_seconds_left),
    status: row.status ?? "open",
    botActive: Boolean(row.bot_active),
    assigneeId: row.assignee_id ?? null,
    tags: parseTags(row.tags),
    note: row.note ?? "",
    createdAt: Number(row.created_ts),
    sessionCount: Number(row.session_count) || 1,
  };
}

function mapMessage(row: MessageRow): InboxMessage {
  return {
    id: Number(row.id),
    conversationId: row.conversation_id,
    wamid: row.wamid,
    direction: row.direction,
    author: row.author ?? defaultAuthor(row.direction),
    authorName: row.author_name,
    type: row.type,
    body: row.body,
    templateName: row.template_name,
    status: row.status,
    errorCode: row.error_code,
    errorTitle: row.error_title,
    messageAt: Number(row.message_ts),
  };
}

function truncate(value: string | null | undefined, max: number) {
  if (value == null) return null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export class MySqlInboxStore implements InboxStore {
  async upsertConversation(
    accountId: string,
    contactId: string,
    contactName: string | null,
    identity: ConversationIdentity = {}
  ) {
    // LAST_INSERT_ID(id) hace que insertId devuelva el id también cuando la fila ya existía.
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO web_wa_conversations (channel, phone_number_id, wa_id, contact_name, handle, post)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         contact_name = COALESCE(VALUES(contact_name), contact_name),
         handle = COALESCE(VALUES(handle), handle),
         post = COALESCE(VALUES(post), post),
         id = LAST_INSERT_ID(id)`,
      [
        identity.channel ?? "wa",
        accountId,
        contactId,
        truncate(contactName, 191),
        truncate(identity.handle ?? null, 191),
        identity.post ? JSON.stringify(identity.post) : null,
      ]
    );
    return result.insertId;
  }

  async getConversation(id: number) {
    const [rows] = await getPool().query<ConversationRow[]>(
      `SELECT ${CONVERSATION_COLUMNS} FROM web_wa_conversations WHERE id = ?`,
      [id]
    );
    return rows[0] ? mapConversation(rows[0]) : null;
  }

  async findConversationId(channel: ChannelId, accountId: string, contactId: string) {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT id FROM web_wa_conversations WHERE channel = ? AND phone_number_id = ? AND wa_id = ? LIMIT 1`,
      [channel, accountId, contactId]
    );
    return rows[0] ? Number(rows[0].id) : null;
  }

  async listConversations(limit: number) {
    const [rows] = await getPool().query<ConversationRow[]>(
      `SELECT ${CONVERSATION_COLUMNS}
       FROM web_wa_conversations
       ORDER BY last_message_at IS NULL, last_message_at DESC, id DESC
       LIMIT ?`,
      [limit]
    );
    return rows.map(mapConversation);
  }

  async recordActivity(
    conversationId: number,
    activity: { preview: string; at: number; inbound: boolean; author?: ActivityAuthor }
  ) {
    // MySQL evalúa los SET de izquierda a derecha con los valores ya actualizados:
    // el preview tiene que ir antes que last_message_at para comparar contra el valor viejo.
    // Así un mensaje viejo que llega tarde no pisa el preview del más reciente.
    const isNewer = "(last_message_at IS NULL OR FROM_UNIXTIME(?) >= last_message_at)";
    // Si el cliente escribe sobre una conversación resuelta, se reabre sola (y cuenta
    // como una conversación nueva del contacto): session_count va antes que status.
    const inboundSql = activity.inbound
      ? `, last_inbound_at = IF(last_inbound_at IS NULL OR FROM_UNIXTIME(?) > last_inbound_at, FROM_UNIXTIME(?), last_inbound_at),
         unread_count = unread_count + 1,
         session_count = session_count + IF(status = 'resolved', 1, 0),
         status = 'open',
         resolved_at = NULL`
      : "";
    const author: ActivityAuthor = activity.author ?? (activity.inbound ? "customer" : "agent");
    const params: unknown[] = [
      activity.at,
      truncate(activity.preview, 255),
      activity.at,
      author,
      activity.at,
      activity.at,
    ];
    if (activity.inbound) params.push(activity.at, activity.at);
    params.push(conversationId);

    await getPool().query(
      `UPDATE web_wa_conversations SET
         last_message_preview = IF(${isNewer}, ?, last_message_preview),
         last_message_author = IF(${isNewer}, ?, last_message_author),
         last_message_at = IF(${isNewer}, FROM_UNIXTIME(?), last_message_at)
         ${inboundSql}
       WHERE id = ?`,
      params
    );
  }

  async markConversationRead(id: number) {
    await getPool().query(
      `UPDATE web_wa_conversations SET unread_count = 0 WHERE id = ? AND unread_count > 0`,
      [id]
    );
  }

  async updateConversation(id: number, patch: ConversationPatch) {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.status !== undefined) {
      sets.push("status = ?", "resolved_at = IF(? = 'resolved', NOW(), NULL)");
      params.push(patch.status, patch.status);
      if (patch.status === "resolved") sets.push("unread_count = 0");
    }
    if (patch.botActive !== undefined) {
      sets.push("bot_active = ?");
      params.push(patch.botActive ? 1 : 0);
    }
    if (patch.assigneeId !== undefined) {
      sets.push("assignee_id = ?");
      params.push(patch.assigneeId);
    }
    if (patch.tags !== undefined) {
      sets.push("tags = ?");
      params.push(JSON.stringify(patch.tags));
    }
    if (patch.note !== undefined) {
      sets.push("note = ?");
      params.push(patch.note);
    }
    if (sets.length === 0) return;
    params.push(id);
    await getPool().query(`UPDATE web_wa_conversations SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async insertMessage(message: NewMessage) {
    // "id = id" en el duplicado deja affectedRows en 0 sin tragarse otros errores
    // (a diferencia de INSERT IGNORE).
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO web_wa_messages
         (conversation_id, wamid, direction, author, author_name, type, body, template_name, status,
          error_code, error_title, raw_payload, message_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))
       ON DUPLICATE KEY UPDATE id = id`,
      [
        message.conversationId,
        message.wamid,
        message.direction,
        message.author ?? defaultAuthor(message.direction),
        truncate(message.authorName ?? null, 191),
        message.type,
        message.body,
        message.templateName ?? null,
        message.status,
        message.errorCode ?? null,
        truncate(message.errorTitle, 255),
        message.rawPayload === undefined ? null : JSON.stringify(message.rawPayload),
        message.messageAt,
      ]
    );
    return result.affectedRows === 1 ? result.insertId : null;
  }

  async getMessage(id: number) {
    const [rows] = await getPool().query<MessageRow[]>(
      `SELECT ${MESSAGE_COLUMNS} FROM web_wa_messages WHERE id = ?`,
      [id]
    );
    return rows[0] ? mapMessage(rows[0]) : null;
  }

  async updateMessage(id: number, patch: MessagePatch) {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.wamid !== undefined) {
      sets.push("wamid = ?");
      params.push(patch.wamid);
    }
    if (patch.status !== undefined) {
      sets.push("status = ?");
      params.push(patch.status);
    }
    if (patch.errorCode !== undefined) {
      sets.push("error_code = ?");
      params.push(patch.errorCode);
    }
    if (patch.errorTitle !== undefined) {
      sets.push("error_title = ?");
      params.push(truncate(patch.errorTitle, 255));
    }
    if (patch.rawPayload !== undefined) {
      sets.push("raw_payload = ?");
      params.push(JSON.stringify(patch.rawPayload));
    }
    if (sets.length === 0) return;

    params.push(id);
    await getPool().query(`UPDATE web_wa_messages SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async updateStatusByWamid(wamid: string, status: MessageStatus, error: StatusError | null) {
    if (status === "failed") {
      const [result] = await getPool().query<ResultSetHeader>(
        `UPDATE web_wa_messages SET status = 'failed', error_code = ?, error_title = ? WHERE wamid = ?`,
        [error?.code ?? null, truncate(error?.title, 255), wamid]
      );
      return result.affectedRows > 0;
    }

    // Mismo orden que STATUS_RANK en types.ts: solo se avanza, nunca se retrocede.
    const [result] = await getPool().query<ResultSetHeader>(
      `UPDATE web_wa_messages SET status = ?
       WHERE wamid = ?
         AND status IN ('sending', 'sent', 'delivered')
         AND FIELD(status, 'sending', 'sent', 'delivered', 'read') < FIELD(?, 'sending', 'sent', 'delivered', 'read')`,
      [status, wamid, status]
    );
    return result.affectedRows > 0;
  }

  async listMessages(conversationId: number, afterId: number, limit: number) {
    if (afterId > 0) {
      const [rows] = await getPool().query<MessageRow[]>(
        `SELECT ${MESSAGE_COLUMNS} FROM web_wa_messages
         WHERE conversation_id = ? AND id > ?
         ORDER BY id ASC
         LIMIT ?`,
        [conversationId, afterId, limit]
      );
      return rows.map(mapMessage);
    }

    const [rows] = await getPool().query<MessageRow[]>(
      `SELECT ${MESSAGE_COLUMNS} FROM web_wa_messages
       WHERE conversation_id = ?
       ORDER BY id DESC
       LIMIT ?`,
      [conversationId, limit]
    );
    return rows.map(mapMessage).reverse();
  }

  async markOutboundReadUntil(conversationId: number, untilUnix: number) {
    await getPool().query(
      `UPDATE web_wa_messages SET status = 'read'
       WHERE conversation_id = ? AND direction = 'out'
         AND status IN ('sending', 'sent', 'delivered')
         AND message_at <= FROM_UNIXTIME(?)`,
      [conversationId, untilUnix]
    );
  }

  async recentOutboundStatuses(conversationId: number, limit: number) {
    const [rows] = await getPool().query<MessageRow[]>(
      `SELECT ${MESSAGE_COLUMNS} FROM web_wa_messages
       WHERE conversation_id = ? AND direction = 'out'
       ORDER BY id DESC
       LIMIT ?`,
      [conversationId, limit]
    );
    return rows.map((row): MessageStatusUpdate => {
      const m = mapMessage(row);
      return { id: m.id, wamid: m.wamid, status: m.status, errorCode: m.errorCode, errorTitle: m.errorTitle };
    });
  }
}
