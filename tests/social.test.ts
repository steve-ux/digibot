import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickErrorCode } from "@/lib/crm/meta-errors";
import { replyAvailability } from "@/lib/crm/reply-window";
import type { SocialAccount } from "@/lib/meta-social/accounts";
import { describeSocialMessage, processSocialWebhook } from "@/lib/meta-social/webhook";
import { MemoryInboxStore } from "@/lib/wa-inbox/memory-store";
import { InboxSendError, sendFromInbox } from "@/lib/wa-inbox/send";

const PAGE_ID = "111222333";
const IG_ID = "17841400000000000";
const PSID = "6543210987654321";
const IGSID = "1234567890123456";
const APP_ID = "999";
const now = () => Math.floor(Date.now() / 1000);

const FB_ACCOUNT: SocialAccount = {
  channel: "fb",
  accountId: PAGE_ID,
  pageId: PAGE_ID,
  displayName: "Óptica Sol",
  accessToken: "page-token",
  apiVersion: "v23.0",
  source: "env",
};
const IG_ACCOUNT: SocialAccount = { ...FB_ACCOUNT, channel: "ig", accountId: IG_ID, displayName: "@opticasol" };

let store: MemoryInboxStore;
let profile: ReturnType<typeof vi.fn>;
let media: ReturnType<typeof vi.fn>;

function deps() {
  return {
    store,
    appId: APP_ID,
    getAccount: async (channel: "ig" | "fb") => (channel === "fb" ? FB_ACCOUNT : IG_ACCOUNT),
    profile,
    media,
  };
}

const messenger = (messaging: unknown[]) => ({ object: "page", entry: [{ id: PAGE_ID, time: Date.now(), messaging }] });
const instagram = (entry: Record<string, unknown>) => ({ object: "instagram", entry: [{ id: IG_ID, time: now(), ...entry }] });

beforeEach(() => {
  store = new MemoryInboxStore();
  profile = vi.fn().mockResolvedValue({ name: "Carla Benítez", username: null });
  media = vi.fn().mockResolvedValue({
    mediaId: "M1",
    caption: "Nueva colección otoño",
    likes: 248,
    comments: 31,
    thumbnailUrl: "https://cdn/thumb.jpg",
    permalink: "https://instagram.com/p/x",
  });
});

describe("processSocialWebhook: Messenger", () => {
  it("crea la conversación fb, guarda el mensaje y busca el nombre del contacto", async () => {
    await processSocialWebhook(
      messenger([
        { sender: { id: PSID }, recipient: { id: PAGE_ID }, timestamp: Date.now(), message: { mid: "m_1", text: "Hola!" } },
      ]),
      deps()
    );

    const [conversation] = await store.listConversations(10);
    expect(conversation).toMatchObject({
      channel: "fb",
      phoneNumberId: PAGE_ID,
      waId: PSID,
      contactName: "Carla Benítez",
      unreadCount: 1,
      lastMessageAuthor: "customer",
    });
    expect(store.messages[0]).toMatchObject({ wamid: "m_1", direction: "in", body: "Hola!" });
    expect(profile).toHaveBeenCalledWith(FB_ACCOUNT, PSID);
  });

  it("es idempotente por mid (Meta reintenta)", async () => {
    const payload = messenger([
      { sender: { id: PSID }, recipient: { id: PAGE_ID }, timestamp: Date.now(), message: { mid: "m_1", text: "Hola" } },
    ]);
    await processSocialWebhook(payload, deps());
    await processSocialWebhook(payload, deps());
    expect(store.messages).toHaveLength(1);
    expect((await store.listConversations(1))[0].unreadCount).toBe(1);
  });

  it("ignora los ecos de esta app y guarda los escritos desde la app de Meta", async () => {
    await processSocialWebhook(
      messenger([
        { sender: { id: PAGE_ID }, recipient: { id: PSID }, timestamp: Date.now(), message: { mid: "m_own", text: "Desde el panel", is_echo: true, app_id: 999 } },
        { sender: { id: PAGE_ID }, recipient: { id: PSID }, timestamp: Date.now(), message: { mid: "m_app", text: "Desde Business Suite", is_echo: true, app_id: 123 } },
      ]),
      deps()
    );
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({ wamid: "m_app", direction: "out", author: "agent", authorName: "App de Messenger" });
  });

  it("actualiza entregado y leído (watermark) de los salientes", async () => {
    const conversationId = await store.upsertConversation(PAGE_ID, PSID, "Carla", { channel: "fb" });
    const sentAt = now() - 60;
    await store.insertMessage({ conversationId, wamid: "m_out", direction: "out", type: "text", body: "Hola", status: "sent", messageAt: sentAt });

    await processSocialWebhook(messenger([{ sender: { id: PSID }, recipient: { id: PAGE_ID }, delivery: { mids: ["m_out"] } }]), deps());
    expect(store.messages[0].status).toBe("delivered");

    await processSocialWebhook(
      messenger([{ sender: { id: PSID }, recipient: { id: PAGE_ID }, read: { watermark: Date.now() } }]),
      deps()
    );
    expect(store.messages[0].status).toBe("read");
  });

  it("describe los adjuntos con un texto legible", () => {
    expect(describeSocialMessage({ mid: "x", attachments: [{ type: "image" }] })).toBe("[imagen]");
    expect(describeSocialMessage({ mid: "x", text: "mirá", attachments: [{ type: "share" }] })).toBe(
      "[publicación compartida] mirá"
    );
    expect(describeSocialMessage({ mid: "x", text: "jaja", reply_to: { story: { id: "s" } } })).toBe(
      "[respuesta a tu historia] jaja"
    );
  });
});

