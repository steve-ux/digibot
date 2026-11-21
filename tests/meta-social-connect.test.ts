// Fase A de Facebook + Instagram (Unified Login): webhook con cola, ruteo por cuenta
// conectada, aislamiento entre clientes, comentarios editados/borrados y envío.
// HTTP de Meta fakeado; payloads con la forma real de los webhooks de Meta.

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SocialAccount, SocialChannel } from "@/lib/meta-social/accounts";
import { MemoryInboxStore } from "@/lib/wa-inbox/memory-store";
import { setInboxStore } from "@/lib/wa-inbox/store";

// Conexiones activas (en producción salen de web_channel_accounts).
const PAGE_A = "111000111"; // página del cliente 1
const PAGE_B = "222000222"; // página del cliente 2
const IG_A = "17841400000000001"; // @esteban_instaok, cliente 1, Unified Login
const PSID = "6543210987654321";
const IGSID = "1234567890123456";
const APP_ID = "999";
const APP_SECRET = "test-app-secret";

const base = { apiVersion: "v23.0", source: "db" as const };
const CONNECTED: SocialAccount[] = [
  { ...base, channel: "fb", clientId: 1, authType: "page", accountId: PAGE_A, pageId: PAGE_A, displayName: "Óptica Sol", accessToken: "tok-page-a" },
  { ...base, channel: "fb", clientId: 2, authType: "page", accountId: PAGE_B, pageId: PAGE_B, displayName: "Otra", accessToken: "tok-page-b" },
  { ...base, channel: "ig", clientId: 1, authType: "ig_unified", accountId: IG_A, pageId: null, displayName: "@esteban_instaok", accessToken: "tok-suat" },
];
const findAccount = async (channel: SocialChannel, id: string) =>
  CONNECTED.find((a) => a.channel === channel && a.accountId === id) ?? null;

vi.mock("@/lib/meta-social/accounts", () => ({
  getSocialAccount: (channel: SocialChannel, id: string) => findAccount(channel, id),
  listSocialAccounts: async () => CONNECTED,
  listEnvSocialAccounts: () => [],
  resetSocialAccountsCache: () => undefined,
}));

const { POST } = await import("@/app/webhooks/meta/route");
const { MemoryMetaEventQueue, processMetaWebhookQueue, setMetaEventQueue, enqueueMetaWebhook } = await import(
  "@/lib/meta-social/queue"
);
const { processSocialWebhook } = await import("@/lib/meta-social/webhook");
const { sendFromInbox, retryFromInbox } = await import("@/lib/wa-inbox/send");

const now = () => Math.floor(Date.now() / 1000);
let store: MemoryInboxStore;
let queue: InstanceType<typeof MemoryMetaEventQueue>;
const quiet = { profile: async () => ({ name: null, username: null }), post: async () => ({ mediaId: "M", caption: "", likes: 0, comments: 0, thumbnailUrl: null, permalink: null }) };
const deps = () => ({ store, appId: APP_ID, getAccount: findAccount, ...quiet });

function signed(payload: unknown, secret = APP_SECRET) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return new Request("https://digibotlatam.com/webhooks/meta", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": `sha256=${signature}` },
    body,
  });
}

// --- Payloads con la forma de Meta ---
const messengerDm = (mid: string, text: string, pageId = PAGE_A) => ({
  object: "page",
  entry: [
    {
      id: pageId,
      time: Date.now(),
      messaging: [{ sender: { id: PSID }, recipient: { id: pageId }, timestamp: Date.now(), message: { mid, text } }],
    },
  ],
});
const messengerEcho = (mid: string, text: string, appId?: number) => ({
  object: "page",
  entry: [
    {
      id: PAGE_A,
      time: Date.now(),
      messaging: [
        {
          sender: { id: PAGE_A },
          recipient: { id: PSID },
          timestamp: Date.now(),
          message: { mid, text, is_echo: true, ...(appId ? { app_id: appId } : {}) },
        },
      ],
    },
  ],
});
const igDm = (mid: string, text: string) => ({
  object: "instagram",
  entry: [
    {
      id: IG_A,
      time: Date.now(),
      messaging: [{ sender: { id: IGSID }, recipient: { id: IG_A }, timestamp: Date.now(), message: { mid, text } }],
    },
  ],
});
const igComment = (id: string, text: string, mediaId = "M1") => ({
  object: "instagram",
  entry: [
    {
      id: IG_A,
      time: now(),
      changes: [
        {
          field: "comments",
          value: { from: { id: IGSID, username: "nico_ruiz" }, media: { id: mediaId, media_product_type: "FEED" }, id, text },
        },
      ],
    },
  ],
});
const fbFeed = (value: Record<string, unknown>) => ({
  object: "page",
  entry: [{ id: PAGE_A, time: now(), changes: [{ field: "feed", value }] }],
});

