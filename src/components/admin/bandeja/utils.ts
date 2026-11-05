import { useEffect, useRef, useState } from "react";
import { commentContextLabel } from "@/lib/crm/channels";
import type {
  InboxConversation,
  InboxMessage,
  MessageStatus,
  MessageStatusUpdate,
} from "@/lib/wa-inbox/types";

export const POLL_INTERVAL_MS = 3000;

// Mensaje en pantalla: los optimistas tienen id negativo hasta que vuelve el POST.
export type UiMessage = InboxMessage & { pending?: boolean };

// Etiquetas que se pueden poner con un click desde el panel de contacto.
export const TAGS = ["Cliente nuevo", "Consulta de precio", "Venta", "Turno", "Reclamo"];

export const QUICK_REPLIES = ["¡Hola! ¿En qué te ayudo?", "Te paso los precios", "Gracias por escribirnos"];

export interface TeamMember {
  id: number;
  name: string;
}

// ---------- Contacto ----------

// +54 9 261 699-8830 para celulares de Argentina; el resto, +<dígitos>.
export function formatPhone(waId: string) {
  const d = waId.replace(/\D/g, "");
  const ar = d.match(/^549(\d{10})$/);
  if (ar) {
    const n = ar[1];
    const area = n.startsWith("11") ? 2 : 3;
    const local = n.slice(area);
    return `+54 9 ${n.slice(0, area)} ${local.slice(0, local.length - 4)}-${local.slice(-4)}`;
  }
  return `+${d}`;
}

// Lo que identifica al contacto en su canal: número, @usuario o nombre de la cuenta.
export function contactHandle(c: Pick<InboxConversation, "channel" | "waId" | "handle" | "contactName">) {
  if (c.channel === "wa") return formatPhone(c.waId);
  return c.handle || c.contactName || "";
}

export function displayName(c: Pick<InboxConversation, "channel" | "waId" | "handle" | "contactName">) {
  return c.contactName?.trim() || contactHandle(c);
}

export function firstName(c: Pick<InboxConversation, "contactName">) {
  return c.contactName?.trim().split(/\s+/)[0] ?? "";
}

export function channelSubtitle(c: InboxConversation) {
  const channelName = commentContextLabel(c.channel);
  const handle = contactHandle(c);
  return handle && handle !== displayName(c) ? `${handle} · ${channelName}` : channelName;
}

// ---------- Mensajes ----------

const MEDIA_LABELS: [RegExp, string][] = [
  [/^\[imagen\]/, "📷 Foto"],
  [/^\[audio\]/, "🎤 Audio"],
  [/^\[video\]/, "🎬 Video"],
  [/^\[documento\]/, "📄 Documento"],
  [/^\[sticker\]/, "Sticker"],
  [/^\[ubicación\]/, "📍 Ubicación"],
  [/^\[contacto\]/, "👤 Contacto"],
  [/^\[reacción\]/, "Reaccionó"],
  [/^\[pedido\]/, "🛒 Pedido"],
  [/^\[publicación compartida\]/, "🔗 Publicación compartida"],
  [/^\[reel\]/, "🎬 Reel"],
  [/^\[mención en historia\]/, "📣 Te mencionó en su historia"],
  [/^\[respuesta a tu historia\]/, "💬 Respondió tu historia:"],
  [/^\[mensaje con botones\]/, "Mensaje con botones"],
  [/^\[adjunto\]/, "📎 Adjunto"],
];

// Los adjuntos llegan como "[imagen] caption": se muestran con un nombre amigable.
export function prettyBody(body: string | null, type?: string) {
  if (!body) return type ? `[${type}]` : "";
  for (const [pattern, label] of MEDIA_LABELS) {
    if (pattern.test(body)) return body.replace(pattern, label);
  }
  return body;
}

export function previewText(c: InboxConversation) {
  const body = prettyBody(c.lastMessagePreview);
  if (!body) return "";
  if (c.lastMessageAuthor === "agent") return `Vos: ${body}`;
  if (c.lastMessageAuthor === "bot") return `DigiBot: ${body}`;
  return body;
}

export const STATUS_LABELS: Record<MessageStatus, string> = {
  received: "",
  sending: "Enviando…",
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  failed: "No enviado",
};

// ---------- Fechas ----------

const pad = (n: number) => String(n).padStart(2, "0");

