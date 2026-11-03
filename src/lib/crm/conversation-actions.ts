// Acciones del panel sobre una conversación (resolver, tomar, asignar…) y notas
// internas. Server-only. Recibe el store para poder testearse en memoria.

import type { ConversationPatch, InboxStore } from "../wa-inbox/store";
import type { InboxConversation, InboxMessage } from "../wa-inbox/types";
import type { CrmUser } from "./session";

export type ConversationAction =
  | { action: "resolve" }
  | { action: "reopen" }
  | { action: "take" }
  | { action: "release" }
  | { action: "assign"; assigneeId: number | null }
  | { action: "tags"; tags: string[] }
  | { action: "note"; note: string };

// Avisos del sistema que quedan en el historial del chat. El texto se guarda en
// tercera persona; la UI lo reescribe en segunda ("Tomaste…") si lo hizo quien mira.
export const SYSTEM_EVENTS = {
  take: (name: string) => `${name} tomó la conversación · DigiBot en pausa en este chat`,
  release: () => "DigiBot volvió a responder",
  resolve: (name: string) => `${name} resolvió la conversación`,
  reopen: (name: string) => `${name} reabrió la conversación`,
} as const;

export type SystemEvent = keyof typeof SYSTEM_EVENTS;

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 40;
export const MAX_NOTE_LENGTH = 2000;

export class ConversationActionError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number
  ) {
    super(message);
  }
}

export function parseConversationAction(body: unknown): ConversationAction | null {
  const data = body as Record<string, unknown> | null;
  switch (data?.action) {
    case "resolve":
    case "reopen":
    case "take":
    case "release":
      return { action: data.action };
    case "assign": {
      const id = data.assigneeId;
      if (id === null) return { action: "assign", assigneeId: null };
      return typeof id === "number" && Number.isInteger(id) && id > 0 ? { action: "assign", assigneeId: id } : null;
    }
    case "tags": {
      const tags = data.tags;
      if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) return null;
      return { action: "tags", tags: tags as string[] };
    }
    case "note":
      return typeof data.note === "string" ? { action: "note", note: data.note } : null;
    default:
      return null;
  }
}

async function addSystemMessage(store: InboxStore, conversationId: number, event: SystemEvent, actor: CrmUser) {
  const id = await store.insertMessage({
    conversationId,
    wamid: null,
    direction: "internal",
    author: "system",
    authorName: actor.name,
    type: `system:${event}`,
    body: SYSTEM_EVENTS[event](actor.name),
    status: "sent",
    messageAt: Math.floor(Date.now() / 1000),
  });
  return id === null ? null : store.getMessage(id);
}

export async function applyConversationAction(
  store: InboxStore,
  conversationId: number,
  input: ConversationAction,
  actor: CrmUser,
  team: CrmUser[]
): Promise<{ conversation: InboxConversation; message: InboxMessage | null }> {
  const current = await store.getConversation(conversationId);
  if (!current) throw new ConversationActionError("La conversación no existe.", 404);

  let patch: ConversationPatch = {};
  let event: SystemEvent | null = null;

  switch (input.action) {
    case "resolve":
      if (current.status === "resolved") break;
      patch = { status: "resolved" };
      event = "resolve";
      break;
    case "reopen":
      if (current.status === "open") break;
      patch = { status: "open" };
      event = "reopen";
      break;
    case "take":
      // Pausa la IA solo en este chat y se la asigna a quien la toma.
      patch = { botActive: false, assigneeId: actor.id, status: "open" };
      event = current.botActive || current.assigneeId !== actor.id ? "take" : null;
      break;
    case "release":
      if (current.botActive) break;
      patch = { botActive: true };
      event = "release";
      break;
    case "assign":
      if (input.assigneeId !== null && !team.some((u) => u.id === input.assigneeId)) {
        throw new ConversationActionError("Esa persona no está en el equipo.", 400);
      }
      patch = { assigneeId: input.assigneeId };
      break;
    case "tags": {
      const tags = Array.from(new Set(input.tags.map((t) => t.trim()).filter(Boolean)));
      if (tags.length > MAX_TAGS || tags.some((t) => t.length > MAX_TAG_LENGTH)) {
        throw new ConversationActionError(
          `Hasta ${MAX_TAGS} etiquetas de ${MAX_TAG_LENGTH} caracteres como máximo.`,
          400
        );
      }
      patch = { tags };
      break;
    }
    case "note":
      if (input.note.length > MAX_NOTE_LENGTH) {
        throw new ConversationActionError(`La nota no puede superar los ${MAX_NOTE_LENGTH} caracteres.`, 400);
      }
      patch = { note: input.note };
      break;
  }

  await store.updateConversation(conversationId, patch);
  const message = event ? await addSystemMessage(store, conversationId, event, actor) : null;
  const conversation = await store.getConversation(conversationId);
  if (!conversation) throw new ConversationActionError("La conversación no existe.", 404);
  return { conversation, message };
}

// Nota interna en el chat: la ve solo el equipo, nunca se envía al cliente.
export async function addInternalNote(store: InboxStore, conversationId: number, text: string, actor: CrmUser) {
  const body = text.trim();
  if (!body) throw new ConversationActionError("La nota está vacía.", 400);
  if (body.length > MAX_NOTE_LENGTH) {
    throw new ConversationActionError(`La nota no puede superar los ${MAX_NOTE_LENGTH} caracteres.`, 400);
  }
  if (!(await store.getConversation(conversationId))) {
    throw new ConversationActionError("La conversación no existe.", 404);
  }
  const id = await store.insertMessage({
    conversationId,
    wamid: null,
    direction: "internal",
    author: "note",
    authorName: actor.name,
    type: "note",
    body,
    status: "sent",
    messageAt: Math.floor(Date.now() / 1000),
  });
  if (id === null) throw new Error("No se pudo guardar la nota.");
  const saved = await store.getMessage(id);
  if (!saved) throw new Error("No se encontró la nota recién guardada.");
  return saved;
}
