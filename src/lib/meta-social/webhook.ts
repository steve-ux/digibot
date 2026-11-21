// Webhooks de Messenger/Facebook (object "page"), Instagram (object "instagram")
// y Threads, normalizados al mismo modelo de la bandeja que WhatsApp. Server-only.
//
//   page      / messaging[]              -> fb  (DMs de Messenger)
//   page      / changes[field=feed]      -> fbc (comentarios en publicaciones de la página: add, edited, remove)
//   instagram / messaging[]              -> ig  (DMs de Instagram)
//   instagram / changes[field=comments]  -> igc (comentarios en publicaciones)
//   threads   / values[field=replies]    -> th  (respuestas a tus hilos) — processThreadsWebhook
//
// Los eventos de "entregado" y "leído" actualizan el estado de los salientes.
//
// Cada evento se rutea por entry.id (page_id o ig_user_id) a la conexión y a la cuenta
// de DigiBot que la conectó. Si nadie conectó esa página / cuenta, el evento se descarta:
// una conversación nunca cae en la cuenta de otro cliente.
// El route (/webhooks/meta) no llama acá directo: encola y responde 200 (ver queue.ts).

import type { ChannelId } from "../crm/channels";
import { getInboxStore, type InboxStore } from "../wa-inbox/store";
import { adapterFor } from "../channels/adapters";
import { getSocialAccount, type SocialAccount, type SocialChannel } from "./accounts";
import type { MediaInfo, SocialProfile } from "./graph";

const LOG = "[meta-webhook]";

// --- Formas del payload (solo lo que usamos) ---

interface SocialAttachment {
  type?: string;
  payload?: { url?: string; title?: string };
}

interface SocialMessage {
  mid: string;
  text?: string;
  is_echo?: boolean;
  is_deleted?: boolean;
  app_id?: number | string;
  attachments?: SocialAttachment[];
  reply_to?: { mid?: string; story?: { id?: string; url?: string } };
}

interface MessagingEvent {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: SocialMessage;
  delivery?: { mids?: string[]; watermark?: number };
  read?: { mid?: string; watermark?: number };
}

// instagram / comments
interface InstagramCommentValue {
  id?: string;
  text?: string;
  parent_id?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string; media_product_type?: string };
}

// page / feed
interface FeedValue {
  item?: string;
  verb?: string;
  comment_id?: string;
  post_id?: string;
  parent_id?: string;
  message?: string;
  created_time?: number;
  from?: { id?: string; name?: string };
}

interface SocialPayload {
  object?: string;
  entry?: {
    id?: string;
    time?: number;
    messaging?: MessagingEvent[];
    changes?: { field?: string; value?: unknown }[];
  }[];
}

export interface SocialWebhookDeps {
  store?: InboxStore;
  getAccount?: (channel: SocialChannel, accountId: string) => Promise<SocialAccount | null>;
  profile?: (account: SocialAccount, userId: string) => Promise<SocialProfile>;
  // Datos de la publicación comentada (IG, FB o Threads según la cuenta).
  post?: (account: SocialAccount, postId: string) => Promise<MediaInfo>;
  // META_APP_ID: los ecos de mensajes que mandó esta misma app se ignoran (ya están guardados).
  appId?: string | null;
}

type ResolvedDeps = Required<Omit<SocialWebhookDeps, "store">>;

function resolveDeps(deps: SocialWebhookDeps): ResolvedDeps {
  return {
    getAccount: deps.getAccount ?? getSocialAccount,
    profile: deps.profile ?? ((account, userId) => adapterFor(account).fetchProfile(account, userId)),
    post: deps.post ?? ((account, postId) => adapterFor(account).fetchPost(account, postId)),
    appId: deps.appId !== undefined ? deps.appId : process.env.META_APP_ID || null,
  };
}

const ATTACHMENT_LABELS: Record<string, string> = {
  image: "[imagen]",
  video: "[video]",
  audio: "[audio]",
  file: "[documento]",
  share: "[publicación compartida]",
  ig_reel: "[reel]",
  reel: "[reel]",
  story_mention: "[mención en historia]",
  template: "[mensaje con botones]",
  fallback: "[adjunto]",
};

