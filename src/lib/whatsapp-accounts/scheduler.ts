// Tareas en segundo plano dentro del mismo proceso de Next (src/instrumentation.ts). Server-only.
//
//   - cola de webhooks pesados (history, smb_app_state_sync): cada 5 s, y al instante cuando llega uno
//   - cola de webhooks de Meta (Messenger / Instagram): reintentos de lo que falló o quedó pendiente
//   - chequeo de tokens con debug_token (WhatsApp, Facebook e Instagram): barrido cada hora;
//     cada conexión se verifica una vez por día
//
// WA_BACKGROUND_JOBS=on|off. Por defecto: prendido en producción y apagado en `next dev`
// (la base es compartida con producción: así el dev local no compite con el server).

import { pollInstagramDms, pollIntervalSeconds } from "../meta-social/ig-poller";
import { processMetaWebhookQueue } from "../meta-social/queue";
import { runSocialHealthSweep } from "../channels/social-health";
import { runHealthSweep } from "./health";
import { processWebhookJobs } from "./webhook-events";

const JOBS_EVERY_MS = 5_000;
const HEALTH_EVERY_MS = 60 * 60 * 1000;
// Primer barrido de salud unos minutos después de arrancar (no en el pico del arranque).
const HEALTH_FIRST_RUN_MS = 3 * 60 * 1000;
const BILLING_EVERY_MS = 60 * 60 * 1000;

const state = globalThis as typeof globalThis & { __waScheduler?: { started: boolean } };

export function backgroundJobsEnabled() {
  const flag = process.env.WA_BACKGROUND_JOBS?.toLowerCase();
  if (flag === "on" || flag === "off") return flag === "on";
  return process.env.NODE_ENV === "production";
}

function safe(label: string, fn: () => Promise<unknown>) {
  return () => {
    fn().catch((err) => console.error(`[wa-scheduler] ${label}:`, (err as Error).message));
  };
}

export function startWaScheduler() {
  if (state.__waScheduler?.started || !backgroundJobsEnabled()) return;
  state.__waScheduler = { started: true };
  const jobs = setInterval(safe("cola de webhooks", () => processWebhookJobs()), JOBS_EVERY_MS);
  const meta = setInterval(safe("cola de webhooks de Meta", () => processMetaWebhookQueue()), JOBS_EVERY_MS * 3);
  const sweep = () => Promise.all([runHealthSweep(), runSocialHealthSweep()]);
  const health = setInterval(safe("chequeo de tokens", sweep), HEALTH_EVERY_MS);
  const first = setTimeout(safe("chequeo de tokens", sweep), HEALTH_FIRST_RUN_MS);
  // Cobro recurrente (dLocal Go): cada hora; cobra desde BILLING_RUN_HOUR. Idempotente.
  const billing = setInterval(safe("cobro recurrente", () => import("../billing/job").then((m) => m.runBillingJob())), BILLING_EVERY_MS);
  const billingFirst = setTimeout(safe("cobro recurrente", () => import("../billing/job").then((m) => m.runBillingJob())), HEALTH_FIRST_RUN_MS);
  const timers = [jobs, meta, health, first, billing, billingFirst];
  // DMs de Instagram por la API de conversaciones (mientras Meta no mande esos webhooks).
  if (pollIntervalSeconds() > 0) {
    timers.push(setInterval(safe("DMs de Instagram", () => pollInstagramDms()), pollIntervalSeconds() * 1000));
  }
  for (const t of timers) t.unref?.();
  console.info("[wa-scheduler] Tareas de WhatsApp en segundo plano iniciadas.");
}

// Después de encolar un webhook: se procesa ya, sin esperar al próximo tick.
export function kickWebhookJobs() {
  if (!state.__waScheduler?.started) return;
  safe("cola de webhooks", () => processWebhookJobs())();
}
