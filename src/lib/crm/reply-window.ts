// ¿Se puede responder ahora, y cómo? Reglas de Meta por canal, compartidas por
// el servidor (para no depender de la UI) y por el composer. Sin imports de servidor.
//
//   WhatsApp ............ 24 h desde el último mensaje del cliente; después, solo plantillas.
//   Instagram/Messenger . 24 h libres; después, "Ventana cerrada" hasta que el cliente vuelva a escribir.
//                         Con humanAgent (META_HUMAN_AGENT_ENABLED=on, cuando Meta apruebe el permiso)
//                         una persona puede responder hasta 7 días con la etiqueta HUMAN_AGENT.
//   Comentarios IG / FB . respuesta pública siempre; respuesta privada hasta 7 días
//                         después del comentario (y una sola por comentario).
//   Threads ............. solo respuesta pública (la API no tiene mensajes privados).

import { isCommentChannel, supportsPrivateReply, type ChannelId } from "./channels";

const HOUR = 3600;
export const STANDARD_WINDOW_SECONDS = 24 * HOUR;
export const HUMAN_AGENT_WINDOW_SECONDS = 7 * 24 * HOUR;

export type ReplyKind = "message" | "comment_public" | "comment_private";

export interface ReplyAvailability {
  allowed: boolean;
  // Instagram/Messenger entre 24 h y 7 días: se envía con la etiqueta HUMAN_AGENT.
  humanAgent: boolean;
  // Motivo para mostrar si no se puede.
  reason: string | null;
}

const CHANNEL_NAMES: Record<ChannelId, string> = {
  wa: "WhatsApp",
  ig: "Instagram",
  igc: "Instagram",
  fb: "Messenger",
  fbc: "Facebook",
  th: "Threads",
  ttm: "TikTok",
  ttc: "TikTok",
};

export interface ReplyOptions {
  // Etiqueta HUMAN_AGENT habilitada (permiso aprobado por Meta). Apagada por defecto.
  humanAgent?: boolean;
  // Respuesta por privado: cuándo se hizo el comentario (si no viene, el último mensaje del cliente)
  commentAt?: number | null;
}

export const WINDOW_CLOSED_TITLE = "Ventana cerrada";

export function replyAvailability(
  c: { channel: ChannelId; lastInboundAt: number | null; windowSecondsLeft: number },
  kind: ReplyKind,
  nowUnix = Math.floor(Date.now() / 1000),
  options: ReplyOptions = {}
): ReplyAvailability {
  const ok = (humanAgent = false): ReplyAvailability => ({ allowed: true, humanAgent, reason: null });
  const no = (reason: string): ReplyAvailability => ({ allowed: false, humanAgent: false, reason });
  const age = c.lastInboundAt === null ? Infinity : nowUnix - c.lastInboundAt;

  if (c.channel === "wa") {
    return c.windowSecondsLeft > 0
      ? ok()
      : no("La ventana de 24 h está cerrada. Solo podés enviar una plantilla aprobada.");
  }

  if (isCommentChannel(c.channel)) {
    if (kind !== "comment_private") return ok();
    if (!supportsPrivateReply(c.channel)) return no(`${CHANNEL_NAMES[c.channel]} no permite responder por privado.`);
    const commentAge = options.commentAt != null ? nowUnix - options.commentAt : age;
    return commentAge <= HUMAN_AGENT_WINDOW_SECONDS
      ? ok()
      : no("Pasaron más de 7 días desde el comentario: ya no se puede responder por privado.");
  }

  if (age <= STANDARD_WINDOW_SECONDS) return ok();
  if (options.humanAgent && age <= HUMAN_AGENT_WINDOW_SECONDS) return ok(true);
  return no(
    `${WINDOW_CLOSED_TITLE}: pasaron más de 24 h desde su último mensaje. ${CHANNEL_NAMES[c.channel]} no deja responder hasta que te vuelva a escribir.`
  );
}
