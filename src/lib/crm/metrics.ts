// Métricas de una cuenta. Función pura: recibe los mensajes del período (y del
// período anterior, para comparar) y arma el reporte. La usan el endpoint
// /api/admin/cuentas/:cuenta/metricas (con datos de la base) y el modo demo
// (con datos de ejemplo), así los números se calculan siempre igual.
// Sin imports de servidor.
//
// Definiciones:
// - Conversaciones: las que tuvieron al menos un mensaje del cliente en el período.
//   En el gráfico cuentan en el tramo de su primer mensaje del período.
// - Resueltas por DigiBot: de las respondidas, las que respondió solo el bot.
// - Primera respuesta: desde el primer mensaje del cliente en el período hasta la
//   primera respuesta (del bot o del equipo). Promedio.
// - Esperando respuesta ahora: abiertas cuyo último mensaje es del cliente
//   (= filtro "Sin responder" de la Bandeja). No depende del período.
// - Equipo: atendidas (conversaciones donde respondió), responde en (desde el
//   mensaje del cliente hasta su respuesta) y resueltas (las que marcó resueltas).

import { CHANNEL_IDS, type ChannelId } from "./channels";

export type MetricsPeriod = "today" | "7d" | "30d";
export const METRICS_PERIODS: { id: MetricsPeriod; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
];

export function isMetricsPeriod(value: unknown): value is MetricsPeriod {
  return value === "today" || value === "7d" || value === "30d";
}

// Mensaje mínimo que necesita el cálculo.
export interface MetricsMessage {
  conversationId: number;
  channel: ChannelId;
  // in = cliente · bot / agent = respuestas · resolve = alguien marcó resuelta
  kind: "in" | "bot" | "agent" | "resolve";
  // Persona del equipo (respuestas del equipo y resoluciones)
  authorName: string | null;
  at: number;
}

export interface MetricsBar {
  label: string;
  // Etiqueta larga para lectores de pantalla y tooltip ("Lunes 3/11", "14 a 16 h")
  title: string;
  total: number;
  byChannel: Record<ChannelId, number>;
}

export interface Delta {
  text: string;
  // good = verde · bad = ámbar · neutral = gris
  tone: "good" | "bad" | "neutral";
}

export interface TeamRow {
  name: string;
  handled: number;
  avgResponseSeconds: number | null;
  resolved: number;
}

export interface MetricsReport {
  period: MetricsPeriod;
  from: number;
  to: number;
  conversations: number;
  conversationsDelta: Delta | null;
  // 0-100, null si no hubo respuestas
  botResolvedPct: number | null;
  botResolvedDelta: Delta | null;
  firstResponseSeconds: number | null;
  firstResponseDelta: Delta | null;
  waitingNow: number;
  bars: MetricsBar[];
  // Quién respondió (conversaciones respondidas)
  split: { bot: number; team: number };
  // Conversaciones por canal (para la participación)
  byChannel: Record<ChannelId, number>;
  team: TeamRow[];
}

// Argentina: UTC-3 todo el año (sin horario de verano).
export const TZ_OFFSET_SECONDS = -3 * 60 * 60;
const DAY = 24 * 60 * 60;
const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAYS_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// Medianoche local (en unix) del día de `at`.
function localMidnight(at: number) {
  const local = at + TZ_OFFSET_SECONDS;
  return local - (((local % DAY) + DAY) % DAY) - TZ_OFFSET_SECONDS;
}

function localDate(at: number) {
  return new Date((at + TZ_OFFSET_SECONDS) * 1000);
}

interface Bucket {
  start: number;
  end: number;
  label: string;
  title: string;
}