describe("processSocialWebhook: Instagram", () => {
  it("los DMs van al canal ig con @usuario", async () => {
    profile.mockResolvedValue({ name: "Martina Gómez", username: "martu.gomez" });
    await processSocialWebhook(
      instagram({
        messaging: [{ sender: { id: IGSID }, recipient: { id: IG_ID }, timestamp: Date.now(), message: { mid: "ig_1", text: "Precio?" } }],
      }),
      deps()
    );
    expect((await store.listConversations(1))[0]).toMatchObject({
      channel: "ig",
      waId: IGSID,
      contactName: "Martina Gómez",
      handle: "@martu.gomez",
    });
  });

  it("cada comentario abre un hilo igc por persona y publicación, con los datos del post", async () => {
    const comment = (id: string, text: string) =>
      instagram({
        changes: [
          {
            field: "comments",
            value: { id, text, from: { id: "U1", username: "nico_ruiz" }, media: { id: "M1", media_product_type: "FEED" } },
          },
        ],
      });

    await processSocialWebhook(comment("C1", "Precio de la segunda foto?"), deps());
    await processSocialWebhook(comment("C2", "Y en negro?"), deps());

    const conversations = await store.listConversations(10);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      channel: "igc",
      waId: "U1:M1",
      handle: "@nico_ruiz",
      post: { caption: "Nueva colección otoño", likes: 248, thumbnailUrl: "https://cdn/thumb.jpg" },
    });
    expect(store.messages.map((m) => [m.type, m.wamid])).toEqual([
      ["comment", "C1"],
      ["comment", "C2"],
    ]);
    // La publicación se pide una sola vez.
    expect(media).toHaveBeenCalledTimes(1);
  });

  it("ignora los comentarios de la propia cuenta", async () => {
    await processSocialWebhook(
      instagram({
        changes: [{ field: "comments", value: { id: "C9", text: "¡Gracias!", from: { id: IG_ID }, media: { id: "M1" } } }],
      }),
      deps()
    );
    expect(store.conversations).toHaveLength(0);
  });
});

