// Contrato común de los canales sociales (Messenger, Instagram, Threads). Server-only.
//
// La bandeja (envío) y el webhook hablan con un SocialAdapter y no saben qué endpoint,
// host o token usa cada canal: eso vive en cada adaptador. WhatsApp sigue por su camino
// (src/lib/meta-whatsapp.ts), que ya tiene su propio modelo de plantillas y ventana.

import type { SocialAccount, SocialChannel } from "../../meta-social/accounts";
import type { MediaInfo, MessagingWindow, SendResult, SocialProfile } from "../../meta-social/graph";

export type { MediaInfo, MessagingWindow, SendResult, SocialProfile };

export interface SocialAdapter {
  channel: SocialChannel;
  // Mensaje directo (PSID / IGSID). Threads no tiene.
  sendMessage?(account: SocialAccount, recipientId: string, text: string, window: MessagingWindow): Promise<SendResult>;
  // Respuesta pública a un comentario.
  replyPublic(account: SocialAccount, commentId: string, text: string): Promise<SendResult>;
  // Respuesta por privado a quien comentó (una sola vez, hasta 7 días). Threads no tiene.
  replyPrivate?(account: SocialAccount, commentId: string, text: string): Promise<SendResult>;
  fetchProfile(account: SocialAccount, userId: string): Promise<SocialProfile>;
  fetchPost(account: SocialAccount, postId: string): Promise<MediaInfo>;
}
