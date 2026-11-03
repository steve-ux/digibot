// Llamadas a la Graph API para Messenger e Instagram (API con inicio de sesión
// de Facebook, usando el token de la página). Server-only.
//
// Endpoints:
//   DM (Messenger e Instagram) ........ POST /{page-id}/messages
//   Respuesta privada a comentario .... POST /{page-id}/messages  { recipient: { comment_id } }
//   Respuesta pública a comentario IG . POST /{comment-id}/replies
//   Perfil del contacto ............... GET  /{psid | igsid}
//   Publicación de IG ................. GET  /{media-id}

import { MetaApiError, MetaConfigError } from "../meta-whatsapp";
import type { SocialAccount } from "./accounts";

const TIMEOUT_MS = 10_000;

async function socialFetch<T>(account: SocialAccount, path: string, init?: RequestInit): Promise<T> {
  if (!account.accessToken) {
    throw new MetaConfigError(
      "La cuenta no tiene un token de acceso. Volvé a conectarla desde Canales."
    );
  }
  const res = await fetch(`https://graph.facebook.com/${account.apiVersion}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = data?.error;
    throw new MetaApiError(
      error?.message || `Error ${res.status} al llamar a la API de Meta`,
      res.status,
      typeof error?.code === "number" ? error.code : null,
      error?.error_user_title || error?.message || null,
      typeof error?.error_subcode === "number" ? error.error_subcode : null
    );
  }
  return data as T;
}

export interface SendResult {
  // mid del mensaje (DM / respuesta privada) o id del comentario (respuesta pública)
  id: string | null;
}

// RESPONSE dentro de las 24 h; pasado eso y hasta 7 días, Meta permite que
// responda una persona con la etiqueta HUMAN_AGENT (requiere ese permiso aprobado).
export type MessagingWindow = "standard" | "human_agent";

export async function sendDirectMessage(
  account: SocialAccount,
  recipientId: string,
  text: string,
  window: MessagingWindow = "standard"
): Promise<SendResult> {
  const body =
    window === "human_agent"
      ? { recipient: { id: recipientId }, messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT", message: { text } }
      : { recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text } };
  const data = await socialFetch<{ message_id?: string }>(account, `/${account.pageId}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { id: data.message_id ?? null };
}

export async function sendPrivateReply(account: SocialAccount, commentId: string, text: string): Promise<SendResult> {
  const data = await socialFetch<{ message_id?: string }>(account, `/${account.pageId}/messages`, {
    method: "POST",
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
  });
  return { id: data.message_id ?? null };
}

export async function replyToComment(account: SocialAccount, commentId: string, text: string): Promise<SendResult> {
  const data = await socialFetch<{ id?: string }>(account, `/${commentId}/replies`, {
    method: "POST",
    body: JSON.stringify({ message: text }),
  });
  return { id: data.id ?? null };
}

export interface SocialProfile {
  name: string | null;
  username: string | null;
}

export async function fetchProfile(account: SocialAccount, userId: string): Promise<SocialProfile> {
  if (account.channel === "ig") {
    const data = await socialFetch<{ name?: string; username?: string }>(account, `/${userId}?fields=name,username`);
    return { name: data.name ?? null, username: data.username ?? null };
  }
  const data = await socialFetch<{ first_name?: string; last_name?: string; name?: string }>(
    account,
    `/${userId}?fields=first_name,last_name`
  );
  const name = data.name ?? ([data.first_name, data.last_name].filter(Boolean).join(" ") || null);
  return { name, username: null };
}

export interface MediaInfo {
  mediaId: string;
  caption: string;
  likes: number;
  comments: number;
  thumbnailUrl: string | null;
  permalink: string | null;
}

export async function fetchMedia(account: SocialAccount, mediaId: string): Promise<MediaInfo> {
  const data = await socialFetch<{
    caption?: string;
    like_count?: number;
    comments_count?: number;
    media_type?: string;
    media_url?: string;
    thumbnail_url?: string;
    permalink?: string;
  }>(account, `/${mediaId}?fields=caption,like_count,comments_count,media_type,media_url,thumbnail_url,permalink`);
  return {
    mediaId,
    caption: data.caption ?? "",
    likes: data.like_count ?? 0,
    comments: data.comments_count ?? 0,
    // En videos/reels media_url es el video: para la miniatura sirve thumbnail_url.
    thumbnailUrl: data.thumbnail_url ?? (data.media_type === "VIDEO" ? null : data.media_url ?? null),
    permalink: data.permalink ?? null,
  };
}