export function formatTime(unix: number) {
  const d = new Date(unix * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAYS_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

// Hora si es de hoy, "Ayer", día de la semana si es de esta semana, o fecha corta.
export function formatListTime(unix: number | null) {
  if (!unix) return "";
  const date = new Date(unix * 1000);
  const today = startOfDay(new Date());
  const day = startOfDay(date);
  if (day === today) return formatTime(unix);
  if (day === today - DAY_MS) return "Ayer";
  if (day > today - 6 * DAY_MS) return WEEKDAYS[date.getDay()];
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear()).slice(2)}`;
}

// Separador de días en el chat.
export function formatDayLabel(unix: number) {
  const date = new Date(unix * 1000);
  const today = startOfDay(new Date());
  const day = startOfDay(date);
  if (day === today) return "Hoy";
  if (day === today - DAY_MS) return "Ayer";
  if (day > today - 6 * DAY_MS) return WEEKDAYS_LONG[date.getDay()];
  return `${date.getDate()} de ${MONTHS[date.getMonth()].toLowerCase()} de ${date.getFullYear()}`;
}

export function dayKey(unix: number) {
  return startOfDay(new Date(unix * 1000));
}

// "Hoy", "Ayer" o "Marzo 2026".
export function formatSince(unix: number) {
  const date = new Date(unix * 1000);
  const today = startOfDay(new Date());
  const day = startOfDay(date);
  if (day === today) return "Hoy";
  if (day === today - DAY_MS) return "Ayer";
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function windowLabel(secondsLeft: number) {
  if (secondsLeft <= 0) return "Ventana cerrada";
  const hours = Math.floor(secondsLeft / 3600);
  if (hours >= 1) return `Ventana abierta · quedan ${hours} h`;
  return `Ventana abierta · quedan ${Math.max(1, Math.floor(secondsLeft / 60))} min`;
}

// ---------- Merge de mensajes (polling + optimistas) ----------

function sortMessages(messages: UiMessage[]) {
  // Los reales por id; los optimistas (id < 0) siempre al final, en orden de creación.
  return [...messages].sort((a, b) => {
    if (a.id > 0 && b.id > 0) return a.id - b.id;
    if (a.id > 0) return -1;
    if (b.id > 0) return 1;
    return b.id - a.id;
  });
}

// Suma los mensajes que trajo el polling. Si llega uno que todavía tenemos como
// optimista (el POST no volvió), reemplaza al optimista en vez de duplicarlo.
export function mergeMessages(current: UiMessage[], incoming: InboxMessage[]) {
  const next = [...current];
  for (const message of incoming) {
    const existing = next.findIndex((m) => m.id === message.id);
    if (existing >= 0) {
      next[existing] = message;
      continue;
    }
    const optimistic =
      message.direction !== "in"
        ? next.findIndex(
            (m) => m.pending && m.status === "sending" && m.body === message.body && m.author === message.author
          )
        : -1;
    if (optimistic >= 0) next[optimistic] = message;
    else next.push(message);
  }
  return sortMessages(next);
}

export function replaceOptimistic(current: UiMessage[], localId: number, saved: InboxMessage) {
  return mergeMessages(
    current.filter((m) => m.id !== localId),
    [saved]
  );
}

export function applyStatuses(current: UiMessage[], statuses: MessageStatusUpdate[]) {
  if (statuses.length === 0) return current;
  const byId = new Map(statuses.map((s) => [s.id, s]));
  let changed = false;
  const next = current.map((m) => {
    const update = byId.get(m.id);
    if (!update || (update.status === m.status && update.errorCode === m.errorCode)) return m;
    // Un reintento en curso no se pisa con el "failed" viejo que trae el polling.
    if (m.status === "sending" && update.status === "failed") return m;
    changed = true;
    return { ...m, ...update };
  });
  return changed ? next : current;
}

// ---------- Hooks ----------

// Ejecuta `callback` ya y después cada `intervalMs`, sin solapar requests y
// salteando ticks mientras la pestaña está oculta.
// Con la pestaña oculta no se consulta, salvo que whileHidden() diga que sí (sonidos
// de mensajes nuevos): en ese caso, cada hiddenIntervalMs para no cargar el servidor.
export function usePolling(
  callback: () => Promise<void>,
  intervalMs: number,
  key: unknown,
  options?: { whileHidden?: () => boolean; hiddenIntervalMs?: number }
) {
  const saved = useRef(callback);
  saved.current = callback;
  const savedOptions = useRef(options);
  savedOptions.current = options;

  useEffect(() => {
    let running = false;
    let lastRun = 0;
    const tick = async () => {
      if (running) return;
      if (document.hidden) {
        const opts = savedOptions.current;
        if (!opts?.whileHidden?.()) return;
        if (Date.now() - lastRun < (opts.hiddenIntervalMs ?? 15000)) return;
      }
      running = true;
      lastRun = Date.now();
      try {
        await saved.current();
      } finally {
        running = false;
      }
    };
    tick();
    const timer = setInterval(tick, intervalMs);
    const onVisible = () => !document.hidden && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, key]);
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
