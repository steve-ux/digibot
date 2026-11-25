// Sincronización de DMs de Instagram (Unified Login) leyendo la API de conversaciones. Server-only.
//
// Por qué: con acceso estándar Meta no está mandando los webhooks de mensajes de Instagram
// (los de comentarios sí llegan), aunque la cuenta esté suscrita y la API de mensajes ande.
// Esto trae los DMs nuevos cada META_IG_POLL_SECONDS (60 por defecto; 0 = apagado) y los
// procesa exactamente como si hubieran llegado por webhook (processSocialWebhook): mismo
// ruteo por cuenta, mismo manejo de ecos y la misma idempotencia por mid. Si después los
// webhooks empiezan a llegar, conviven sin duplicar nada.
//
// Cuidado con el límite de Meta por cuenta de Instagram (#80002, "Business Use Case"): depende
// de la actividad de la cuenta y en cuentas chicas es bajo. Por eso:
//   1. una llamada liviana:  GET /{ig-id}/conversations?platform=instagram&fields=id,updated_time
//   2. solo para las conversaciones que cambiaron: GET /{conversation-id}?fields=messages.limit(10){...}
//   3. si Meta avisa uso alto (header X-Business-Use-Case-Usage) o devuelve un error de límite,
//      esa cuenta se deja de consultar un rato (lo que diga Meta, mínimo 30 min).

import type { RowDataPacket } from "mysql2";
import { decryptSecret } from "../crypto";
import { getPool } from "../db";
import { processSocialWebhook, type SocialWebhookDeps } from "./webhook";

const LOG = "[ig-poller]";
// Margen por relojes / mensajes que Meta indexa con unos segundos de atraso.
const OVERLAP_SECONDS = 120;

export interface PollAccount {
  igUserId: string;
  accessToken: string;
  // Solo se traen mensajes posteriores a la conexión (no se importa historial).
  connectedAt: number;
}

interface ApiMessage {
  id: string;
  created_time: string;
  from?: { id: string; username?: string };
  to?: { data?: { id: string; username?: string }[] };
  message?: string;
  attachments?: { data?: unknown[] };
}

interface ApiConversation {
  id: string;
  updated_time: string;
  messages?: { data?: ApiMessage[] };
}

export interface PollerDeps {
  accounts?: () => Promise<PollAccount[]>;
  // Conversaciones con mensajes nuevos desde `since` (con sus últimos mensajes).
  fetchConversations?: (account: PollAccount, since: number) => Promise<ApiConversation[]>;
  webhook?: SocialWebhookDeps;
}

const DEFAULT_INTERVAL = 60;
export const pollIntervalSeconds = () => {
  const raw = process.env.META_IG_POLL_SECONDS;
  if (raw === undefined || raw === "") return DEFAULT_INTERVAL;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_INTERVAL;
};

// Error de Meta con el tiempo sugerido para volver a consultar.
export class MetaRateLimitError extends Error {
  constructor(message: string, public readonly retryAfterMinutes: number) {
    super(message);
  }
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80006]);
// Con más de este % de uso de alguno de los contadores de Meta, se frena antes de llegar al tope.
const USAGE_THRESHOLD = 75;
const MIN_BACKOFF_MINUTES = 30;

const graphVersion = () => process.env.META_GRAPH_API_VERSION || "v23.0";

async function loadAccounts(): Promise<PollAccount[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT account_id, access_token_enc, UNIX_TIMESTAMP(COALESCE(connected_at, created_at)) AS connected_ts
     FROM web_channel_accounts
     WHERE channel = 'ig' AND auth_type = 'ig_unified' AND status = 'connected' AND access_token_enc IS NOT NULL`
  );
  return rows.map((r) => ({
    igUserId: String(r.account_id),
    accessToken: decryptSecret(r.access_token_enc),
    connectedAt: Number(r.connected_ts),
  }));
}

// Lee el header de uso de Meta; si alguna cuenta está cerca del tope, frena.
function checkUsage(res: Response) {
  const raw = res.headers.get("x-business-use-case-usage");
  if (!raw) return;
  try {
    const usage = JSON.parse(raw) as Record<string, { call_count?: number; total_cputime?: number; total_time?: number; estimated_time_to_regain_access?: number }[]>;
    for (const entries of Object.values(usage)) {
      for (const u of entries ?? []) {
        const max = Math.max(u.call_count ?? 0, u.total_cputime ?? 0, u.total_time ?? 0);
        if (max >= USAGE_THRESHOLD || (u.estimated_time_to_regain_access ?? 0) > 0) {
          throw new MetaRateLimitError(`uso alto de Meta (${max}%)`, Math.max(MIN_BACKOFF_MINUTES, u.estimated_time_to_regain_access ?? 0));
        }
      }
    }
  } catch (err) {
    if (err instanceof MetaRateLimitError) throw err;
  }
}

async function graphGet(path: string, account: PollAccount, params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const code = data?.error?.code;
    const message = `(#${code ?? res.status}) ${data?.error?.message ?? "error de Meta"}`;
    if (RATE_LIMIT_CODES.has(code)) throw new MetaRateLimitError(message, MIN_BACKOFF_MINUTES);
    throw new Error(message);
  }
  checkUsage(res);
  return data;
}

