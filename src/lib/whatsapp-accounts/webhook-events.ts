// Campos del webhook de WhatsApp que tocan la conexión (no la bandeja). Server-only.
//
//   account_update      -> PARTNER_ADDED / PARTNER_REMOVED / ACCOUNT_OFFBOARDED / ACCOUNT_RECONNECTED
//   history             -> historial de la app de WhatsApp Business (coexistencia). Puede traer miles
//                          de mensajes: se guarda crudo en web_wa_webhook_jobs y se procesa en segundo plano.
//                          Los chunks llegan desordenados (la idempotencia por wamid lo resuelve) y
//                          metadata.progress va hasta 100. Error 2593109 = el cliente no compartió el historial.
//   smb_app_state_sync  -> alta y baja de contactos de la app (también por la cola)

import { describeMessage, type WaMessageLike } from "../wa-inbox/webhook";
import { getInboxStore, type InboxStore } from "../wa-inbox/store";
import type { MessageStatus } from "../wa-inbox/types";
import { markActive, markDisconnected } from "./health";
import type { WebhookJob } from "./repo";
import { getWaDeps, type WaDeps } from "./runtime";

const LOG = "[wa-webhook]";
export const HISTORY_DECLINED_CODE = 2593109;
const digits = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/\D/g, "") : "");

// ---------- account_update ----------

interface AccountUpdateValue {
  event?: string;
  phone_number?: string;
  waba_info?: { waba_id?: string; owner_business_id?: string; partner_app_id?: string };
  disconnection_info?: { reason?: string; initiated_by?: string };
}

export async function handleAccountUpdate(entryId: string | undefined, raw: unknown, injected?: WaDeps) {
  const deps = injected ?? (await getWaDeps());
  const value = (raw ?? {}) as AccountUpdateValue;
  const event = value.event ?? "";
  const wabaId = value.waba_info?.waba_id ?? entryId;
  if (!wabaId) {
    console.warn(`${LOG} account_update ${event} sin WABA, se ignora.`);
    return;
  }
  let accounts = await deps.repo.listByWaba(wabaId);
  // Si Meta dice qué número (coexistencia), solo ese.
  const phone = digits(value.phone_number);
  if (phone) {
    const matching = accounts.filter((a) => digits(a.displayPhoneNumber) === phone);
    if (matching.length > 0) accounts = matching;
  }
  console.info(`${LOG} account_update ${event} para WABA ${wabaId} (${accounts.length} conexión/es).`);

  switch (event) {
    case "PARTNER_REMOVED":
    case "ACCOUNT_OFFBOARDED":
      for (const account of accounts) {
        await markDisconnected(deps, account, {
          event,
          // El motivo tal cual lo manda Meta (si no manda, el evento)
          reason: value.disconnection_info?.reason ?? event,
          initiatedBy: value.disconnection_info?.initiated_by ?? null,
          source: "webhook",
        });
      }
      break;
    case "ACCOUNT_RECONNECTED":
      for (const account of accounts) await markActive(deps, account);
      break;
    case "PARTNER_ADDED":
      // El alta real la hace el Embedded Signup; acá solo queda registrado.
      break;
    default:
      console.info(`${LOG} account_update "${event}" sin acción.`);
  }
}

// ---------- Cola ----------

export const QUEUED_FIELDS = new Set(["history", "smb_app_state_sync"]);

export async function enqueueWebhookChange(field: string, entryId: string | undefined, value: Record<string, unknown>, injected?: WaDeps) {
  const deps = injected ?? (await getWaDeps());
  const metadata = value.metadata as { phone_number_id?: string } | undefined;
  return deps.repo.enqueueJob({ field, wabaId: entryId ?? null, phoneNumberId: metadata?.phone_number_id ?? null, payload: value });
}

let running = false;

// Procesa trabajos pendientes. Devuelve cuántos terminó bien.
export async function processWebhookJobs(injected?: WaDeps, limit = 10, store?: InboxStore) {
  if (running && !injected) return 0;
  running = true;
  let done = 0;
  try {
    const deps = injected ?? (await getWaDeps());
    const inbox = store ?? (await getInboxStore());
    for (const job of await deps.repo.claimJobs(limit)) {
      try {
        if (job.field === "history") await processHistory(deps, inbox, job);
        else if (job.field === "smb_app_state_sync") await processStateSync(deps, inbox, job);
        await deps.repo.finishJob(job.id, null);
        done++;
      } catch (err) {
        console.error(`${LOG} Trabajo ${job.id} (${job.field}) falló:`, (err as Error).message);
        await deps.repo.finishJob(job.id, (err as Error).message);
      }
    }
  } finally {
    running = false;
  }
  return done;
}

