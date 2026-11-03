// ¿Se puede responder ahora, y cómo? Reglas de Meta por canal, compartidas por
// el servidor (para no depender de la UI) y por el composer. Sin imports de servidor.
//
//   WhatsApp ............ 24 h desde el último mensaje del cliente; después, solo plantillas.
//   Instagram/Messenger . 24 h libres; de 24 h a 7 días solo con la etiqueta HUMAN_AGENT
//                         (responde una persona); después de 7 días, nada.
//   Comentarios IG ...... respuesta pública siempre; respuesta privada hasta 7 días
//                         después del comentario (y una sola por comentario).

import type { ChannelId } from "./channels";

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
};

export function replyAvailability(
  c: { channel: ChannelId; lastInboundAt: number | null; windowSecondsLeft: number },
  kind: ReplyKind,
  nowUnix = Math.floor(Date.now() / 1000)
): ReplyAvailability {
  const ok = (humanAgent = false): ReplyAvailability => ({ allowed: true, humanAgent, reason: null });
  const no = (reason: string): ReplyAvailability => ({ allowed: false, humanAgent: false, reason });
  const age = c.lastInboundAt === null ? Infinity : nowUnix - c.lastInboundAt;

  if (c.channel === "wa") {
    return c.windowSecondsLeft > 0
      ? ok()
      : no("La ventana de 24 h está cerrada. Solo podés enviar una plantilla aprobada.");
  }

  if (c.channel === "igc") {
    if (kind !== "comment_private") return ok();
    return age <= HUMAN_AGENT_WINDOW_SECONDS
      ? ok()
      : no("Pasaron más de 7 días desde el comentario: ya no se puede responder por privado.");
  }

  if (age <= STANDARD_WINDOW_SECONDS) return ok();
  if (age <= HUMAN_AGENT_WINDOW_SECONDS) return ok(true);
  return no(
    `Pasaron más de 7 días desde su último mensaje. ${CHANNEL_NAMES[c.channel]} no deja responder hasta que te vuelva a escribir.`
  );
}
