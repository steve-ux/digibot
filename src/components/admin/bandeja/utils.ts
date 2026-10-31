import { useEffect, useRef } from "react";
import type { InboxConversation, InboxMessage, MessageStatusUpdate } from "@/lib/wa-inbox/types";

export const POLL_INTERVAL_MS = 3000;

// Mensaje en pantalla: los optimistas tienen id negativo hasta que vuelve el POST.
export type UiMessage = InboxMessage & { pending?: boolean };

export function displayName(conversation: Pick<InboxConversation, "contactName" | "waId">) {
  return conversation.contactName?.trim() || `+${conversation.waId}`;
}

export function initials(conversation: Pick<InboxConversation, "contactName" | "waId">) {
  const name = conversation.contactName?.trim();
  if (!name) return "#";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatTime(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

// Hora si es de hoy, "Ayer" o fecha corta: como la lista de chats de WhatsApp.
export function formatListTime(unix: number | null) {
  if (!unix) return "";
  const date = new Date(unix * 1000);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) return formatTime(unix);
  if (date.getTime() >= startOfToday - 24 * 60 * 60 * 1000) return "Ayer";
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function windowLabel(secondsLeft: number) {
  if (secondsLeft <= 0) return "Ventana cerrada · solo plantillas";
  const hours = Math.floor(secondsLeft / 3600);
  if (hours >= 1) return `Ventana abierta · quedan ${hours} h`;
  return `Ventana abierta · quedan ${Math.max(1, Math.floor(secondsLeft / 60))} min`;
}

function sortMessages(messages: UiMessage[]) {
  // Los reales por id; los optimistas (id < 0) siempre al final, en orden de creación.
  return [...messages].sort((a, b) => {
    if (a.id > 0 && b.id > 0) return a.id - b.id;
    if (a.id > 0) return -1;
    if (b.id > 0) return 1;
    return b.id - a.id;
  });
}

// Suma los mensajes que trajo el polling. Si llega un saliente que todavía tenemos
// como optimista (el POST no volvió), reemplaza al optimista en vez de duplicarlo.
export function mergeMessages(current: UiMessage[], incoming: InboxMessage[]) {
  const next = [...current];
  for (const message of incoming) {
    const existing = next.findIndex((m) => m.id === message.id);
    if (existing >= 0) {
      next[existing] = message;
      continue;
    }
    const optimistic =
      message.direction === "out"
        ? next.findIndex((m) => m.pending && m.status === "sending" && m.body === message.body)
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
    if (!update || (update.status === m.status && update.errorTitle === m.errorTitle)) return m;
    changed = true;
    return { ...m, ...update };
  });
  return changed ? next : current;
}

// Ejecuta `callback` ya y después cada `intervalMs`, sin solapar requests y
// salteando ticks mientras la pestaña está oculta.
export function usePolling(callback: () => Promise<void>, intervalMs: number, key: unknown) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    let running = false;
    const tick = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        await saved.current();
      } finally {
        running = false;
      }
    };
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, key]);
}