describe("envío por Messenger e Instagram", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const getAccount = async (channel: "ig" | "fb") => (channel === "fb" ? FB_ACCOUNT : IG_ACCOUNT);

  beforeEach(() => {
    // Un Response nuevo por llamada (el body se puede leer una sola vez).
    fetchMock = vi.fn().mockImplementation(
      async () => new Response(JSON.stringify({ message_id: "m_sent", id: "C_reply" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function fbConversation(lastInboundSecondsAgo: number) {
    const id = await store.upsertConversation(PAGE_ID, PSID, "Carla", { channel: "fb" });
    await store.recordActivity(id, { preview: "Hola", at: now() - lastInboundSecondsAgo, inbound: true });
    return id;
  }

  it("dentro de las 24 h manda un DM con messaging_type RESPONSE", async () => {
    const id = await fbConversation(60);
    const { saved, error } = await sendFromInbox(id, { type: "text", body: "¡Hola Carla!" }, { store, getAccount });

    expect(error).toBeNull();
    expect(saved).toMatchObject({ status: "sent", wamid: "m_sent", type: "text" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://graph.facebook.com/v23.0/${PAGE_ID}/messages`);
    expect(JSON.parse(init.body)).toEqual({
      recipient: { id: PSID },
      messaging_type: "RESPONSE",
      message: { text: "¡Hola Carla!" },
    });
  });

  it("entre 24 h y 7 días usa la etiqueta HUMAN_AGENT", async () => {
    const id = await fbConversation(30 * 3600);
    await sendFromInbox(id, { type: "text", body: "Te respondo yo" }, { store, getAccount });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
  });

  it("después de 7 días no deja enviar", async () => {
    const id = await fbConversation(8 * 24 * 3600);
    await expect(sendFromInbox(id, { type: "text", body: "Hola" }, { store, getAccount })).rejects.toMatchObject({
      code: "window_closed",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("los comentarios se responden en público o por privado al último comentario", async () => {
    const id = await store.upsertConversation(IG_ID, "U1:M1", null, { channel: "igc", handle: "@nico" });
    await store.insertMessage({ conversationId: id, wamid: "C1", direction: "in", type: "comment", body: "Precio?", status: "received", messageAt: now() - 60 });
    await store.recordActivity(id, { preview: "Precio?", at: now() - 60, inbound: true });

    const pub = await sendFromInbox(id, { type: "text", body: "Te escribimos", replyMode: "public" }, { store, getAccount });
    expect(pub.saved).toMatchObject({ type: "comment_reply", wamid: "C_reply" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://graph.facebook.com/v23.0/C1/replies");

    const priv = await sendFromInbox(id, { type: "text", body: "Sale $52.000", replyMode: "private" }, { store, getAccount });
    expect(priv.saved).toMatchObject({ type: "private_reply", wamid: "m_sent" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ recipient: { comment_id: "C1" }, message: { text: "Sale $52.000" } });
  });

  it("guarda el subcódigo de Meta para mostrar el error correcto", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "outside window", code: 10, error_subcode: 2018278 } }), { status: 400 })
    );
    const id = await fbConversation(60);
    const { saved, error } = await sendFromInbox(id, { type: "text", body: "Hola" }, { store, getAccount });
    expect(saved).toMatchObject({ status: "failed", errorCode: 2018278 });
    expect(error?.code).toBe(2018278);
  });

  it("sin cuenta conectada falla con un mensaje claro (sin llamar a Meta)", async () => {
    const id = await fbConversation(60);
    const { saved } = await sendFromInbox(id, { type: "text", body: "Hola" }, { store, getAccount: async () => null });
    expect(saved).toMatchObject({ status: "failed", errorCode: null });
    expect(saved.errorTitle).toMatch(/Canales/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("las plantillas son solo de WhatsApp", async () => {
    const id = await fbConversation(60);
    await expect(
      sendFromInbox(id, { type: "template", name: "x", language: "es", headerParams: [], bodyParams: [] }, { store, getAccount })
    ).rejects.toBeInstanceOf(InboxSendError);
  });
});

describe("reglas de ventana", () => {
  const base = { windowSecondsLeft: 0 };
  it("Instagram/Messenger: 24 h libres, 7 días con HUMAN_AGENT, después nada", () => {
    expect(replyAvailability({ ...base, channel: "ig", lastInboundAt: now() - 3600 }, "message")).toMatchObject({ allowed: true, humanAgent: false });
    expect(replyAvailability({ ...base, channel: "fb", lastInboundAt: now() - 3 * 86400 }, "message")).toMatchObject({ allowed: true, humanAgent: true });
    expect(replyAvailability({ ...base, channel: "fb", lastInboundAt: now() - 8 * 86400 }, "message").allowed).toBe(false);
  });
  it("comentarios: público siempre, privado hasta 7 días", () => {
    const old = { ...base, channel: "igc" as const, lastInboundAt: now() - 10 * 86400 };
    expect(replyAvailability(old, "comment_public").allowed).toBe(true);
    expect(replyAvailability(old, "comment_private").allowed).toBe(false);
  });
  it("pickErrorCode prefiere el subcódigo conocido en Messenger/Instagram", () => {
    expect(pickErrorCode(10, 2018278, "fb")).toBe(2018278);
    expect(pickErrorCode(10, 1234, "fb")).toBe(10);
    expect(pickErrorCode(131047, null, "wa")).toBe(131047);
  });
});