// Rango del período (desde, hasta) y sus tramos para el gráfico.
export function periodRange(period: MetricsPeriod, now: number): { from: number; to: number; buckets: Bucket[] } {
  const today = localMidnight(now);
  if (period === "today") {
    const buckets: Bucket[] = [];
    for (let h = 0; h < 24; h += 2) {
      const start = today + h * 3600;
      buckets.push({ start, end: start + 7200, label: `${h}h`, title: `De ${h} a ${h + 2} h` });
    }
    return { from: today, to: now, buckets };
  }
  const days = period === "7d" ? 7 : 30;
  const from = today - (days - 1) * DAY;
  const buckets: Bucket[] = [];
  for (let i = 0; i < days; i++) {
    const start = from + i * DAY;
    const d = localDate(start);
    const dm = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
    buckets.push({
      start,
      end: start + DAY,
      label: period === "7d" ? WEEKDAYS[d.getUTCDay()] : dm,
      title: `${WEEKDAYS_LONG[d.getUTCDay()]} ${dm}`,
    });
  }
  return { from, to: now, buckets };
}

function emptyByChannel(): Record<ChannelId, number> {
  return Object.fromEntries(CHANNEL_IDS.map((c) => [c, 0])) as Record<ChannelId, number>;
}

interface Summary {
  conversations: number;
  botResolvedPct: number | null;
  firstResponseSeconds: number | null;
}

interface ConversationAgg {
  channel: ChannelId;
  firstIn: number | null;
  firstReply: number | null;
  bot: boolean;
  agent: boolean;
}

function aggregate(messages: MetricsMessage[], from: number, to: number) {
  const byConversation = new Map<number, ConversationAgg>();
  const inRange = messages.filter((m) => m.at >= from && m.at <= to).sort((a, b) => a.at - b.at);
  for (const m of inRange) {
    let c = byConversation.get(m.conversationId);
    if (!c) {
      c = { channel: m.channel, firstIn: null, firstReply: null, bot: false, agent: false };
      byConversation.set(m.conversationId, c);
    }
    if (m.kind === "in") {
      if (c.firstIn === null) c.firstIn = m.at;
    } else if (m.kind === "bot" || m.kind === "agent") {
      if (m.kind === "bot") c.bot = true;
      else c.agent = true;
      if (c.firstIn !== null && c.firstReply === null) c.firstReply = m.at;
    }
  }
  // Solo cuentan las conversaciones en las que escribió el cliente.
  const conversations = [...byConversation.values()].filter((c) => c.firstIn !== null);
  return { conversations, inRange };
}

function summarize(conversations: ConversationAgg[]): Summary {
  const replied = conversations.filter((c) => c.bot || c.agent);
  const botOnly = replied.filter((c) => c.bot && !c.agent).length;
  const times = conversations.filter((c) => c.firstReply !== null).map((c) => c.firstReply! - c.firstIn!);
  return {
    conversations: conversations.length,
    botResolvedPct: replied.length ? Math.round((botOnly / replied.length) * 100) : null,
    firstResponseSeconds: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
  };
}

const PREVIOUS_LABEL: Record<MetricsPeriod, string> = {
  today: "vs ayer",
  "7d": "vs semana anterior",
  "30d": "vs 30 días anteriores",
};

function countDelta(current: number, previous: number, period: MetricsPeriod): Delta | null {
  if (previous === 0) return current > 0 ? { text: `Sin datos ${PREVIOUS_LABEL[period]}`, tone: "neutral" } : null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: `Igual que ${PREVIOUS_LABEL[period].replace("vs ", "")}`, tone: "neutral" };
  return { text: `${pct > 0 ? "+" : ""}${pct}% ${PREVIOUS_LABEL[period]}`, tone: pct > 0 ? "good" : "bad" };
}

function pointsDelta(current: number | null, previous: number | null, period: MetricsPeriod): Delta | null {
  if (current === null || previous === null) return null;
  const diff = current - previous;
  if (diff === 0) return { text: `Igual ${PREVIOUS_LABEL[period]}`, tone: "neutral" };
  return { text: `${diff > 0 ? "+" : ""}${diff} pts ${PREVIOUS_LABEL[period]}`, tone: diff > 0 ? "good" : "bad" };
}

function speedDelta(current: number | null, previous: number | null): Delta | null {
  if (current === null || previous === null) return null;
  const diff = previous - current;
  if (Math.abs(diff) < 1) return { text: "Igual que antes", tone: "neutral" };
  return diff > 0
    ? { text: `${formatDuration(diff)} más rápido`, tone: "good" }
    : { text: `${formatDuration(-diff)} más lento`, tone: "bad" };
}

