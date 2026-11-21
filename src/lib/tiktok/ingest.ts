// Comentarios de TikTok -> bandeja (canal ttc). Server-only.
//
//   Webhook comment.update (avisa en hasta 5 minutos): { client_key, event, create_time,
//     user_openid, content: "<JSON>" } con content = { comment_id, video_id, parent_comment_id,
//     comment_type: comment|reply, comment_action: insert|delete|set_to_hidden|…,
//     unique_identifier, timestamp (ms), text }
//   El evento no trae el @usuario: se pide el comentario a /business/comment/list/ por id.
//
// Una conversación por persona y video (wa_id = "<unique_identifier>:<video_id>"), como
// los comentarios de Instagram. wamid = comment_id (deduplica webhook y sincronización).
// Las respuestas (reply) guardan in_reply_to = comentario padre: TikTok responde al hilo.

import type { ChannelsRepo, SocialRecord } from "../channels/repo";
import { getInboxStore, type InboxStore } from "../wa-inbox/store";
import type { InboxPost } from "../wa-inbox/types";
import { listComments, listVideos, parseJsonSafe, type TikTokComment, type TikTokVideo } from "./api";
import { findTikTokAccount, freshAccessToken } from "./connection";

const LOG = "[tiktok]";

interface CommentEventContent {
  comment_id?: string | number;
  video_id?: string | number;
  parent_comment_id?: string | number;
  comment_type?: string;
  comment_action?: string;
  unique_identifier?: string;
  timestamp?: number | string;
  text?: string;
}

interface TikTokWebhookPayload {
  client_key?: string;
  event?: string;
  create_time?: number;
  user_openid?: string;
  content?: string | CommentEventContent;
}

const toId = (v: unknown) => (v === undefined || v === null || v === "" || v === 0 || v === "0" ? null : String(v));

// TikTok manda timestamp en milisegundos (a veces en segundos).
function toUnix(v: unknown, fallback = Math.floor(Date.now() / 1000)) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

function videoToPost(v: TikTokVideo): InboxPost {
  return {
    mediaId: v.id,
    caption: v.caption,
    likes: v.likes,
    comments: v.comments,
    thumbnailUrl: v.thumbnailUrl,
    permalink: v.shareUrl,
  };
}

function isOwn(account: SocialRecord, c: Pick<TikTokComment, "owner" | "username">) {
  if (c.owner) return true;
  const own = account.displayName?.replace(/^@/, "").toLowerCase();
  return Boolean(own && c.username && c.username.toLowerCase() === own);
}

interface Ctx {
  store: InboxStore;
  repo: ChannelsRepo;
  account: SocialRecord;
  token: string;
  videos: Map<string, TikTokVideo | null>;
}

async function videoFor(ctx: Ctx, videoId: string) {
  if (ctx.videos.has(videoId)) return ctx.videos.get(videoId) ?? null;
  const video = await listVideos(ctx.token, ctx.account.externalId, { videoIds: [videoId], maxCount: 1 })
    .then((list) => list.find((v) => v.id === videoId) ?? null)
    .catch((err) => {
      console.info(`${LOG} No se pudo leer el video ${videoId}:`, (err as Error).message);
      return null;
    });
  ctx.videos.set(videoId, video);
  return video;
}

async function ingest(ctx: Ctx, c: TikTokComment, fallbackAuthor: string | null) {
  const authorKey = c.authorKey ?? fallbackAuthor ?? `anon-${c.id}`;
  const contactId = `${authorKey}:${c.videoId}`;
  const handle = c.username ? `@${c.username.replace(/^@/, "")}` : null;
  const { store, account } = ctx;
  const conversationId = await store.upsertConversation(account.externalId, contactId, c.displayName, {
    channel: "ttc",
    accountId: account.accountId,
    handle,
  });

  // El video se busca una sola vez por conversación.
  const conversation = await store.getConversation(conversationId);
  if (conversation && !conversation.post) {
    const video = await videoFor(ctx, c.videoId);
    if (video) {
      await store.upsertConversation(account.externalId, contactId, null, {
        channel: "ttc",
        accountId: account.accountId,
        post: videoToPost(video),
      });
    }
  }

  const body = c.text.trim() || "[comentario sin texto]";
  const at = c.createTime ? toUnix(c.createTime) : Math.floor(Date.now() / 1000);
  const id = await store.insertMessage({
    conversationId,
    wamid: c.id,
    inReplyTo: c.parentId,
    direction: "in",
    type: "comment",
    body,
    status: "received",
    rawPayload: c,
    messageAt: at,
  });
  if (id !== null) await store.recordActivity(conversationId, { preview: body, at, inbound: true });
  return id !== null;
}

