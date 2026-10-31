// InboxStore en memoria para tests: misma semántica que MySqlInboxStore
// (idempotencia por wamid, estados que solo avanzan, ventana de 24 h).

import type { InboxStore, MessagePatch, NewMessage, StatusError } from "@/lib/wa-inbox/store";
import {
  STATUS_RANK,
  WINDOW_SECONDS,
  type InboxConversation,
  type InboxMessage,
  type MessageStatus,
} from "@/lib/wa-inbox/types";

type StoredConversation = Omit<InboxConversation, "windowSecondsLeft">;
type StoredMessage = InboxMessage & { rawPayload: unknown };

const nowUnix = () => Math.floor(Date.now() / 1000);

export class MemoryInboxStore implements InboxStore {
  conversations: StoredConversation[] = [];
  messages: StoredMessage[] = [];

  private toConversation(c: StoredConversation): InboxConversation {
    const windowSecondsLeft =
      c.lastInboundAt === null ? 0 : Math.max(0, c.lastInboundAt + WINDOW_SECONDS - nowUnix());
    return { ...c, windowSecondsLeft };
  }

  private toMessage({ rawPayload: _raw, ...m }: StoredMessage): InboxMessage {
    return m;
  }

  async upsertConversation(phoneNumberId: string, waId: string, contactName: string | null) {
    const existing = this.conversations.find((c) => c.phoneNumberId === phoneNumberId && c.waId === waId);
    if (existing) {
      if (contactName) existing.contactName = contactName;
      return existing.id;
    }
    const conversation: StoredConversation = {
      id: this.conversations.length + 1,
      phoneNumberId,
      waId,
      contactName,
      lastMessagePreview: null,
      lastMessageAt: null,
      lastInboundAt: null,
      unreadCount: 0,
    };
    this.conversations.push(conversation);
    return conversation.id;
  }

  async getConversation(id: number) {
    const c = this.conversations.find((x) => x.id === id);
    return c ? this.toConversation(c) : null;
  }

  async listConversations(limit: number) {
    return [...this.conversations]
      .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0))
      .slice(0, limit)
      .map((c) => this.toConversation(c));
  }

  async recordActivity(conversationId: number, activity: { preview: string; at: number; inbound: boolean }) {
    const c = this.conversations.find((x) => x.id === conversationId);
    if (!c) return;
    if (c.lastMessageAt === null || activity.at >= c.lastMessageAt) {
      c.lastMessagePreview = activity.preview;
      c.lastMessageAt = activity.at;
    }
    if (activity.inbound) {
      if (c.lastInboundAt === null || activity.at > c.lastInboundAt) c.lastInboundAt = activity.at;
      c.unreadCount += 1;
    }
  }

  async markConversationRead(id: number) {
    const c = this.conversations.find((x) => x.id === id);
    if (c) c.unreadCount = 0;
  }

  async insertMessage(message: NewMessage) {
    if (message.wamid && this.messages.some((m) => m.wamid === message.wamid)) return null;
    const stored: StoredMessage = {
      id: this.messages.length + 1,
      conversationId: message.conversationId,
      wamid: message.wamid,
      direction: message.direction,
      type: message.type,
      body: message.body,
      templateName: message.templateName ?? null,
      status: message.status,
      errorCode: message.errorCode ?? null,
      errorTitle: message.errorTitle ?? null,
      messageAt: message.messageAt,
      rawPayload: message.rawPayload ?? null,
    };
    this.messages.push(stored);
    return stored.id;
  }

  async getMessage(id: number) {
    const m = this.messages.find((x) => x.id === id);
    return m ? this.toMessage(m) : null;
  }

  async updateMessage(id: number, patch: MessagePatch) {
    const m = this.messages.find((x) => x.id === id);
    if (!m) return;
    Object.assign(
      m,
      Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
    );
  }

  async updateStatusByWamid(wamid: string, status: MessageStatus, error: StatusError | null) {
    const m = this.messages.find((x) => x.wamid === wamid);
    if (!m) return false;
    if (status === "failed") {
      m.status = "failed";
      m.errorCode = error?.code ?? null;
      m.errorTitle = error?.title ?? null;
      return true;
    }
    if (m.status === "failed" || m.status === "received" || STATUS_RANK[m.status] >= STATUS_RANK[status]) {
      return false;
    }
    m.status = status;
    return true;
  }

  async listMessages(conversationId: number, afterId: number, limit: number) {
    const all = this.messages.filter((m) => m.conversationId === conversationId && m.id > afterId);
    const slice = afterId > 0 ? all.slice(0, limit) : all.slice(-limit);
    return slice.map((m) => this.toMessage(m));
  }

  async recentOutboundStatuses(conversationId: number, limit: number) {
    return this.messages
      .filter((m) => m.conversationId === conversationId && m.direction === "out")
      .slice(-limit)
      .reverse()
      .map(({ id, wamid, status, errorCode, errorTitle }) => ({ id, wamid, status, errorCode, errorTitle }));
  }
}
