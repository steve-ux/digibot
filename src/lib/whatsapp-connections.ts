// Conexiones de WhatsApp Business (WABA + número) por cuenta. Server-only.
//
// Cada cuenta (web_clients) conecta la suya desde Canales con el Embedded Signup;
// la fila guarda el WABA, el phone_number_id y el token cifrado. Para enviar se
// busca la conexión del número de la conversación; para plantillas, la de la cuenta.
// Si la base no tiene ninguna conexión, las variables WHATSAPP_WABA_ID /
// WHATSAPP_ACCESS_TOKEN sirven para la cuenta por defecto (modo de transición).

import type { RowDataPacket } from "mysql2";
import { decryptSecret } from "./crypto";
import { getPool, isDbConfigured } from "./db";

export interface WhatsAppConnection {
  id: number;
  clientId: number;
  wabaId: string;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  accessToken: string;
  apiVersion: string;
  connectedAt: number | null;
  // active · needs_attention · disconnected (desconectado por Meta: no se envía más)
  health: "active" | "needs_attention" | "disconnected";
}

interface ConnectionRow extends RowDataPacket {
  id: number;
  client_id: number;
  waba_id: string;
  phone_number_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  access_token_enc: string;
  connected_ts: number | string | null;
  health?: WhatsAppConnection["health"];
}

const apiVersion = () => process.env.META_GRAPH_API_VERSION || "v23.0";

// Las conexiones casi nunca cambian y se consultan en cada envío: se cachean un rato.
const TTL_MS = 60_000;
let cache: { at: number; promise: Promise<WhatsAppConnection[]> } | null = null;

async function fetchConnections(): Promise<WhatsAppConnection[]> {
  if (!isDbConfigured()) return [];
  const base = `id, client_id, waba_id, phone_number_id, access_token_enc, UNIX_TIMESTAMP(connected_at) AS connected_ts`;
  // Columnas de cada migración, de la más nueva a la más vieja (0015: health · 0010: número y nombre).
  const variants = [
    `${base}, display_phone_number, verified_name, health`,
    `${base}, display_phone_number, verified_name, 'active' AS health`,
    `${base}, NULL AS display_phone_number, NULL AS verified_name, 'active' AS health`,
  ];
  let rows: ConnectionRow[] = [];
  for (const [i, columns] of variants.entries()) {
    try {
      [rows] = await getPool().query<ConnectionRow[]>(
        `SELECT ${columns} FROM web_whatsapp_connections WHERE status = 'connected' ORDER BY id ASC`
      );
      break;
    } catch (err) {
      if ((err as { code?: string }).code !== "ER_BAD_FIELD_ERROR" || i === variants.length - 1) throw err;
    }
  }
  return rows.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    wabaId: row.waba_id,
    phoneNumberId: row.phone_number_id,
    displayPhoneNumber: row.display_phone_number,
    verifiedName: row.verified_name,
    accessToken: decryptSecret(row.access_token_enc),
    apiVersion: apiVersion(),
    connectedAt: row.connected_ts === null ? null : Number(row.connected_ts),
    health: row.health ?? "active",
  }));
}

export function listWhatsAppConnections(): Promise<WhatsAppConnection[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = fetchConnections();
  cache = { at: Date.now(), promise };
  // Un error no se cachea: el próximo request vuelve a intentar.
  promise.catch(() => {
    if (cache?.promise === promise) cache = null;
  });
  return promise;
}

export function resetWhatsAppConnectionsCache() {
  cache = null;
}

// Cuenta a la que le corresponden las variables de entorno (si no hay conexiones en la base).
export function defaultAccountId() {
  return Number(process.env.DEFAULT_ACCOUNT_ID) || 1;
}

function envConnection(): WhatsAppConnection | null {
  const wabaId = process.env.WHATSAPP_WABA_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!wabaId || !accessToken) return null;
  return {
    id: 0,
    clientId: defaultAccountId(),
    wabaId,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
    displayPhoneNumber: null,
    verifiedName: null,
    accessToken,
    apiVersion: apiVersion(),
    connectedAt: null,
    health: "active",
  };
}

async function allConnections() {
  const fromDb = await listWhatsAppConnections().catch((err) => {
    console.error("[whatsapp] No se pudieron leer las conexiones:", (err as Error).message);
    return [] as WhatsAppConnection[];
  });
  if (fromDb.length) return fromDb;
  const env = envConnection();
  return env ? [env] : [];
}

// Conexión de una cuenta (la primera, si tiene varios números).
export async function getConnectionForAccount(accountId: number): Promise<WhatsAppConnection | null> {
  return (await allConnections()).find((c) => c.clientId === accountId) ?? null;
}

// Conexión dueña de un número (para enviar desde el número de la conversación).
// Las conexiones viejas sin phone_number_id guardado valen para cualquier número de su WABA.
export async function getConnectionByPhoneNumberId(phoneNumberId: string | null | undefined) {
  const all = await allConnections();
  if (phoneNumberId) {
    const exact = all.find((c) => c.phoneNumberId === phoneNumberId);
    if (exact) return exact;
  }
  // Nunca se cae a la conexión de otra cuenta: solo a la heredada sin número guardado.
  return all.find((c) => !c.phoneNumberId) ?? (all.length === 1 && !phoneNumberId ? all[0] : null);
}

// Números de la cuenta que Meta desconectó (la bandeja muestra "WhatsApp desconectado").
export async function disconnectedPhoneNumberIds(accountId: number): Promise<Set<string>> {
  const all = await listWhatsAppConnections().catch(() => [] as WhatsAppConnection[]);
  return new Set(
    all.filter((c) => c.clientId === accountId && c.health === "disconnected" && c.phoneNumberId).map((c) => c.phoneNumberId!)
  );
}

// Marca las conversaciones de WhatsApp cuyo número desconectó Meta.
export async function withChannelHealth<T extends { channel: string; phoneNumberId: string; channelDisconnected?: boolean }>(
  accountId: number,
  conversations: T[]
): Promise<T[]> {
  const down = await disconnectedPhoneNumberIds(accountId);
  if (down.size === 0) return conversations;
  return conversations.map((c) => (c.channel === "wa" && down.has(c.phoneNumberId) ? { ...c, channelDisconnected: true } : c));
}