async function context(account: SocialRecord, repo: ChannelsRepo, store?: InboxStore): Promise<Ctx> {
  return {
    store: store ?? (await getInboxStore()),
    repo,
    account,
    token: await freshAccessToken(repo, account),
    videos: new Map(),
  };
}

// ---------- Webhook ----------

export async function processTikTokWebhook(payload: unknown, deps: { store?: InboxStore; repo?: ChannelsRepo } = {}) {
  const data = payload as TikTokWebhookPayload;
  if (data?.event !== "comment.update") {
    console.info(`${LOG} Evento "${data?.event}" no manejado.`);
    return;
  }
  const openId = data.user_openid;
  let content: CommentEventContent | null = null;
  try {
    content = typeof data.content === "string" ? parseJsonSafe<CommentEventContent>(data.content) : (data.content ?? null);
  } catch {
    content = null;
  }
  const commentId = toId(content?.comment_id);
  const videoId = toId(content?.video_id);
  if (!openId || !content || !commentId || !videoId) {
    console.warn(`${LOG} comment.update incompleto:`, JSON.stringify(payload).slice(0, 1000));
    return;
  }

  const found = await findTikTokAccount(openId, deps.repo);
  if (!found) {
    // Nadie conectó esa cuenta (o se desconectó): no se guarda nada.
    console.info(`${LOG} comment.update de ${openId} sin conexión activa: se descarta.`);
    return;
  }
  const store = deps.store ?? (await getInboxStore());
  const at = toUnix(content.timestamp ?? data.create_time);

  switch (content.comment_action) {
    case "delete":
    case "set_to_hidden":
    case "set_to_friends_only":
      // Ya no se ve en el video: queda marcado como borrado y no se puede responder.
      await store.markDeletedByWamid(commentId, at);
      return;
    case "insert":
      break;
    default:
      return;
  }

  const ctx = await context(found.record, found.repo, store);
  // El evento no trae quién comentó: se pide el comentario por id.
  const detail = await listComments(ctx.token, openId, videoId, { commentIds: [commentId], maxCount: 1 })
    .then((list) => list.find((c) => c.id === commentId) ?? null)
    .catch((err) => {
      console.info(`${LOG} No se pudo leer el comentario ${commentId}:`, (err as Error).message);
      return null;
    });

  const comment: TikTokComment = detail ?? {
    id: commentId,
    videoId,
    parentId: toId(content.parent_comment_id),
    text: content.text ?? "",
    createTime: at,
    authorKey: content.unique_identifier ?? null,
    username: null,
    displayName: null,
    owner: false,
  };
  if (!comment.parentId) comment.parentId = toId(content.parent_comment_id);
  // Las respuestas de la propia cuenta: las que salen del panel ya están guardadas.
  if (isOwn(found.record, comment)) return;
  await ingest(ctx, comment, content.unique_identifier ?? null);
}

// ---------- Sincronización al conectar ----------
//
// Trae los comentarios de los últimos videos para que la bandeja no arranque vacía
// (y para probar sin el webhook). Solo comentarios de primer nivel y de los últimos 14 días.

const SYNC_VIDEOS = 5;
const SYNC_MAX_AGE = 14 * 86_400;

export async function syncRecentTikTokComments(account: SocialRecord, repo: ChannelsRepo, deps: { store?: InboxStore } = {}) {
  const ctx = await context(account, repo, deps.store);
  const videos = await listVideos(ctx.token, account.externalId, { maxCount: SYNC_VIDEOS });
  const since = Math.floor(Date.now() / 1000) - SYNC_MAX_AGE;
  let imported = 0;
  for (const video of videos) {
    ctx.videos.set(video.id, video);
    if (video.comments === 0) continue;
    const comments = await listComments(ctx.token, account.externalId, video.id, { maxCount: 30 }).catch((err) => {
      console.info(`${LOG} No se pudieron leer los comentarios del video ${video.id}:`, (err as Error).message);
      return [];
    });
    for (const c of comments) {
      if (c.parentId || isOwn(account, c)) continue;
      if (c.createTime && toUnix(c.createTime) < since) continue;
      if (await ingest(ctx, c, null)) imported++;
    }
  }
  console.info(`${LOG} ${account.displayName}: ${imported} comentarios importados de ${videos.length} videos.`);
  return imported;
}
