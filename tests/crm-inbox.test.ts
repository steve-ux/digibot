import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConversationActionError,
  addInternalNote,
  applyConversationAction,
  parseConversationAction,
} from "@/lib/crm/conversation-actions";
import { humanizeSendError } from "@/lib/crm/meta-errors";
import type { CrmUser } from "@/lib/crm/session";
import { MemoryInboxStore } from "@/lib/wa-inbox/memory-store";
import { InboxSendError, retryFromInbox } from "@/lib/wa-inbox/send";
import { CUSTOMER_WA_ID, PHONE_NUMBER_ID } from "./helpers/payloads";

const ME: CrmUser = { id: 1, name: "Esteban Maldonado", role: "admin" };
const SOFIA: CrmUser = { id: 2, name: "Sofía Rivas", role: "agent" };
const TEAM = [ME, SOFIA];
const now = () => Math.floor(Date.now() / 1000);

let store: MemoryInboxStore;

async function newConversation() {
  const id = await store.upsertConversation(PHONE_NUMBER_ID, CUSTOMER_WA_ID, "Juan Pérez");
  await store.recordActivity(id, { preview: "Hola", at: now() - 60, inbound: true });
  return id;
}

beforeEach(() => {
  store = new MemoryInboxStore();
});

describe("applyConversationAction", () => {
  it("tomar la conversación pausa la IA, la asigna y deja un aviso en el chat", async () => {
    const id = await newConversation();
    await store.updateConversation(id, { botActive: true });

    const { conversation, message } = await applyConversationAction(store, id, { action: "take" }, ME, TEAM);

    expect(conversation).toMatchObject({ botActive: false, assigneeId: ME.id, status: "open" });
    expect(message).toMatchObject({
      direction: "internal",
      author: "system",
      type: "system:take",
      authorName: ME.name,
      body: "Esteban Maldonado tomó la conversación · DigiBot en pausa en este chat",
    });
  });

  it("devolver a DigiBot reactiva la IA", async () => {
    const id = await newConversation();
    const { conversation, message } = await applyConversationAction(store, id, { action: "release" }, ME, TEAM);
    expect(conversation.botActive).toBe(true);
    expect(message?.body).toBe("DigiBot volvió a responder");
  });

  it("resolver limpia los no leídos y reabrir vuelve a abierta", async () => {
    const id = await newConversation();
    expect((await store.getConversation(id))?.unreadCount).toBe(1);

    const resolved = await applyConversationAction(store, id, { action: "resolve" }, ME, TEAM);
    expect(resolved.conversation).toMatchObject({ status: "resolved", unreadCount: 0 });

    // Resolver dos veces no duplica el aviso.
    const again = await applyConversationAction(store, id, { action: "resolve" }, ME, TEAM);
    expect(again.message).toBeNull();

    const reopened = await applyConversationAction(store, id, { action: "reopen" }, ME, TEAM);
    expect(reopened.conversation.status).toBe("open");
  });

  it("asigna solo a personas del equipo", async () => {
    const id = await newConversation();
    const { conversation } = await applyConversationAction(store, id, { action: "assign", assigneeId: 2 }, ME, TEAM);
    expect(conversation.assigneeId).toBe(2);

    await expect(
      applyConversationAction(store, id, { action: "assign", assigneeId: 99 }, ME, TEAM)
    ).rejects.toBeInstanceOf(ConversationActionError);
  });

  it("normaliza las etiquetas (sin vacías ni repetidas) y guarda la nota del contacto", async () => {
    const id = await newConversation();
    const tagged = await applyConversationAction(
      store,
      id,
      { action: "tags", tags: ["Venta", " Venta ", "", "Turno"] },
      ME,
      TEAM
    );
    expect(tagged.conversation.tags).toEqual(["Venta", "Turno"]);

    const noted = await applyConversationAction(store, id, { action: "note", note: "Prefiere WhatsApp" }, ME, TEAM);
    expect(noted.conversation.note).toBe("Prefiere WhatsApp");
    expect(noted.message).toBeNull();
  });

  it("falla con 404 si la conversación no existe", async () => {
    await expect(applyConversationAction(store, 999, { action: "resolve" }, ME, TEAM)).rejects.toMatchObject({
      httpStatus: 404,
    });
  });
});

describe("parseConversationAction", () => {
  it("acepta solo acciones válidas", () => {
    expect(parseConversationAction({ action: "take" })).toEqual({ action: "take" });
    expect(parseConversationAction({ action: "assign", assigneeId: null })).toEqual({ action: "assign", assigneeId: null });
    expect(parseConversationAction({ action: "assign", assigneeId: "2" })).toBeNull();
    expect(parseConversationAction({ action: "tags", tags: ["a", 1] })).toBeNull();
    expect(parseConversationAction({ action: "borrar" })).toBeNull();
    expect(parseConversationAction(null)).toBeNull();
  });
});