// Texto legible que se guarda en body (la UI lo muestra con un ícono amigable).
export function describeSocialMessage(message: SocialMessage) {
  const text = message.text?.trim() ?? "";
  if (message.reply_to?.story) return text ? `[respuesta a tu historia] ${text}` : "[respuesta a tu historia]";
  const attachment = message.attachments?.[0];
  if (!attachment) return text || "[mensaje no soportado]";
  const label = ATTACHMENT_LABELS[attachment.type ?? ""] ?? "[adjunto]";
  return text ? `${label} ${text}` : label;
}

// Acepta milisegundos, segundos o ISO 8601.
const toUnix = (value: number | string | undefined) => {
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
  }
  return value && Number.isFinite(value)
    ? Math.floor(value > 1e12 ? value / 1000 : value)
    : Math.floor(Date.now() / 1000);
};

const CHANNEL_NAMES: Record<SocialChannel, string> = { ig: "Instagram", fb: "Messenger", th: "Threads" };

// No volver a pedir el perfil de alguien a cada mensaje si Meta no lo devuelve.
const PROFILE_RETRY_MS = 60 * 60 * 1000;
const profileMisses = new Map<string, number>();

async function enrichContact(
  store: InboxStore,
  deps: ResolvedDeps,
  account: SocialAccount,
  conversationId: number,
  accountId: string,
  contactId: string
) {
  if (!account.accessToken) return;
  const conversation = await store.getConversation(conversationId);
  if (!conversation || conversation.contactName) return;
  const key = `${account.channel}:${contactId}`;
  if ((profileMisses.get(key) ?? 0) > Date.now()) return;
  try {
    const profile = await deps.profile(account, contactId);
    if (!profile.name && !profile.username) throw new Error("perfil vacío");
    await store.upsertConversation(accountId, contactId, profile.name ?? profile.username, {
      channel: account.channel,
      accountId: account.clientId ?? undefined,
      handle: profile.username ? `@${profile.username}` : profile.name,
    });
  } catch (err) {
    profileMisses.set(key, Date.now() + PROFILE_RETRY_MS);
    console.info(`${LOG} No se pudo obtener el perfil de ${key}:`, (err as Error).message);
  }
}

// Un eco de un mensaje que mandamos desde el panel puede llegar antes de que
// guardemos su mid: si hay un saliente "sending" con el mismo texto, es ese.
async function isOwnPendingEcho(store: InboxStore, conversationId: number, body: string) {
  const recent = await store.listMessages(conversationId, 0, 20);
  return recent.some((m) => m.direction === "out" && m.status === "sending" && m.body === body);
}

async function handleMessaging(
  channel: "ig" | "fb",
  account: SocialAccount,
  event: MessagingEvent,
  store: InboxStore,
  deps: ResolvedDeps
) {
  const accountId = account.accountId;
  if (event.message && !event.message.is_deleted) {
    const message = event.message;
    const echo = Boolean(message.is_echo);
    const contactId = echo ? event.recipient?.id : event.sender?.id;
    if (!contactId) return;

    if (echo && deps.appId && message.app_id !== undefined && String(message.app_id) === deps.appId) return;

    const body = describeSocialMessage(message);
    const at = toUnix(event.timestamp);
    const conversationId = await store.upsertConversation(accountId, contactId, null, {
      channel,
      accountId: account.clientId ?? undefined,
    });

    if (echo) {
      if (await isOwnPendingEcho(store, conversationId, body)) return;
      // Respuesta escrita desde la app de Instagram / Meta Business Suite.
      const id = await store.insertMessage({
        conversationId,
        wamid: message.mid,
        direction: "out",
        author: "agent",
        authorName: `App de ${CHANNEL_NAMES[channel]}`,
        type: "text",
        body,
        status: "sent",
        rawPayload: event,
        messageAt: at,
      });
      if (id !== null) await store.recordActivity(conversationId, { preview: body, at, inbound: false, author: "agent" });
      return;
    }

    const id = await store.insertMessage({
      conversationId,
      wamid: message.mid,
      direction: "in",
      type: message.attachments?.[0]?.type ?? "text",
      body,
      status: "received",
      rawPayload: event,
      messageAt: at,
    });
    if (id === null) return; // mid repetido: Meta reintentó el webhook
    await store.recordActivity(conversationId, { preview: body, at, inbound: true });
    await enrichContact(store, deps, account, conversationId, accountId, contactId);
    return;
  }

  if (event.delivery?.mids) {
    for (const mid of event.delivery.mids) await store.updateStatusByWamid(mid, "delivered", null);
  }

  if (event.read) {
    if (event.read.mid) {
      await store.updateStatusByWamid(event.read.mid, "read", null);
    } else if (event.read.watermark && event.sender?.id) {
      const conversationId = await store.findConversationId(channel, accountId, event.sender.id);
      if (conversationId) await store.markOutboundReadUntil(conversationId, toUnix(event.read.watermark));
    }
  }
}

