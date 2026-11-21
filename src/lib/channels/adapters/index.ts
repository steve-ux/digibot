// Adaptadores por canal. Server-only.
//
//   fb -> Messenger + comentarios de la página (token de página, nodo {page-id})
//   ig -> Instagram: con Unified Login usa el nodo {ig-user-id} y el token de usuario del
//         sistema; el Instagram viejo vinculado a una página usa la página. La diferencia
//         la resuelve graph.messagingNode() según account.authType.
//   th -> Threads (graph.threads.net)

import type { SocialAccount, SocialChannel } from "../../meta-social/accounts";
import {
  fetchFacebookPost,
  fetchMedia,
  fetchProfile,
  fetchThreadsPost,
  replyOnThreads,
  replyToComment,
  replyToFacebookComment,
  sendDirectMessage,
  sendPrivateReply,
} from "../../meta-social/graph";
import type { SocialAdapter } from "./types";

export type { SocialAdapter } from "./types";

const messenger: SocialAdapter = {
  channel: "fb",
  sendMessage: sendDirectMessage,
  replyPublic: replyToFacebookComment,
  replyPrivate: sendPrivateReply,
  fetchProfile,
  fetchPost: fetchFacebookPost,
};

const instagram: SocialAdapter = {
  channel: "ig",
  sendMessage: sendDirectMessage,
  replyPublic: replyToComment,
  replyPrivate: sendPrivateReply,
  fetchProfile,
  fetchPost: fetchMedia,
};

const threads: SocialAdapter = {
  channel: "th",
  replyPublic: replyOnThreads,
  fetchProfile: async () => ({ name: null, username: null }),
  fetchPost: fetchThreadsPost,
};

const ADAPTERS: Record<SocialChannel, SocialAdapter> = { fb: messenger, ig: instagram, th: threads };

export function adapterFor(account: Pick<SocialAccount, "channel">): SocialAdapter {
  return ADAPTERS[account.channel];
}
