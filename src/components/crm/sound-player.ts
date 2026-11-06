// Sonidos de mensajes nuevos, sintetizados con Web Audio (no hay archivos que
// descargar). Solo navegador. Los navegadores no dejan sonar hasta que la
// persona toca algo en la página: unlockAudio() se llama en el primer click.

import type { SoundId } from "@/lib/crm/sound-prefs";

let ctx: AudioContext | null = null;
let lastPlayedAt = 0;
// Varios mensajes juntos suenan una sola vez.
const MIN_GAP_MS = 1200;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() {
  audio();
}

interface Tone {
  type: OscillatorType;
  from: number;
  to?: number;
  at: number;
  dur: number;
  gain: number;
}

function tone(c: AudioContext, out: AudioNode, t0: number, { type, from, to, at, dur, gain }: Tone) {
  const start = t0 + at;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur * 0.8);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(env).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.03);
}

const PRESETS: Record<SoundId, Tone[]> = {
  // WhatsApp: dos burbujas que suben
  bubble: [
    { type: "sine", from: 320, to: 950, at: 0, dur: 0.1, gain: 0.9 },
    { type: "sine", from: 520, to: 1450, at: 0.1, dur: 0.08, gain: 0.6 },
  ],
  chime: [
    { type: "triangle", from: 1318.5, at: 0, dur: 0.5, gain: 0.5 },
    { type: "triangle", from: 1975.5, at: 0.12, dur: 0.7, gain: 0.4 },
  ],
  ding: [
    { type: "sine", from: 880, at: 0, dur: 0.9, gain: 0.6 },
    { type: "sine", from: 1760, at: 0, dur: 0.45, gain: 0.15 },
  ],
  pop: [{ type: "sine", from: 900, to: 180, at: 0, dur: 0.09, gain: 1 }],
  sparkle: [
    { type: "sine", from: 1568, at: 0, dur: 0.18, gain: 0.35 },
    { type: "sine", from: 2093, at: 0.07, dur: 0.18, gain: 0.35 },
    { type: "sine", from: 2637, at: 0.14, dur: 0.22, gain: 0.35 },
  ],
  knock: [
    { type: "triangle", from: 230, to: 140, at: 0, dur: 0.08, gain: 0.9 },
    { type: "triangle", from: 230, to: 140, at: 0.13, dur: 0.08, gain: 0.9 },
  ],
  click: [
    { type: "square", from: 2400, at: 0, dur: 0.03, gain: 0.22 },
    { type: "square", from: 1800, at: 0.055, dur: 0.025, gain: 0.18 },
  ],
  // Gota de agua: cae rápido de agudo a grave
  drop: [{ type: "sine", from: 1400, to: 380, at: 0, dur: 0.14, gain: 0.8 }],
  pluck: [
    { type: "triangle", from: 659, at: 0, dur: 0.35, gain: 0.6 },
    { type: "triangle", from: 988, at: 0.09, dur: 0.4, gain: 0.45 },
  ],
  blip: [
    { type: "square", from: 880, to: 1320, at: 0, dur: 0.07, gain: 0.18 },
    { type: "square", from: 1320, to: 1760, at: 0.09, dur: 0.07, gain: 0.15 },
  ],
};

// volume 0-100. force = "Probar" en Configuración (no respeta el intervalo mínimo).
export function playSound(sound: SoundId, volume: number, force = false) {
  const now = Date.now();
  if (!force && now - lastPlayedAt < MIN_GAP_MS) return;
  const c = audio();
  if (!c) return;
  const play = () => {
    lastPlayedAt = Date.now();
    const master = c.createGain();
    master.gain.value = (Math.min(100, Math.max(0, volume)) / 100) * 0.6;
    master.connect(c.destination);
    const t0 = c.currentTime + 0.01;
    for (const t of PRESETS[sound]) tone(c, master, t0, t);
  };
  if (c.state === "running") play();
  // Desde un click (Probar) el contexto se puede reanudar recién ahora.
  else if (force) c.resume().then(play, () => {});
}
