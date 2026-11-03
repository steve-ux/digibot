// Mensajes de ejemplo para Métricas en modo demo: ~60 días de actividad con
// forma realista (más de día que de noche, menos los fines de semana). Se
// generan con una semilla fija por día, así los números no saltan al recargar.
// Pasan por el mismo computeMetrics() que los datos reales.

import type { ChannelId } from "./channels";
import { TZ_OFFSET_SECONDS, type MetricsMessage } from "./metrics";

const DAY = 24 * 60 * 60;

// Peso de cada canal en el volumen.
const CHANNEL_WEIGHTS: [ChannelId, number][] = [
  ["wa", 46],
  ["ig", 20],
  ["igc", 12],
  ["fb", 9],
  ["fbc", 8],
  ["th", 5],
];

// Peso de cada hora del día (0-23).
const HOUR_WEIGHTS = [0.3, 0.2, 0.1, 0.1, 0.1, 0.2, 0.4, 0.8, 1.6, 2.4, 3, 3.1, 2.8, 2.6, 2.7, 2.9, 3, 3.1, 3.2, 3, 2.6, 2, 1.3, 0.7];
// Volumen relativo por día de la semana (domingo = 0).
const WEEKDAY_FACTOR = [0.45, 1, 1.05, 1, 1.1, 1.05, 0.7];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, weighted: [T, number][]) {
  const total = weighted.reduce((a, [, w]) => a + w, 0);
  let r = random() * total;
  for (const [value, w] of weighted) {
    r -= w;
    if (r <= 0) return value;
  }
  return weighted[weighted.length - 1][0];
}

// team: nombres del equipo de ejemplo, con cuánto trabaja cada uno y qué tan rápido responde (segundos).
export function demoMetricsMessages(now: number, team: { name: string; weight: number; speed: number }[]): MetricsMessage[] {
  const messages: MetricsMessage[] = [];
  const todayLocal = Math.floor((now + TZ_OFFSET_SECONDS) / DAY);
  let conversationId = 1;

  for (let d = 60; d >= 0; d--) {
    const dayLocal = todayLocal - d;
    const random = rng(dayLocal * 7919);
    const dayStart = dayLocal * DAY - TZ_OFFSET_SECONDS;
    const weekday = new Date(dayLocal * DAY * 1000).getUTCDay();
    // Tendencia suave hacia arriba en los últimos días.
    const volume = Math.round((62 + 18 * random()) * WEEKDAY_FACTOR[weekday] * (1 + (60 - d) * 0.004));

    for (let i = 0; i < volume; i++) {
      const hour = pick(random, HOUR_WEIGHTS.map((w, h) => [h, w] as [number, number]));
      const start = dayStart + hour * 3600 + Math.floor(random() * 3600);
      if (start > now) continue;
      const channel = pick(random, CHANNEL_WEIGHTS);
      const id = conversationId++;
      messages.push({ conversationId: id, channel, kind: "in", authorName: null, at: start });

      // ~75% lo resuelve DigiBot solo; el resto pasa al equipo (a veces después de que el bot saluda).
      const botOnly = random() < 0.75;
      let t = start;
      if (botOnly || random() < 0.5) {
        t += 4 + Math.floor(random() * 50);
        if (t <= now) messages.push({ conversationId: id, channel, kind: "bot", authorName: null, at: t });
      }
      if (!botOnly) {
        const person = pick(random, team.map((p) => [p, p.weight] as [typeof p, number]));
        t += 20 + Math.floor(random() * 30);
        if (t <= now) messages.push({ conversationId: id, channel, kind: "in", authorName: null, at: t });
        t += Math.floor(person.speed * (0.5 + random()));
        if (t <= now) messages.push({ conversationId: id, channel, kind: "agent", authorName: person.name, at: t });
        if (random() < 0.9) {
          t += 120 + Math.floor(random() * 900);
          if (t <= now) messages.push({ conversationId: id, channel, kind: "resolve", authorName: person.name, at: t });
        }
      }
    }
  }
  return messages;
}