describe("notas internas", () => {
  it("se guardan como internas y no cambian el preview de la lista", async () => {
    const id = await newConversation();
    const note = await addInternalNote(store, id, "  Ofrecerle 10% de descuento  ", ME);
    expect(note).toMatchObject({ direction: "internal", author: "note", body: "Ofrecerle 10% de descuento" });
    expect((await store.getConversation(id))?.lastMessagePreview).toBe("Hola");
  });

  it("rechaza notas vacías", async () => {
    const id = await newConversation();
    await expect(addInternalNote(store, id, "   ", ME)).rejects.toBeInstanceOf(ConversationActionError);
  });
});

describe("reapertura automática", () => {
  it("si el cliente escribe sobre una conversación resuelta, se reabre y cuenta una conversación más", async () => {
    const id = await newConversation();
    await applyConversationAction(store, id, { action: "resolve" }, ME, TEAM);

    await store.recordActivity(id, { preview: "Hola de nuevo", at: now(), inbound: true });

    expect(await store.getConversation(id)).toMatchObject({
      status: "open",
      sessionCount: 2,
      lastMessageAuthor: "customer",
    });
  });

  it("guarda quién escribió el último mensaje (para 'Vos:' y el filtro Sin responder)", async () => {
    const id = await newConversation();
    await store.recordActivity(id, { preview: "Te respondo", at: now(), inbound: false, author: "agent" });
    expect((await store.getConversation(id))?.lastMessageAuthor).toBe("agent");
  });
});

describe("retryFromInbox", () => {
  beforeEach(() => {
    vi.stubEnv("DB_HOST", "");
    vi.stubEnv("WHATSAPP_WABA_ID", "102290129340398");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("META_GRAPH_API_VERSION", "v23.0");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function failedMessage(conversationId: number, type = "text") {
    const id = await store.insertMessage({
      conversationId,
      wamid: null,
      direction: "out",
      type,
      body: "Test exitoso",
      status: "failed",
      errorCode: 131030,
      errorTitle: "Recipient phone number not in allowed list",
      messageAt: now(),
    });
    return id!;
  }

  it("reenvía el mismo mensaje (no lo duplica) y limpia el error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.retry" }] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const conversationId = await newConversation();
    const messageId = await failedMessage(conversationId);

    const { saved, error } = await retryFromInbox(conversationId, messageId, { store });

    expect(error).toBeNull();
    expect(saved).toMatchObject({ id: messageId, status: "sent", wamid: "wamid.retry", errorCode: null });
    expect(store.messages.filter((m) => m.direction === "out")).toHaveLength(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ type: "text", text: { body: "Test exitoso" } });
  });

  it("no reintenta plantillas (la UI abre el selector) ni mensajes que no fallaron", async () => {
    const conversationId = await newConversation();
    const template = await failedMessage(conversationId, "template");
    await expect(retryFromInbox(conversationId, template, { store })).rejects.toBeInstanceOf(InboxSendError);
  });

  it("con la ventana cerrada pide plantilla", async () => {
    const conversationId = await store.upsertConversation(PHONE_NUMBER_ID, CUSTOMER_WA_ID, "Juan");
    await store.recordActivity(conversationId, { preview: "Hola", at: now() - 25 * 3600, inbound: true });
    const messageId = await failedMessage(conversationId);
    await expect(retryFromInbox(conversationId, messageId, { store })).rejects.toMatchObject({ code: "window_closed" });
  });
});

describe("humanizeSendError", () => {
  it("traduce los códigos conocidos de WhatsApp sin mostrar el texto de Meta", () => {
    expect(humanizeSendError(131030).message).toMatch(/números permitidos/);
    expect(humanizeSendError(131047)).toMatchObject({ needsTemplate: true, retryable: false });
    expect(humanizeSendError(131026).message).toMatch(/no tenga WhatsApp/);
    expect(humanizeSendError(190).message).toMatch(/Canales/);
  });

  it("usa un mensaje genérico para códigos desconocidos", () => {
    const human = humanizeSendError(999999, "wa", "Some raw Meta error");
    expect(human.message).not.toMatch(/raw Meta/);
    expect(human.retryable).toBe(true);
  });

  it("los errores propios (sin código) muestran el texto del servidor", () => {
    expect(humanizeSendError(null, "wa", "No se pudo conectar con la API de Meta.").message).toBe(
      "No se pudo conectar con la API de Meta."
    );
  });

  it("Messenger/Instagram usan su propia tabla y el subcódigo", () => {
    expect(humanizeSendError(10, "ig", null, 2018278).message).toMatch(/24 h/);
    expect(humanizeSendError(551, "fb").message).toMatch(/no está disponible/);
  });
});
