// Webhooks de Messenger (object "page") e Instagram (object "instagram"),
// normalizados al mismo modelo de la bandeja que WhatsApp. Server-only.
//
//   page      / messaging[]            -> canal fb  (DMs de Messenger)
//   instagram / messaging[]            -> canal ig  (DMs de Instagram)
//   instagram / changes[field=comments]-> canal igc (comentarios en publicaciones)
//
// Los eventos de "entregado" y "leído" actualizan el estado de los salientes.

import { getInboxStore, type InboxStore } from "../wa-inbox/store";
import type { InboxPost } from "../wa-inbox/types";
import { getSocialAccount, type SocialAccount, type SocialChannel } from "./accounts";
import { fetchMedia, fetchProfile, type MediaInfo, type SocialProfile } from "./graph";

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

interface CommentValue {
  id?: string;
  text?: string;
  parent_id?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string; media_product_type?: string };
}

interface SocialPayload {
  object?: string;
  entry?: {
    id?: string;
    time?: number;
    messaging?: MessagingEvent[];
    changes?: { field?: string; value?: CommentValue }[];
  }[];
}

export interface SocialWebhookDeps {
  store?: InboxStore;
  getAccount?: (channel: SocialChannel, accountId: string) => Promise<SocialAccount | null>;
  profile?: (account: SocialAccount, userId: string) => Promise<SocialProfile>;
  media?: (account: SocialAccount, mediaId: string) => Promise<MediaInfo>;
  // META_APP_ID: los ecos de mensajes que mandó esta misma app se ignoran (ya están guardados).
  appId?: string | null;
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

const toUnix = (ms: number | undefined) =>
  ms && Number.isFinite(ms) ? Math.floor(ms > 1e12 ? ms / 1000 : ms) : Math.floor(Date.now() / 1000);

const CHANNEL_NAMES: Record<SocialChannel, string> = { ig: "Instagram", fb: "Messenger" };

// No volver a pedir el perfil de alguien a cada mensaje si Meta no lo devuelve.
const PROFILE_RETRY_MS = 60 * 60 * 1000;
const profileMisses = new Map<string, number>();

async function enrichContact(
  store: InboxStore,
  deps: Required<Pick<SocialWebhookDeps, "profile">>,
  account: SocialAccount | null,
  conversationId: number,
  accountId: string,
  contactId: string
) {
  if (!account?.accessToken) return;
  const conversation = await store.getConversation(conversationId);
  if (!conversation || conversation.contactName) return;
  const key = `${account.channel}:${contactId}`;
  if ((profileMisses.get(key) ?? 0) > Date.now()) return;
  try {
    const profile = await deps.profile(account, contactId);
    if (!profile.name && !profile.username) throw new Error("perfil vacío");
    await store.upsertConversation(accountId, contactId, profile.name ?? profile.username, {
      channel: account.channel,
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
  channel: SocialChannel,
  accountId: string,
  event: MessagingEvent,
  store: InboxStore,
  deps: Required<Omit<SocialWebhookDeps, "store">>
) {
  if (event.message && !event.message.is_deleted) {
    const message = event.message;
    const echo = Boolean(message.is_echo);
    const contactId = echo ? event.recipient?.id : event.sender?.id;
    if (!contactId) return;

    if (echo && deps.appId && message.app_id !== undefined && String(message.app_id) === deps.appId) return;

    const body = describeSocialMessage(message);
    const at = toUnix(event.timestamp);
    const conversationId = await store.upsertConversation(accountId, contactId, null, { channel });

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
    await enrichContact(store, deps, await deps.getAccount(channel, accountId), conversationId, accountId, contactId);
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

async function handleComment(
  accountId: string,
  value: CommentValue,
  time: number | undefined,
  store: InboxStore,
  deps: Required<Omit<SocialWebhookDeps, "store">>
) {
  const commenterId = value.from?.id;
  const mediaId = value.media?.id;
  if (!value.id || !commenterId || !mediaId) return;
  // Las respuestas de la propia cuenta: las que salen del panel ya están guardadas.
  if (commenterId === accountId) return;

  const contactId = `${commenterId}:${mediaId}`;
  const handle = value.from?.username ? `@${value.from.username}` : null;
  const conversationId = await store.upsertConversation(accountId, contactId, null, { channel: "igc", handle });

  // La publicación se busca una sola vez por conversación.
  const conversation = await store.getConversation(conversationId);
  if (conversation && !conversation.post) {
    const account = await deps.getAccount("ig", accountId);
    if (account?.accessToken) {
      try {
        const media = await deps.media(account, mediaId);
        const post: InboxPost = { ...media };
        await store.upsertConversation(accountId, contactId, null, { channel: "igc", post });
      } catch (err) {
        console.info(`${LOG} No se pudo obtener la publicación ${mediaId}:`, (err as Error).message);
      }
    }
  }

  const body = value.text?.trim() || "[comentario sin texto]";
  const at = time ? toUnix(time) : Math.floor(Date.now() / 1000);
  const id = await store.insertMessage({
    conversationId,
    wamid: value.id,
    direction: "in",
    type: "comment",
    body,
    status: "received",
    rawPayload: value,
    messageAt: at,
  });
  if (id !== null) await store.recordActivity(conversationId, { preview: body, at, inbound: true });
}

export async function processSocialWebhook(payload: unknown, deps: SocialWebhookDeps = {}) {
  const data = payload as SocialPayload;
  const channel: SocialChannel | null =
    data?.object === "page" ? "fb" : data?.object === "instagram" ? "ig" : null;
  if (!channel || !Array.isArray(data.entry)) {
    console.warn(`${LOG} Payload desconocido:`, JSON.stringify(payload).slice(0, 2000));
    return;
  }

  const store = deps.store ?? (await getInboxStore());
  const resolved: Required<Omit<SocialWebhookDeps, "store">> = {
    getAccount: deps.getAccount ?? getSocialAccount,
    profile: deps.profile ?? fetchProfile,
    media: deps.media ?? fetchMedia,
    appId: deps.appId !== undefined ? deps.appId : process.env.META_APP_ID || null,
  };

  for (const entry of data.entry) {
    const accountId = entry.id;
    if (!accountId) continue;
    for (const event of entry.messaging ?? []) {
      await handleMessaging(channel, accountId, event, store, resolved);
    }
    for (const change of entry.changes ?? []) {
      if (channel === "ig" && change.field === "comments" && change.value) {
        await handleComment(accountId, change.value, entry.time, store, resolved);
      } else {
        console.info(`${LOG} Campo "${change.field}" de ${data.object} no manejado.`);
      }
    }
  }
}
