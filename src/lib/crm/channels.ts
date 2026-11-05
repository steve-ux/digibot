// Canales del CRM: un solo lugar para nombre, ícono y color. Sin imports de
// servidor: lo usan tanto las APIs como los componentes cliente.

// wa = WhatsApp · ig = DMs de Instagram · igc = comentarios de Instagram
// fb = Messenger · fbc = comentarios de Facebook · th = respuestas en Threads
export type ChannelId = "wa" | "ig" | "igc" | "fb" | "fbc" | "th";

export const CHANNEL_IDS: ChannelId[] = ["wa", "ig", "igc", "fb", "fbc", "th"];

export interface ChannelInfo {
  id: ChannelId;
  // Nombre corto (chips, listas)
  name: string;
  // Nombre largo (tarjetas de Canales, subtítulo del chat)
  longName: string;
  icon: string;
  // Color de marca (gráficos). Viene de las variables --crm-ch-*.
  color: string;
}

export const CHANNELS: Record<ChannelId, ChannelInfo> = {
  wa: { id: "wa", name: "WhatsApp", longName: "WhatsApp", icon: "/crm/channels/wa.svg", color: "var(--crm-ch-wa)" },
  ig: { id: "ig", name: "Instagram", longName: "Instagram", icon: "/crm/channels/ig.svg", color: "var(--crm-ch-ig)" },
  igc: {
    id: "igc",
    name: "Comentarios IG",
    longName: "Comentarios de Instagram",
    icon: "/crm/channels/igc.svg",
    color: "var(--crm-ch-igc)",
  },
  fb: { id: "fb", name: "Messenger", longName: "Messenger", icon: "/crm/channels/fb.svg", color: "var(--crm-ch-fb)" },
  fbc: {
    id: "fbc",
    name: "Comentarios FB",
    longName: "Comentarios de Facebook",
    icon: "/crm/channels/Facebook_f_logo.svg.webp",
    color: "var(--crm-ch-fbc)",
  },
  th: { id: "th", name: "Threads", longName: "Threads", icon: "/crm/channels/Threads_logo.png", color: "var(--crm-ch-th)" },
};

// Canales donde se responde a una publicación (no son chats privados).
export function isCommentChannel(channel: ChannelId) {
  return channel === "igc" || channel === "fbc" || channel === "th";
}

// Donde Meta permite "responder por privado" un comentario (llega como DM).
export function supportsPrivateReply(channel: ChannelId) {
  return channel === "igc" || channel === "fbc";
}

// "Comentario en Instagram", "Respuesta en Threads"…
export function commentContextLabel(channel: ChannelId) {
  if (channel === "igc") return "Comentario en Instagram";
  if (channel === "fbc") return "Comentario en Facebook";
  if (channel === "th") return "Respuesta en Threads";
  return CHANNELS[channel].name;
}

// Paleta de avatares (iniciales). Se elige por id para que sea estable.
export const AVATAR_COLORS = [
  "#0066FF",
  "#7C3AED",
  "#0E7C7B",
  "#C2410C",
  "#BE185D",
  "#15803D",
  "#0E7490",
  "#7E22CE",
  "#C2410C",
];

export function avatarColor(seed: number) {
  return AVATAR_COLORS[Math.abs(seed) % AVATAR_COLORS.length];
}

export function initialsOf(name: string) {
  const clean = name.replace(/^[@+]/, "").trim();
  if (!clean) return "#";
  if (/^\d/.test(clean)) return "#";
  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
