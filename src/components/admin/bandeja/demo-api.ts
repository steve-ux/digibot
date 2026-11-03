// InboxApi del modo demo: todo pasa en memoria del navegador, con las mismas
// reglas que el servidor (acciones de conversación compartidas, ventana de 24 h)
// y un "Enviado → Leído" simulado. Se pierde al recargar la página.

import { addInternalNote, applyConversationAction } from "@/lib/crm/conversation-actions";
import { buildDemoStore, DEMO_TEAMMATES, DEMO_TEMPLATES } from "@/lib/crm/demo-data";
import { replyAvailability } from "@/lib/crm/reply-window";
import { isCommentChannel } from "@/lib/crm/channels";
import type { Actor } from "@/lib/crm/conversation-actions";
import type { MemoryInboxStore } from "@/lib/wa-inbox/memory-store";
import { renderTemplateText } from "@/lib/wa-inbox/types";
import { ApiError, type InboxApi, type SendResponse } from "./api";
import type { TeamMember } from "./utils";
import { getDemoSettings } from "@/components/crm/demo-settings";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowUnix = () => Math.floor(Date.now() / 1000);

let instance: { key: string; api: InboxApi; store: MemoryInboxStore } | null = null;

export function demoTeam(me: TeamMember): TeamMember[] {
  return [me, ...DEMO_TEAMMATES];
}

function ensure(me: TeamMember, accountId: number) {
  const key = `${me.id}:${me.name}:${accountId}`;
  if (!instance || instance.key !== key) {
    const store = buildDemoStore(me.name, accountId);
    instance = { key, store, api: createDemoApi(me, accountId, store) };
  }
  return instance;
}

export function getDemoApi(me: TeamMember, accountId: number): InboxApi {
  return ensure(me, accountId).api;
}

// Configuración (en demo) renombra o borra etiquetas sobre las mismas conversaciones.
export function getDemoInboxStore(me: TeamMember, accountId: number): MemoryInboxStore {
  return ensure(me, accountId).store;
}

function createDemoApi(me: TeamMember, accountId: number, store: MemoryInboxStore): InboxApi {
  const actor: Actor = { id: me.id, name: me.name };
  const team: Actor[] = demoTeam(me);

  // Simula los webhooks de estado de Meta.
  const simulateDelivery = (messageId: number) => {
    setTimeout(() => store.updateMessage(messageId, { status: "delivered" }), 900);
    setTimeout(() => store.updateMessage(messageId, { status: "read" }), 1900);
  };

  const outgoing = async (
    conversationId: number,
    body: string,
    type: string,
    templateName: string | null = null
  ): Promise<SendResponse> => {
    const at = nowUnix();
    const id = await store.insertMessage({
      conversationId,
      wamid: null,
      direction: "out",
      author: "agent",
      authorName: me.name,
      type,
      body,
      templateName,
      status: "sent",
      messageAt: at,
    });
    if (id === null) throw new Error("demo");
    await store.recordActivity(conversationId, { preview: body, at, inbound: false, author: "agent" });
    simulateDelivery(id);
    return { saved: await store.getMessage(id), error: null };
  };

  return {
    demo: true,

    async listConversations() {
      return store.listConversations(accountId, 500);
    },

    async loadMessages(conversationId, afterId) {
      await store.markConversationRead(conversationId);
      const conversation = await store.getConversation(conversationId);
      if (!conversation) throw new ApiError("La conversación no existe.", "not_found");
      const [messages, statuses] = await Promise.all([
        store.listMessages(conversationId, afterId, 200),
        store.recentOutboundStatuses(conversationId, 50),
      ]);
      return { conversation, messages, statuses };
    },

    async send(conversationId, payload) {
      await wait(350);
      const conversation = await store.getConversation(conversationId);
      if (!conversation) return { saved: null, error: { code: "not_found", message: "La conversación no existe." } };

      switch (payload.type) {
        case "note": {
          const saved = await addInternalNote(store, conversationId, payload.body, actor);
          return { saved, error: null };
        }
        case "retry": {
          await store.updateMessage(payload.messageId, { status: "sent", errorCode: null, errorTitle: null });
          simulateDelivery(payload.messageId);
          return { saved: await store.getMessage(payload.messageId), error: null };
        }
        case "template": {
          const template = DEMO_TEMPLATES.find((t) => t.name === payload.name);
          if (!template) return { saved: null, error: { code: "template_not_found", message: "La plantilla no existe." } };
          const params = Object.fromEntries(payload.bodyParams.map((v, i) => [String(i + 1), v]));
          return outgoing(conversationId, renderTemplateText(template.body, params), "template", template.name);
        }
        case "text": {
          const type =
            isCommentChannel(conversation.channel)
              ? payload.replyMode === "private"
                ? "private_reply"
                : "comment_reply"
              : "text";
          const kind = type === "comment_reply" ? "comment_public" : type === "private_reply" ? "comment_private" : "message";
          const availability = replyAvailability(conversation, kind);
          if (!availability.allowed) {
            return { saved: null, error: { code: "window_closed", message: availability.reason ?? "" } };
          }
          return outgoing(conversationId, payload.body.trim(), type);
        }
      }
    },

    async act(conversationId, action) {
      await wait(250);
      const settings = await getDemoSettings(accountId);
      const [labels, attributes] = await Promise.all([settings.listLabels(accountId), settings.listAttributes(accountId)]);
      return applyConversationAction(store, conversationId, action, actor, {
        team,
        labels: labels.map((l) => l.name),
        attributes,
      });
    },

    async templates() {
      await wait(300);
      return DEMO_TEMPLATES;
    },
  };
}