beforeEach(() => {
  vi.stubEnv("META_APP_SECRET", APP_SECRET);
  vi.stubEnv("META_APP_ID", APP_ID);
  vi.stubEnv("DB_HOST", "db.test");
  vi.stubEnv("DB_DATABASE", "test");
  vi.stubEnv("DB_USERNAME", "test");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  store = new MemoryInboxStore();
  setInboxStore(store);
  queue = new MemoryMetaEventQueue();
  setMetaEventQueue(queue);
  // Perfiles / publicaciones: Meta no se llama en los tests de webhook.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
});
afterEach(() => {
  setInboxStore(null);
  setMetaEventQueue(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/webhooks/meta", () => {
  it("firma inválida -> 403 y no encola nada", async () => {
    const res = await POST(signed(messengerDm("m1", "Hola"), "otro-secreto"));
    expect(res.status).toBe(403);
    const noSig = await POST(new Request("https://digibotlatam.com/webhooks/meta", { method: "POST", body: "{}" }));
    expect(noSig.status).toBe(403);
    expect(queue.events).toHaveLength(0);
  });

  it("encola, responde 200 y el worker lo procesa", async () => {
    const res = await POST(signed(messengerDm("m.1", "Hola, ¿tienen lentes de sol?")));
    expect(res.status).toBe(200);
    expect(queue.events).toHaveLength(1);
    // El route ya arrancó el worker en segundo plano (sin esperar a que termine para responder).
    await vi.waitFor(() => expect(queue.events[0].status).toBe("done"));
    expect(await store.listConversations(1, 10)).toEqual([expect.objectContaining({ channel: "fb", waId: PSID })]);
  });

  it("la misma entrega repetida no se encola ni se guarda dos veces", async () => {
    const payload = messengerDm("m.dup", "Hola");
    await POST(signed(payload));
    await POST(signed(payload));
    expect(queue.events).toHaveLength(1);
    // Mismo mid en otra entrega (otro body): se procesa pero no duplica el mensaje.
    await enqueueMetaWebhook(JSON.stringify({ ...payload, extra: 1 }), payload, queue);
    await processMetaWebhookQueue({ queue, deps: deps() });
    expect(store.messages.filter((m) => m.wamid === "m.dup")).toHaveLength(1);
  });

  it("si el procesamiento falla queda pendiente para reintentar", async () => {
    await enqueueMetaWebhook("raw", messengerDm("m.err", "Hola"), queue);
    const broken = { ...deps(), store: { ...store, upsertConversation: async () => { throw new Error("base caída"); } } as unknown as MemoryInboxStore };
    await processMetaWebhookQueue({ queue, deps: broken });
    expect(queue.events[0]).toMatchObject({ status: "pending", attempts: 1, error: "base caída" });
  });
});

describe("ruteo y aislamiento", () => {
  it("DM de Messenger entrante va a la cuenta dueña de la página", async () => {
    await processSocialWebhook(messengerDm("m.a", "Hola A"), deps());
    await processSocialWebhook(messengerDm("m.b", "Hola B", PAGE_B), deps());
    expect((await store.listConversations(1, 10)).map((c) => c.phoneNumberId)).toEqual([PAGE_A]);
    expect((await store.listConversations(2, 10)).map((c) => c.phoneNumberId)).toEqual([PAGE_B]);
  });

  it("eco: lo mandado desde la app de Meta se guarda como saliente; el de DigiBot se ignora", async () => {
    await processSocialWebhook(messengerDm("m.in", "Hola"), deps());
    await processSocialWebhook(messengerEcho("m.echo1", "Te respondo desde Business Suite"), deps());
    await processSocialWebhook(messengerEcho("m.echo2", "Esto salió de DigiBot", Number(APP_ID)), deps());
    expect(store.messages.map((m) => [m.wamid, m.direction])).toEqual([
      ["m.in", "in"],
      ["m.echo1", "out"],
    ]);
  });

  it("DM de Instagram (Unified Login) se rutea por el id de la cuenta de IG", async () => {
    await processSocialWebhook(igDm("ig.1", "¿Precio?"), deps());
    expect(await store.listConversations(1, 10)).toEqual([
      expect.objectContaining({ channel: "ig", phoneNumberId: IG_A, waId: IGSID, accountId: 1 }),
    ]);
  });

  it("un evento de una página que nadie conectó se descarta (no cae en otra cuenta)", async () => {
    await processSocialWebhook(messengerDm("m.x", "Hola", "999999"), deps());
    await processSocialWebhook({ ...igDm("ig.x", "hola"), entry: [{ ...igDm("ig.x", "hola").entry[0], id: "17849999" }] }, deps());
    expect(store.conversations).toHaveLength(0);
    expect(store.messages).toHaveLength(0);
  });
});

describe("comentarios", () => {
  it("comentario de Instagram abre un hilo igc de la cuenta dueña", async () => {
    await processSocialWebhook(igComment("C1", "Precio de la segunda foto?"), deps());
    expect((await store.listConversations(1, 10))[0]).toMatchObject({ channel: "igc", waId: `${IGSID}:M1`, handle: "@nico_ruiz" });
    expect(store.messages[0]).toMatchObject({ type: "comment", wamid: "C1" });
  });

  it("comentario de Facebook: add, edited y remove", async () => {
    await processSocialWebhook(
      fbFeed({ item: "comment", verb: "add", comment_id: "P1_C1", post_id: "P1", message: "¿Cuotas?", from: { id: "F1", name: "Rocío" }, created_time: now() }),
      deps()
    );
    await processSocialWebhook(
      fbFeed({ item: "comment", verb: "edited", comment_id: "P1_C1", post_id: "P1", message: "¿Cuotas sin interés?", from: { id: "F1" }, created_time: now() }),
      deps()
    );
    expect(store.messages[0]).toMatchObject({ body: "¿Cuotas sin interés?", editedAt: expect.any(Number), deletedAt: null });

    await processSocialWebhook(fbFeed({ item: "comment", verb: "remove", comment_id: "P1_C1", post_id: "P1", from: { id: "F1" } }), deps());
    expect(store.messages[0].deletedAt).toEqual(expect.any(Number));
    expect(store.conversations).toHaveLength(1);
  });
});

describe("envío", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ message_id: "m_sent", recipient_id: IGSID, id: "C_reply" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  const sendDeps = (extra: Record<string, unknown> = {}) => ({ store, getAccount: findAccount, authorName: "Esteban", ...extra });

  async function dm(channel: "fb" | "ig", accountId: string, contact: string, secondsAgo: number) {
    const id = await store.upsertConversation(accountId, contact, "Carla", { channel, accountId: 1 });
    await store.recordActivity(id, { preview: "Hola", at: now() - secondsAgo, inbound: true });
    return id;
  }
  async function commentThread(channel: "igc" | "fbc", accountId: string, commenter: string, comments: [string, number][]) {
    const id = await store.upsertConversation(accountId, `${commenter}:M1`, null, { channel, accountId: 1, handle: "@nico" });
    for (const [wamid, ago] of comments) {
      await store.insertMessage({ conversationId: id, wamid, direction: "in", type: "comment", body: `comentario ${wamid}`, status: "received", messageAt: now() - ago });
      await store.recordActivity(id, { preview: "c", at: now() - ago, inbound: true });
    }
    return id;
  }

  it("Instagram (Unified Login): el DM sale por /{ig-user-id}/messages con el token del sistema", async () => {
    const id = await dm("ig", IG_A, IGSID, 60);
    const { saved, error } = await sendFromInbox(id, { type: "text", body: "¡Hola!" }, sendDeps());
    expect(error).toBeNull();
    expect(saved).toMatchObject({ status: "sent", wamid: "m_sent" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://graph.facebook.com/v23.0/${IG_A}/messages`);
    expect(init.headers.Authorization).toBe("Bearer tok-suat");
    expect(JSON.parse(init.body)).toEqual({ recipient: { id: IGSID }, messaging_type: "RESPONSE", message: { text: "¡Hola!" } });
  });

  it("ventana abierta sale; pasadas las 24 h se bloquea con 'Ventana cerrada' (Human Agent apagado)", async () => {
    const open = await dm("fb", PAGE_A, PSID, 23 * 3600);
    expect((await sendFromInbox(open, { type: "text", body: "Hola" }, sendDeps())).saved.status).toBe("sent");

    const closed = await dm("fb", PAGE_A, "otro-psid", 25 * 3600);
    await expect(sendFromInbox(closed, { type: "text", body: "Hola" }, sendDeps())).rejects.toMatchObject({
      code: "window_closed",
      message: expect.stringContaining("Ventana cerrada"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("con Human Agent prendido, de 24 h a 7 días sale con la etiqueta HUMAN_AGENT", async () => {
    const id = await dm("fb", PAGE_A, PSID, 30 * 3600);
    await sendFromInbox(id, { type: "text", body: "Te respondo yo" }, sendDeps({ humanAgent: true }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
  });

  it("respuesta en público a un comentario puntual (IG: /replies, FB: /comments)", async () => {
    const ig = await commentThread("igc", IG_A, IGSID, [["C1", 600], ["C2", 60]]);
    const { saved } = await sendFromInbox(ig, { type: "text", body: "¡Sí!", replyMode: "public", commentId: "C1" }, sendDeps());
    expect(saved).toMatchObject({ type: "comment_reply", inReplyTo: "C1" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://graph.facebook.com/v23.0/C1/replies");

    const fb = await commentThread("fbc", PAGE_A, "F1", [["P1_C1", 60]]);
    await sendFromInbox(fb, { type: "text", body: "¡Sí!", replyMode: "public" }, sendDeps());
    expect(fetchMock.mock.calls[1][0]).toBe("https://graph.facebook.com/v23.0/P1_C1/comments");
  });

  it("no deja responder un comentario de otra conversación", async () => {
    const id = await commentThread("igc", IG_A, IGSID, [["C1", 60]]);
    await expect(
      sendFromInbox(id, { type: "text", body: "x", replyMode: "public", commentId: "C-ajeno" }, sendDeps())
    ).rejects.toMatchObject({ code: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respuesta por privado: sale por el nodo de IG con comment_id y abre la conversación de DM", async () => {
    const id = await commentThread("igc", IG_A, IGSID, [["C1", 60]]);
    const { saved } = await sendFromInbox(id, { type: "text", body: "Te paso el precio", replyMode: "private" }, sendDeps());
    expect(saved).toMatchObject({ type: "private_reply", inReplyTo: "C1", status: "sent" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://graph.facebook.com/v23.0/${IG_A}/messages`);
    expect(JSON.parse(init.body)).toEqual({ recipient: { comment_id: "C1" }, message: { text: "Te paso el precio" } });

    const dmConversation = store.conversations.find((c) => c.channel === "ig" && c.waId === IGSID);
    expect(dmConversation).toMatchObject({ accountId: 1, lastMessagePreview: "Te paso el precio" });
    expect(store.messages.filter((m) => m.conversationId === dmConversation!.id)).toEqual([
      expect.objectContaining({ type: "private_reply", direction: "out", inReplyTo: "C1" }),
    ]);
  });

  it("la respuesta por privado no se repite sobre el mismo comentario (ni reintentando)", async () => {
    const id = await commentThread("fbc", PAGE_A, "F1", [["P1_C1", 60], ["P1_C2", 30]]);
    await sendFromInbox(id, { type: "text", body: "Primera", replyMode: "private", commentId: "P1_C1" }, sendDeps());
    await expect(
      sendFromInbox(id, { type: "text", body: "Segunda", replyMode: "private", commentId: "P1_C1" }, sendDeps())
    ).rejects.toMatchObject({ code: "already_replied" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Otro comentario de la misma persona sí se puede responder por privado.
    await sendFromInbox(id, { type: "text", body: "Otra", replyMode: "private", commentId: "P1_C2" }, sendDeps());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("si la respuesta privada falló, se puede reintentar (no cuenta como usada)", async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { message: "x", code: 2 } }), { status: 500 }));
    const id = await commentThread("igc", IG_A, IGSID, [["C1", 60]]);
    const first = await sendFromInbox(id, { type: "text", body: "Hola", replyMode: "private" }, sendDeps());
    expect(first.saved.status).toBe("failed");
    const retry = await retryFromInbox(id, first.saved.id, sendDeps());
    expect(retry.saved).toMatchObject({ status: "sent", inReplyTo: "C1" });
  });

  it("por privado solo hasta 7 días después de ese comentario; un comentario borrado no se responde", async () => {
    const id = await commentThread("igc", IG_A, IGSID, [["C-viejo", 8 * 86400], ["C-nuevo", 60]]);
    await expect(
      sendFromInbox(id, { type: "text", body: "x", replyMode: "private", commentId: "C-viejo" }, sendDeps())
    ).rejects.toMatchObject({ code: "window_closed" });
    // En público sí
    await sendFromInbox(id, { type: "text", body: "x", replyMode: "public", commentId: "C-viejo" }, sendDeps());

    await store.markDeletedByWamid("C-nuevo", now());
    await expect(
      sendFromInbox(id, { type: "text", body: "x", replyMode: "public", commentId: "C-nuevo" }, sendDeps())
    ).rejects.toMatchObject({ httpStatus: 409 });
  });
});