// 38 s · 1 m 10 s · 2 h 5 m
export function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rest = s % 60;
    return rest ? `${m} m ${String(rest).padStart(2, "0")} s` : `${m} m`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h} h ${m} m` : `${h} h`;
}

function teamRows(inRange: MetricsMessage[]): TeamRow[] {
  const rows = new Map<string, { handled: Set<number>; times: number[]; resolved: number }>();
  const row = (name: string) => {
    let r = rows.get(name);
    if (!r) {
      r = { handled: new Set(), times: [], resolved: 0 };
      rows.set(name, r);
    }
    return r;
  };
  // Último mensaje del cliente todavía sin respuesta, por conversación.
  const pendingSince = new Map<number, number>();
  for (const m of inRange) {
    if (m.kind === "in") {
      if (!pendingSince.has(m.conversationId)) pendingSince.set(m.conversationId, m.at);
      continue;
    }
    if (m.kind === "bot") {
      pendingSince.delete(m.conversationId);
      continue;
    }
    if (!m.authorName) continue;
    const r = row(m.authorName);
    if (m.kind === "resolve") {
      r.resolved += 1;
      continue;
    }
    r.handled.add(m.conversationId);
    const since = pendingSince.get(m.conversationId);
    if (since !== undefined) {
      r.times.push(m.at - since);
      pendingSince.delete(m.conversationId);
    }
  }
  return [...rows.entries()]
    .map(([name, r]) => ({
      name,
      handled: r.handled.size,
      avgResponseSeconds: r.times.length ? Math.round(r.times.reduce((a, b) => a + b, 0) / r.times.length) : null,
      resolved: r.resolved,
    }))
    .filter((r) => r.handled > 0 || r.resolved > 0)
    .sort((a, b) => b.handled - a.handled || b.resolved - a.resolved);
}

// Desde cuándo hacen falta mensajes para calcular el período y el anterior.
export function metricsWindowStart(period: MetricsPeriod, now: number) {
  const { from, buckets } = periodRange(period, now);
  return period === "today" ? from - DAY : from - buckets.length * DAY;
}

export function computeMetrics(input: {
  period: MetricsPeriod;
  now: number;
  messages: MetricsMessage[];
  waitingNow: number;
}): MetricsReport {
  const { period, now, messages } = input;
  const { from, to, buckets } = periodRange(period, now);
  // Período anterior del mismo largo (para "hoy": ayer hasta la misma hora).
  const length = to - from;
  const prevFrom = period === "today" ? from - DAY : from - (buckets.length * DAY);
  const prevTo = prevFrom + length;

  const current = aggregate(messages, from, to);
  const previous = aggregate(messages, prevFrom, prevTo);
  const now_ = summarize(current.conversations);
  const before = summarize(previous.conversations);

  const bars: MetricsBar[] = buckets.map((b) => ({ label: b.label, title: b.title, total: 0, byChannel: emptyByChannel() }));
  const byChannel = emptyByChannel();
  for (const c of current.conversations) {
    byChannel[c.channel] += 1;
    const index = buckets.findIndex((b) => c.firstIn! >= b.start && c.firstIn! < b.end);
    if (index >= 0) {
      bars[index].byChannel[c.channel] += 1;
      bars[index].total += 1;
    }
  }

  const replied = current.conversations.filter((c) => c.bot || c.agent);
  const botOnly = replied.filter((c) => c.bot && !c.agent).length;

  return {
    period,
    from,
    to,
    conversations: now_.conversations,
    conversationsDelta: countDelta(now_.conversations, before.conversations, period),
    botResolvedPct: now_.botResolvedPct,
    botResolvedDelta: pointsDelta(now_.botResolvedPct, before.botResolvedPct, period),
    firstResponseSeconds: now_.firstResponseSeconds,
    firstResponseDelta: speedDelta(now_.firstResponseSeconds, before.firstResponseSeconds),
    waitingNow: input.waitingNow,
    bars,
    split: { bot: botOnly, team: replied.length - botOnly },
    byChannel,
    team: teamRows(current.inRange),
  };
}