// ---------- history ----------

interface HistoryMessage extends WaMessageLike {
  to?: string;
  history_context?: { status?: string };
}

interface HistoryValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  history?: {
    metadata?: { phase?: number; chunk_order?: number; progress?: number };
    threads?: { id?: string; messages?: HistoryMessage[] }[];
    errors?: { code?: number; title?: string }[];
  }[];
  errors?: { code?: number; title?: string }[];
}

const HISTORY_STATUS: Record<string, MessageStatus> = {
  SENT: "sent",
  DELIVERED: "delivered",
  READ: "read",
  PLAYED: "read",
  ERROR: "failed",
  FAILED: "failed",
};

async function processHistory(deps: WaDeps, inbox: InboxStore, job: WebhookJob) {
  const value = (job.payload ?? {}) as HistoryValue;
  const phoneNumberId = value.metadata?.phone_number_id ?? job.phoneNumberId;
  if (!phoneNumberId) throw new Error("history sin phone_number_id");
  const account = await deps.repo.findByPhone(phoneNumberId);

  const errors = [...(value.errors ?? []), ...(value.history ?? []).flatMap((h) => h.errors ?? [])];
  if (errors.some((e) => e.code === HISTORY_DECLINED_CODE)) {
    console.info(`${LOG} El cliente no compartió el historial de ${phoneNumberId}.`);
    if (account) await deps.repo.updateAccount(account.id, { historyStatus: "declined" });
    return;
  }

  let progress = account?.historyProgress ?? 0;
  for (const chunk of value.history ?? []) {
    for (const thread of chunk.threads ?? []) {
      const waId = digits(thread.id);
      if (!waId) continue;
      const conversationId = await inbox.upsertConversation(phoneNumberId, waId, null);
      for (const msg of thread.messages ?? []) {
        if (!msg.id) continue;
        const inbound = digits(msg.from) === waId;
        const body = describeMessage(msg);
        const at = Number(msg.timestamp) || Math.floor(Date.now() / 1000);
        const id = await inbox.insertMessage({
          conversationId,
          wamid: msg.id,
          direction: inbound ? "in" : "out",
          author: inbound ? "customer" : "agent",
          authorName: inbound ? null : "Enviado desde el celular",
          type: msg.type ?? "text",
          body,
          status: inbound ? "received" : (HISTORY_STATUS[msg.history_context?.status?.toUpperCase() ?? ""] ?? "sent"),
          rawPayload: msg,
          messageAt: at,
        });
        if (id === null) continue; // chunk repetido o desordenado: ya estaba
        await inbox.recordActivity(conversationId, { preview: body, at, inbound, historical: true });
      }
    }
    const p = Number(chunk.metadata?.progress);
    if (Number.isFinite(p)) progress = Math.max(progress, Math.min(100, p));
  }
  if (account) {
    await deps.repo.updateAccount(account.id, {
      historyProgress: progress,
      historyStatus: progress >= 100 ? "done" : "in_progress",
    });
  }
}

// ---------- smb_app_state_sync ----------

interface StateSyncValue {
  metadata?: { phone_number_id?: string };
  state_sync?: {
    type?: string;
    action?: string;
    contact?: { full_name?: string; first_name?: string; phone_number?: string };
  }[];
}

async function processStateSync(deps: WaDeps, inbox: InboxStore, job: WebhookJob) {
  const value = (job.payload ?? {}) as StateSyncValue;
  const phoneNumberId = value.metadata?.phone_number_id ?? job.phoneNumberId;
  if (!phoneNumberId) throw new Error("smb_app_state_sync sin phone_number_id");
  for (const item of value.state_sync ?? []) {
    if (item.type !== "contact" || !item.contact) continue;
    const waId = digits(item.contact.phone_number);
    if (!waId) continue;
    if (item.action === "remove") {
      await deps.repo.removeContact(phoneNumberId, waId);
      continue;
    }
    const fullName = item.contact.full_name?.trim() || null;
    await deps.repo.upsertContact(phoneNumberId, waId, { fullName, firstName: item.contact.first_name?.trim() || null });
    // Si ya hay conversación con ese contacto, toma el nombre que tiene agendado el negocio.
    const name = fullName ?? item.contact.first_name?.trim() ?? null;
    if (name && (await inbox.findConversationId("wa", phoneNumberId, waId)) !== null) {
      await inbox.upsertConversation(phoneNumberId, waId, name);
    }
  }
}
