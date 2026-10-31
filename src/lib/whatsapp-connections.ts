// Resuelve qué conexión de WhatsApp Business (WABA) usar para hablar con la Graph API.
//
// Hoy solo existe la conexión "interna" de DigiBot (una sola fila en
// web_whatsapp_connections). Cuando se sume el embedded signup, cada cliente va a
// tener la suya y esto se resuelve por client_id en vez de tomar la primera activa.

import type { RowDataPacket } from "mysql2";
import { decryptSecret } from "./crypto";
import { getPool, isDbConfigured } from "./db";

export interface WhatsAppConnection {
  id: number;
  clientId: number;
  wabaId: string;
  phoneNumberId: string | null;
  accessToken: string;
  apiVersion: string;
}

interface ConnectionRow extends RowDataPacket {
  id: number;
  client_id: number;
  waba_id: string;
  phone_number_id: string | null;
  access_token_enc: string;
}

// La conexión casi nunca cambia y se consulta en cada request a Meta (a veces
// varias veces por request): se cachea un rato en memoria para no ir a la VPS cada vez.
const CONNECTION_TTL_MS = 60_000;
let cachedConnection: { at: number; promise: Promise<WhatsAppConnection | null> } | null = null;

export function getDefaultConnection(): Promise<WhatsAppConnection | null> {
  if (cachedConnection && Date.now() - cachedConnection.at < CONNECTION_TTL_MS) {
    return cachedConnection.promise;
  }
  const promise = fetchDefaultConnection();
  cachedConnection = { at: Date.now(), promise };
  // Un error no se cachea: el próximo request vuelve a intentar.
  promise.catch(() => {
    if (cachedConnection?.promise === promise) cachedConnection = null;
  });
  return promise;
}

async function fetchDefaultConnection(): Promise<WhatsAppConnection | null> {
  if (!isDbConfigured()) return null;

  const pool = getPool();
  const [rows] = await pool.query<ConnectionRow[]>(
    `SELECT id, client_id, waba_id, phone_number_id, access_token_enc
     FROM web_whatsapp_connections
     WHERE status = 'connected'
     ORDER BY id ASC
     LIMIT 1`
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    clientId: row.client_id,
    wabaId: row.waba_id,
    phoneNumberId: row.phone_number_id,
    accessToken: decryptSecret(row.access_token_enc),
    apiVersion: process.env.META_GRAPH_API_VERSION || "v23.0",
  };
}
