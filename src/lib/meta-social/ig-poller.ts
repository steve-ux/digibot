// Sincronización de DMs de Instagram (Unified Login) leyendo la API de conversaciones. Server-only.
//
// Por qué: con acceso estándar Meta no está mandando los webhooks de mensajes de Instagram
// (los de comentarios sí llegan), aunque la cuenta esté suscrita y la API de mensajes ande.
// Esto trae los DMs nuevos cada META_IG_POLL_SECONDS (15 por defecto; 0 = apagado) y los
// procesa exactamente como si hubieran llegado por webhook (processSocialWebhook): mismo
// ruteo por cuenta, mismo manejo de ecos y la misma idempotencia por mid. Si después los
// webhooks empiezan a llegar, conviven sin duplicar nada.
//
//   GET /{ig-id}/conversations?platform=instagram&fields=updated_time,messages.limit(n){id,created_time,from,to,message,attachments}
//   (límite de Meta: 2 llamadas por segundo por cuenta; acá es 1 cada 15 s)

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
  fetchConversations?: (account: PollAccount) => Promise<ApiConversation[]>;
  webhook?: SocialWebhookDeps;
}

export const pollIntervalSeconds = () => {
  const raw = process.env.META_IG_POLL_SECONDS;
  if (raw === undefined || raw === "") return 15;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 15;
};

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

async function fetchConversations(account: PollAccount): Promise<ApiConversation[]> {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${account.igUserId}/conversations`);
  url.searchParams.set("platform", "instagram");
  url.searchParams.set("fields", "id,updated_time,messages.limit(10){id,created_time,from,to,message,attachments}");
  url.searchParams.set("limit", "10");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(`(#${data?.error?.code ?? res.status}) ${data?.error?.message ?? "error de Meta"}`);
  }
  return (data.data ?? []) as ApiConversation[];
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
let running = false;

export async function pollInstagramDms(deps: PollerDeps = {}) {
  if (running && !deps.accounts) return 0;
  running = true;
  let events = 0;
  try {
    const accounts = await (deps.accounts ?? loadAccounts)();
    for (const account of accounts) {
      try {
        const since = Math.max(account.connectedAt, cursors.get(account.igUserId) ?? 0) - OVERLAP_SECONDS;
        const conversations = await (deps.fetchConversations ?? fetchConversations)(account);
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
        console.error(`${LOG} No se pudieron leer los DMs de ${account.igUserId}:`, (err as Error).message);
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
}
