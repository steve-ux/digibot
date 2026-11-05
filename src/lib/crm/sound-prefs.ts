// Preferencias de sonido de cada persona (Configuración → Sonidos). Sin imports
// de servidor: lo usan la API (para validar) y el navegador (para sonar).

import { CHANNEL_IDS, type ChannelId } from "./channels";

export const SOUND_IDS = ["bubble", "chime", "ding", "pop", "sparkle", "knock", "click"] as const;
export type SoundId = (typeof SOUND_IDS)[number];
// "off" = ese canal no suena
export type ChannelSound = SoundId | "off";

export const SOUND_LABELS: Record<SoundId, string> = {
  bubble: "Burbuja",
  chime: "Campanita",
  ding: "Ding",
  pop: "Pop",
  sparkle: "Destello",
  knock: "Toc toc",
  click: "Clic",
};

export interface SoundPrefs {
  enabled: boolean;
  // 0 a 100
  volume: number;
  channels: Record<ChannelId, ChannelSound>;
}

// Un sonido distinto por canal para reconocerlo sin mirar la pantalla.
export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  enabled: true,
  volume: 70,
  channels: { wa: "bubble", ig: "chime", igc: "sparkle", fb: "ding", fbc: "knock", th: "click" },
};

const isChannelSound = (v: unknown): v is ChannelSound => v === "off" || SOUND_IDS.includes(v as SoundId);

// Completa lo que falte con los valores por defecto y descarta lo inválido.
export function normalizeSoundPrefs(value: unknown): SoundPrefs {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawChannels = raw.channels && typeof raw.channels === "object" ? (raw.channels as Record<string, unknown>) : {};
  const volume = Number(raw.volume);
  const channels = {} as Record<ChannelId, ChannelSound>;
  for (const id of CHANNEL_IDS) {
    channels[id] = isChannelSound(rawChannels[id]) ? rawChannels[id] : DEFAULT_SOUND_PREFS.channels[id];
  }
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_SOUND_PREFS.enabled,
    volume: Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : DEFAULT_SOUND_PREFS.volume,
    channels,
  };
}

// Sonido que corresponde a un canal (null = sonidos apagados, volumen 0 o canal sin sonido).
export function soundFor(prefs: SoundPrefs, channel: ChannelId): SoundId | null {
  if (!prefs.enabled || prefs.volume === 0) return null;
  const sound = prefs.channels[channel];
  return sound && sound !== "off" ? sound : null;
}

// Conversaciones con mensajes nuevos del cliente entre dos lecturas de la bandeja.
// Se compara lastInboundAt; una conversación que aparece por primera vez cuenta
// si su último mensaje es del cliente.
export function newInboundChannels(
  previous: { id: number; lastInboundAt: number | null }[],
  fresh: { id: number; channel: ChannelId; lastInboundAt: number | null; lastMessageAuthor: string | null }[]
): ChannelId[] {
  const before = new Map(previous.map((c) => [c.id, c.lastInboundAt ?? 0]));
  const channels: ChannelId[] = [];
  for (const c of fresh) {
    const prev = before.get(c.id);
    const isNew =
      prev === undefined ? c.lastMessageAuthor === "customer" && c.lastInboundAt !== null : (c.lastInboundAt ?? 0) > prev;
    if (isNew && !channels.includes(c.channel)) channels.push(c.channel);
  }
  return channels;
}