// --- Comentarios (IG, FB y Threads comparten el mismo flujo) ---

interface IncomingComment {
  channel: Extract<ChannelId, "igc" | "fbc" | "th">;
  // Conexión que recibió el comentario (null solo en Threads sin cuenta configurada)
  account: SocialAccount | null;
  accountId: string;
  // Identifica a quien comenta (id, o @usuario en Threads)
  authorKey: string;
  contactName: string | null;
  handle: string | null;
  postId: string;
  commentId: string;
  text: string;
  at: number;
  raw: unknown;
}

async function ingestComment(comment: IncomingComment, store: InboxStore, deps: ResolvedDeps) {
  // Una conversación por persona y publicación.
  const contactId = `${comment.authorKey}:${comment.postId}`;
  const clientId = comment.account?.clientId ?? undefined;
  const conversationId = await store.upsertConversation(comment.accountId, contactId, comment.contactName, {
    channel: comment.channel,
    accountId: clientId,
    handle: comment.handle,
  });

  // La publicación se busca una sola vez por conversación.
  const conversation = await store.getConversation(conversationId);
  if (conversation && !conversation.post) {
    const account = comment.account;
    if (account?.accessToken) {
      try {
        const post = await deps.post(account, comment.postId);
        await store.upsertConversation(comment.accountId, contactId, null, { channel: comment.channel, accountId: clientId, post });
      } catch (err) {
        console.info(`${LOG} No se pudo obtener la publicación ${comment.postId}:`, (err as Error).message);
      }
    }
  }

  const body = comment.text.trim() || "[comentario sin texto]";
  const id = await store.insertMessage({
    conversationId,
    wamid: comment.commentId,
    direction: "in",
    type: "comment",
    body,
    status: "received",
    rawPayload: comment.raw,
    messageAt: comment.at,
  });
  if (id !== null) await store.recordActivity(conversationId, { preview: body, at: comment.at, inbound: true });
}

async function handleInstagramComment(
  account: SocialAccount,
  value: InstagramCommentValue,
  time: number | undefined,
  store: InboxStore,
  deps: ResolvedDeps
) {
  const commenterId = value.from?.id;
  const mediaId = value.media?.id;
  const accountId = account.accountId;
  if (!value.id || !commenterId || !mediaId) return;
  // Las respuestas de la propia cuenta: las que salen del panel ya están guardadas.
  if (commenterId === accountId) return;
  await ingestComment(
    {
      channel: "igc",
      account,
      accountId,
      authorKey: commenterId,
      contactName: null,
      handle: value.from?.username ? `@${value.from.username}` : null,
      postId: mediaId,
      commentId: value.id,
      text: value.text ?? "",
      at: toUnix(time),
      raw: value,
    },
    store,
    deps
  );
}

async function handleFacebookFeed(
  account: SocialAccount,
  value: FeedValue,
  time: number | undefined,
  store: InboxStore,
  deps: ResolvedDeps
) {
  const pageId = account.accountId;
  // Solo comentarios; reacciones, publicaciones nuevas, etc. se ignoran.
  if (value.item !== "comment" || !value.comment_id) return;
  const at = toUnix(value.created_time ?? time);
  if (value.verb === "edited") {
    await store.editMessageByWamid(value.comment_id, value.message?.trim() || "[comentario sin texto]", at);
    return;
  }
  if (value.verb === "remove") {
    await store.markDeletedByWamid(value.comment_id, at);
    return;
  }
  if (value.verb !== "add" || !value.post_id) return;
  const fromId = value.from?.id;
  if (fromId === pageId) return; // respuesta de la propia página
  await ingestComment(
    {
      channel: "fbc",
      account,
      accountId: pageId,
      // Sin el permiso de lectura de perfiles Meta puede no mandar "from".
      authorKey: fromId ?? `anon-${value.comment_id}`,
      contactName: value.from?.name ?? null,
      handle: null,
      postId: value.post_id,
      commentId: value.comment_id,
      text: value.message ?? "",
      at,
      raw: value,
    },
    store,
    deps
  );
}

