import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryChannelsRepo } from "@/lib/channels/repo";
import { parseJsonSafe } from "@/lib/tiktok/api";
import { freshAccessToken } from "@/lib/tiktok/connection";
import { processTikTokWebhook } from "@/lib/tiktok/ingest";
import { isValidTikTokSignature } from "@/lib/tiktok/signature";
import { MemoryInboxStore } from "@/lib/wa-inbox/memory-store";
import { sendFromInbox } from "@/lib/wa-inbox/send";

const OPEN_ID = "_000abPL1cJIdVefgDhGijkl2mFn3AB0abY4";
const VIDEO = "7203946942097902849";
const COMMENT = "7247303576418566913";
const PARENT = "7235861947622916866";

let store: MemoryInboxStore;
let repo: MemoryChannelsRepo;
let calls: { url: URL; init?: RequestInit }[];
let responses: Record<string, unknown>;

function ok(data: unknown) {
  return new Response(JSON.stringify({ code: 0, message: "OK", request_id: "r", data }), { status: 200 });
}

beforeEach(async () => {
  process.env.TIKTOK_APP_ID = "app";
  process.env.TIKTOK_APP_SECRET = "secret";
  store = new MemoryInboxStore();
  repo = new MemoryChannelsRepo();
  await repo.saveSocial({
    accountId: 7,
    channel: "tt",
    externalId: OPEN_ID,
    pageId: null,
    displayName: "@opticasol",
    accessToken: "token-1",
    tokenExpiresAt: Math.floor(Date.now() / 1000) + 20 * 3600,
    refreshToken: "refresh-1",
    refreshExpiresAt: Math.floor(Date.now() / 1000) + 300 * 86400,
    pictureUrl: null,
    pageName: null,
    connectedBy: 1,
  });
  calls = [];
  responses = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      const key = url.pathname.replace("/open_api/v1.3", "");
      const data = responses[key];
      if (data instanceof Response) return data;
      return ok(data ?? {});
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Como lo manda TikTok: los ids van como números dentro de content (un string JSON).
function commentEvent(content: Record<string, unknown>) {
  const json = JSON.stringify(content).replace(/"(\d{16,})"/g, "$1");
  return { client_key: "app", event: "comment.update", create_time: 1615338610, user_openid: OPEN_ID, content: json };
}

describe("TikTok: JSON con ids grandes", () => {
  it("deja los ids de 19 dígitos como string sin tocar el texto", () => {
    const parsed = parseJsonSafe<{ id: string; text: string; n: number }>(
      `{"id":${COMMENT},"text":"precio:12345678901234567, gracias","n":42}`
    );
    expect(parsed.id).toBe(COMMENT);
    expect(parsed.text).toBe("precio:12345678901234567, gracias");
    expect(parsed.n).toBe(42);
  });
});

describe("TikTok: firma del webhook", () => {
  const body = JSON.stringify(commentEvent({ comment_id: COMMENT }));
  const sign = (t: number, b = body) => createHmac("sha256", "secret").update(`${t}.${b}`).digest("hex");
  const now = Date.now();
  const t = Math.floor(now / 1000);

  it("acepta la firma correcta", () => {
    expect(isValidTikTokSignature(body, `t=${t},s=${sign(t)}`, "secret", now)).toBe(true);
  });
  it("rechaza otra firma, otro secreto o un envío viejo", () => {
    expect(isValidTikTokSignature(body, `t=${t},s=${sign(t, "{}")}`, "secret", now)).toBe(false);
    expect(isValidTikTokSignature(body, `t=${t},s=${sign(t)}`, "otro", now)).toBe(false);
    expect(isValidTikTokSignature(body, `t=${t - 3600},s=${sign(t - 3600)}`, "secret", now)).toBe(false);
    expect(isValidTikTokSignature(body, null, "secret", now)).toBe(false);
  });
});

describe("TikTok: comentarios a la bandeja", () => {
  beforeEach(() => {
    responses["/business/comment/list/"] = {
      comments: [
        {
          comment_id: COMMENT,
          video_id: VIDEO,
          text: "¿Hacen envíos a Córdoba?",
          create_time: 1700000000,
          unique_identifier: "+ABc1D2",
          username: "nico_ok",
          display_name: "Nico Herrera",
        },
      ],
    };
    responses["/business/video/list/"] = {
      videos: [{ item_id: VIDEO, caption: "3 tips", thumbnail_url: "https://x/t.jpg", share_url: "https://x/v", likes: 10, comments: 3 }],
    };
  });

  it("un comentario nuevo crea la conversación con el video y el @usuario", async () => {
    await processTikTokWebhook(
      commentEvent({ comment_id: COMMENT, video_id: VIDEO, comment_type: "comment", comment_action: "insert", unique_identifier: "+ABc1D2", text: "x" }),
      { store, repo }
    );
    const [conversation] = await store.listConversations(7, 10);
    expect(conversation).toMatchObject({ channel: "ttc", phoneNumberId: OPEN_ID, waId: `+ABc1D2:${VIDEO}`, handle: "@nico_ok" });
    expect(conversation.post).toMatchObject({ mediaId: VIDEO, caption: "3 tips", thumbnailUrl: "https://x/t.jpg" });
    const messages = await store.listMessages(conversation.id, 0, 10);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ wamid: COMMENT, type: "comment", body: "¿Hacen envíos a Córdoba?", direction: "in" });
    // El comentario se pidió por id (los ids no se redondearon)
    const list = calls.find((c) => c.url.pathname.endsWith("/business/comment/list/"))!;
    expect(list.url.searchParams.get("comment_ids")).toBe(JSON.stringify([COMMENT]));
    expect(list.init?.headers).toMatchObject({ "Access-Token": "token-1" });
  });

  it("el mismo comentario dos veces no se duplica", async () => {
    const event = commentEvent({ comment_id: COMMENT, video_id: VIDEO, comment_action: "insert" });
    await processTikTokWebhook(event, { store, repo });
    await processTikTokWebhook(event, { store, repo });
    const [conversation] = await store.listConversations(7, 10);
    expect(await store.listMessages(conversation.id, 0, 10)).toHaveLength(1);
  });

  it("los comentarios de la propia cuenta se ignoran", async () => {
    responses["/business/comment/list/"] = { comments: [{ comment_id: COMMENT, video_id: VIDEO, text: "Gracias!", username: "opticasol" }] };
    await processTikTokWebhook(commentEvent({ comment_id: COMMENT, video_id: VIDEO, comment_action: "insert" }), { store, repo });
    expect(await store.listConversations(7, 10)).toHaveLength(0);
  });

  it("un comentario borrado queda marcado", async () => {
    await processTikTokWebhook(commentEvent({ comment_id: COMMENT, video_id: VIDEO, comment_action: "insert" }), { store, repo });
    await processTikTokWebhook(commentEvent({ comment_id: COMMENT, video_id: VIDEO, comment_action: "delete" }), { store, repo });
    const [conversation] = await store.listConversations(7, 10);
    const [message] = await store.listMessages(conversation.id, 0, 10);
    expect(message.deletedAt).not.toBeNull();
  });

  it("una cuenta que nadie conectó se descarta", async () => {
    await processTikTokWebhook({ ...commentEvent({ comment_id: COMMENT, video_id: VIDEO, comment_action: "insert" }), user_openid: "otra" }, {
      store,
      repo,
    });
    expect(await store.listConversations(7, 10)).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});

describe("TikTok: responder desde la bandeja", () => {
  async function conversationWithReply() {
    responses["/business/comment/list/"] = {
      comments: [{ comment_id: COMMENT, video_id: VIDEO, parent_comment_id: PARENT, text: "Y a Mendoza?", unique_identifier: "+ABc1D2", username: "nico_ok" }],
    };
    await processTikTokWebhook(commentEvent({ comment_id: COMMENT, video_id: VIDEO, comment_type: "reply", comment_action: "insert" }), { store, repo });
    const [conversation] = await store.listConversations(7, 10);
    return conversation.id;
  }

  it("responde en público en el hilo del comentario (al padre)", async () => {
    const id = await conversationWithReply();
    responses["/business/comment/reply/create/"] = { comment_id: "7300000000000000001" };
    const { saved, error } = await sendFromInbox(id, { type: "text", body: "¡Sí, a todo el país!" }, { store, channelsRepo: repo });
    expect(error).toBeNull();
    expect(saved).toMatchObject({ status: "sent", type: "comment_reply", wamid: "7300000000000000001" });
    const reply = calls.find((c) => c.url.pathname.endsWith("/business/comment/reply/create/"))!;
    expect(JSON.parse(String(reply.init?.body))).toEqual({
      business_id: OPEN_ID,
      video_id: VIDEO,
      comment_id: PARENT,
      text: "¡Sí, a todo el país!",
    });
  });

  it("no deja mandar más de 150 caracteres ni responder por privado", async () => {
    const id = await conversationWithReply();
    await expect(sendFromInbox(id, { type: "text", body: "a".repeat(151) }, { store, channelsRepo: repo })).rejects.toMatchObject({
      code: "invalid_body",
    });
    await expect(
      sendFromInbox(id, { type: "text", body: "Hola", replyMode: "private" }, { store, channelsRepo: repo })
    ).rejects.toMatchObject({ code: "window_closed" });
  });

  it("si TikTok rechaza la respuesta, queda como fallida con el motivo", async () => {
    const id = await conversationWithReply();
    responses["/business/comment/reply/create/"] = new Response(JSON.stringify({ code: 40001, message: "Comment not found" }), { status: 200 });
    const { saved, error } = await sendFromInbox(id, { type: "text", body: "Hola" }, { store, channelsRepo: repo });
    expect(saved.status).toBe("failed");
    expect(error?.title).toContain("Comment not found");
  });
});

describe("TikTok: token", () => {
  it("renueva el access token cuando está por vencer y guarda los dos tokens nuevos", async () => {
    const [record] = await repo.listSocial(7);
    await repo.updateSocialToken(record.id, "token-viejo", Math.floor(Date.now() / 1000) + 60);
    responses["/tt_user/oauth2/refresh_token/"] = {
      access_token: "token-2",
      expires_in: 86400,
      refresh_token: "refresh-2",
      refresh_token_expires_in: 31536000,
      open_id: OPEN_ID,
      scope: "comment.list",
    };
    const current = (await repo.findSocial("tt", OPEN_ID))!;
    expect(await freshAccessToken(repo, current)).toBe("token-2");
    const saved = (await repo.findSocial("tt", OPEN_ID))!;
    expect(saved).toMatchObject({ accessToken: "token-2", refreshToken: "refresh-2" });
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toMatchObject({ client_id: "app", client_secret: "secret", grant_type: "refresh_token", refresh_token: "refresh-1" });
  });

  it("con el token vigente no llama a TikTok", async () => {
    const current = (await repo.findSocial("tt", OPEN_ID))!;
    expect(await freshAccessToken(repo, current)).toBe("token-1");
    expect(calls).toHaveLength(0);
  });
});