async function fetchConversations(account: PollAccount, since: number): Promise<ApiConversation[]> {
  const list = await graphGet(`/${account.igUserId}/conversations`, account, {
    platform: "instagram",
    fields: "id,updated_time",
    limit: "10",
  });
  const changed = ((list.data ?? []) as ApiConversation[]).filter((c) => toUnix(c.updated_time) >= since);
  const result: ApiConversation[] = [];
  for (const c of changed) {
    const full = await graphGet(`/${c.id}`, account, {
      fields: "messages.limit(10){id,created_time,from,to,message,attachments}",
    });
    result.push({ ...c, messages: full.messages });
  }
  return result;
}

const toUnix = (iso: string) => Math.floor(Date.parse(iso) / 1000);

// Un mensaje de la API -> evento con la forma de messaging[] del webhook.
export function toMessagingEvent(igUserId: string, m: ApiMessage) {
  const fromBusiness = m.from?.id === igUserId;
  const other = fromBusiness ? m.to?.data?.[0]?.id : m.from?.id;
  if (!other) return null;
  return {
    sender: { id: fromBusiness ? igUserId : other },
    recipient: { id: fromBusiness ? other : igUserId },
    timestamp: Date.parse(m.created_time),
    message: {
      mid: m.id,
      text: m.message ?? "",
      ...(fromBusiness ? { is_echo: true } : {}),
      ...(m.attachments?.data?.length ? { attachments: [{ type: "fallback" }] } : {}),
    },
  };
}

// Último mensaje visto por cuenta (en memoria: al reiniciar se repasa desde la conexión y
// la idempotencia por mid evita duplicados).
const cursors = new Map<string, number>();
// Cuentas en pausa por límite de Meta: hasta cuándo (ms).
const pausedUntil = new Map<string, number>();
let running = false;

export async function pollInstagramDms(deps: PollerDeps = {}) {
  if (running && !deps.accounts) return 0;
  running = true;
  let events = 0;
  try {
    const accounts = await (deps.accounts ?? loadAccounts)();
    for (const account of accounts) {
      if ((pausedUntil.get(account.igUserId) ?? 0) > Date.now()) continue;
      try {
        const since = Math.max(account.connectedAt, cursors.get(account.igUserId) ?? 0) - OVERLAP_SECONDS;
        const conversations = await (deps.fetchConversations ?? fetchConversations)(account, since);
        const messaging = conversations
          .filter((c) => toUnix(c.updated_time) >= since)
          .flatMap((c) => c.messages?.data ?? [])
          .filter((m) => toUnix(m.created_time) >= Math.max(since, account.connectedAt))
          .sort((a, b) => toUnix(a.created_time) - toUnix(b.created_time))
          .map((m) => toMessagingEvent(account.igUserId, m))
          .filter((e): e is NonNullable<typeof e> => e !== null);
        if (messaging.length === 0) continue;
        await processSocialWebhook(
          { object: "instagram", entry: [{ id: account.igUserId, time: Date.now(), messaging }] },
          deps.webhook
        );
        events += messaging.length;
        const newest = Math.max(...messaging.map((e) => Math.floor(e.timestamp / 1000)));
        cursors.set(account.igUserId, Math.max(cursors.get(account.igUserId) ?? 0, newest));
      } catch (err) {
        if (err instanceof MetaRateLimitError) {
          pausedUntil.set(account.igUserId, Date.now() + err.retryAfterMinutes * 60_000);
          console.warn(`${LOG} ${account.igUserId}: ${err.message}. Se pausa ${err.retryAfterMinutes} min.`);
        } else {
          console.error(`${LOG} No se pudieron leer los DMs de ${account.igUserId}:`, (err as Error).message);
        }
      }
    }
  } finally {
    running = false;
  }
  return events;
}

// Solo para tests.
export function resetPollerCursors() {
  cursors.clear();
  pausedUntil.clear();
}