export async function processSocialWebhook(payload: unknown, deps: SocialWebhookDeps = {}) {
  const data = payload as SocialPayload;
  const channel: "ig" | "fb" | null = data?.object === "page" ? "fb" : data?.object === "instagram" ? "ig" : null;
  if (!channel || !Array.isArray(data.entry)) {
    console.warn(`${LOG} Payload desconocido:`, JSON.stringify(payload).slice(0, 2000));
    return;
  }

  const store = deps.store ?? (await getInboxStore());
  const resolved = resolveDeps(deps);

  for (const entry of data.entry) {
    const accountId = entry.id;
    if (!accountId) continue;
    const account = await resolved.getAccount(channel, accountId);
    if (!account) {
      // Nadie conectó esta página / cuenta (o se desconectó): no se guarda nada.
      console.info(`${LOG} Evento de ${data.object} ${accountId} sin conexión activa: se descarta.`);
      continue;
    }
    for (const event of entry.messaging ?? []) {
      await handleMessaging(channel, account, event, store, resolved);
    }
    for (const change of entry.changes ?? []) {
      if (channel === "ig" && change.field === "comments" && change.value) {
        await handleInstagramComment(account, change.value as InstagramCommentValue, entry.time, store, resolved);
      } else if (channel === "fb" && change.field === "feed" && change.value) {
        await handleFacebookFeed(account, change.value as FeedValue, entry.time, store, resolved);
      } else {
        console.info(`${LOG} Campo "${change.field}" de ${data.object} no manejado.`);
      }
    }
  }
}

// --- Threads ---
//
// Formato de los webhooks de Threads (campo "replies"):
// { app_id, topic: "moderate", target_id: <threads user id>, time,
//   values: [{ field: "replies", value: { id, username, text, timestamp, permalink,
//              replied_to: { id }, root_post: { id, owner_id, username } } }] }
// Se aceptan también entregas en formato "entry[]" por si Meta lo unifica.

interface ThreadsReplyValue {
  id?: string;
  username?: string;
  text?: string;
  timestamp?: string;
  media_type?: string;
  replied_to?: { id?: string };
  root_post?: { id?: string; owner_id?: string; username?: string };
}

interface ThreadsPayload {
  target_id?: string;
  time?: number;
  values?: { field?: string; value?: ThreadsReplyValue }[];
  entry?: { id?: string; time?: number; changes?: { field?: string; value?: ThreadsReplyValue }[] }[];
}

export async function processThreadsWebhook(payload: unknown, deps: SocialWebhookDeps = {}) {
  const data = payload as ThreadsPayload;
  const batches: { accountId: string | undefined; time?: number; items: { field?: string; value?: ThreadsReplyValue }[] }[] = [];
  if (Array.isArray(data?.values)) batches.push({ accountId: data.target_id, time: data.time, items: data.values });
  for (const entry of data?.entry ?? []) batches.push({ accountId: entry.id, time: entry.time, items: entry.changes ?? [] });
  if (batches.length === 0) {
    console.warn(`${LOG} Payload de Threads desconocido:`, JSON.stringify(payload).slice(0, 2000));
    return;
  }

  const store = deps.store ?? (await getInboxStore());
  const resolved = resolveDeps(deps);

  for (const batch of batches) {
    for (const item of batch.items) {
      const value = item.value;
      if (!value || (item.field !== "replies" && item.field !== "mentions")) {
        console.info(`${LOG} Campo "${item.field}" de Threads no manejado.`);
        continue;
      }
      const accountId = batch.accountId ?? value.root_post?.owner_id;
      const username = value.username?.replace(/^@/, "");
      const rootId = value.root_post?.id ?? value.replied_to?.id;
      if (!accountId || !value.id || !username || !rootId) continue;

      // Respuestas de la propia cuenta (las del panel ya están guardadas).
      const account = await resolved.getAccount("th", accountId);
      const own = account?.displayName?.replace(/^@/, "").toLowerCase();
      if (own && own === username.toLowerCase()) continue;
      if (value.root_post?.username && value.root_post.username.toLowerCase() === username.toLowerCase() && !own) {
        // Sin cuenta configurada: si quien responde es el dueño del hilo, es la propia cuenta.
        continue;
      }

      await ingestComment(
        {
          channel: "th",
          account,
          accountId,
          authorKey: `@${username}`,
          contactName: null,
          handle: `@${username}`,
          postId: rootId,
          commentId: value.id,
          text: value.text ?? "",
          at: toUnix(value.timestamp ?? batch.time),
          raw: value,
        },
        store,
        resolved
      );
    }
  }
}
