// Responder un comentario de TikTok desde la bandeja (canal ttc). Server-only.
// Solo respuesta pública: la Accounts API no tiene respuesta por privado.

import type { ChannelsRepo } from "../channels/repo";
import type { InboxConversation, InboxMessage } from "../wa-inbox/types";
import { replyToComment, TikTokApiError } from "./api";
import { findTikTokAccount, freshAccessToken, TikTokAuthError } from "./connection";

// TikTok acepta comentarios de hasta 150 caracteres.
export const MAX_TIKTOK_COMMENT_LENGTH = 150;

export class TikTokSendError extends Error {}

// wa_id = "<quien comenta>:<id del video>"
export function videoIdOf(conversation: Pick<InboxConversation, "waId" | "post">) {
  const fromPost = conversation.post?.mediaId;
  if (fromPost) return fromPost;
  const i = conversation.waId.lastIndexOf(":");
  return i >= 0 ? conversation.waId.slice(i + 1) : null;
}

export async function replyOnTikTok(conversation: InboxConversation, target: InboxMessage, text: string, repo?: ChannelsRepo) {
  const found = await findTikTokAccount(conversation.phoneNumberId, repo);
  if (!found) throw new TikTokSendError("La cuenta de TikTok no está conectada. Conectala desde Canales.");
  const videoId = videoIdOf(conversation);
  if (!videoId || !target.wamid) throw new TikTokSendError("No se encontró el comentario para responder.");
  // Si el comentario ya es una respuesta, se responde en su hilo (al comentario padre).
  const commentId = target.inReplyTo ?? target.wamid;
  try {
    const token = await freshAccessToken(found.repo, found.record);
    const result = await replyToComment(token, found.record.externalId, videoId, commentId, text);
    return { id: result.id, recipientId: null };
  } catch (err) {
    if (err instanceof TikTokAuthError) throw new TikTokSendError(err.message);
    if (err instanceof TikTokApiError) {
      console.error("[tiktok] Falló la respuesta al comentario:", err.code, err.message, err.requestId);
      throw new TikTokSendError(`TikTok rechazó la respuesta: ${err.message}`);
    }
    throw err;
  }
}
