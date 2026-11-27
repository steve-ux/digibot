// Desautorización y eliminación de datos pedidas desde Meta. Server-only.
//
// Cuando alguien quita DigiBot de su cuenta (Configuración → Integraciones comerciales /
// Apps y sitios web), Meta llama a:
//   - /webhooks/meta/deauthorize   -> solo avisa
//   - /webhooks/meta/data-deletion -> pide borrar los datos; hay que devolver un código
//                                     y un link donde la persona ve el estado
//
// El aviso trae el id de la PERSONA (por app), pero las conexiones usan tokens de usuario
// del sistema del portfolio: no hay forma confiable de saber qué conexión era de quién.
// Por eso, en los dos casos se verifican en el momento todas las conexiones de Meta con
// debug_token. Las que Meta ya revocó quedan "Desconectado" con el botón Reconectar
// (WhatsApp, Facebook e Instagram). En el pedido de eliminación, además, a las de Facebook e
// Instagram revocadas se les borra el token y salen de Canales. WhatsApp no se borra
// automáticamente: es el canal principal y su baja tiene su propio flujo
// (PARTNER_REMOVED); el resto se atiende a mano según /eliminacion-de-datos.

import { randomBytes } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "../db";

export interface DeletionRequest {
  code: string;
  status: "received" | "processed";
  connectionsRemoved: number;
  createdAt: number;
  processedAt: number | null;
}

export interface DeletionDeps {
  save(code: string, metaUserId: string): Promise<void>;
  markProcessed(code: string, connectionsRemoved: number): Promise<void>;
  find(code: string): Promise<DeletionRequest | null>;
  // Verifica todas las conexiones de Meta con debug_token
  checkAllConnections(): Promise<void>;
  // Borra el token de las conexiones de Facebook e Instagram que Meta revocó. Devuelve cuántas.
  purgeRevokedSocial(): Promise<number>;
}

const LOG = "[meta-datos]";

// 16 caracteres sin ambigüedades (sin 0/O/1/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newConfirmationCode() {
  return [...randomBytes(16)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const isConfirmationCode = (code: unknown): code is string => typeof code === "string" && /^[A-Z2-9]{16}$/.test(code);

export function deletionStatusUrl(baseUrl: string, code: string) {
  return `${baseUrl.replace(/\/$/, "")}/eliminacion-de-datos/estado?codigo=${code}`;
}

// Desautorización: se revisan las conexiones (las revocadas quedan para reconectar).
export async function handleDeauthorize(metaUserId: string, deps: DeletionDeps = mysqlDeletionDeps()) {
  console.warn(`${LOG} Meta avisó que la persona ${metaUserId} quitó DigiBot. Se verifican las conexiones.`);
  await deps.checkAllConnections();
}

// Pedido de eliminación: se registra y devuelve el código. El procesamiento sigue en segundo plano.
export async function createDeletionRequest(metaUserId: string, deps: DeletionDeps = mysqlDeletionDeps()) {
  const code = newConfirmationCode();
  await deps.save(code, metaUserId);
  console.warn(`${LOG} Pedido de eliminación de datos ${code} (persona ${metaUserId}).`);
  return code;
}

export async function processDeletionRequest(code: string, deps: DeletionDeps = mysqlDeletionDeps()) {
  try {
    await deps.checkAllConnections();
    const removed = await deps.purgeRevokedSocial();
    await deps.markProcessed(code, removed);
    console.warn(`${LOG} Pedido ${code} procesado: ${removed} conexión(es) de Facebook/Instagram borradas.`);
  } catch (err) {
    // Queda "received": se ve en la base y se puede atender a mano.
    console.error(`${LOG} No se pudo procesar el pedido ${code}:`, (err as Error).message);
  }
}

export function getDeletionRequest(code: string, deps: DeletionDeps = mysqlDeletionDeps()) {
  return deps.find(code);
}

// ---------- MySQL ----------

export function mysqlDeletionDeps(): DeletionDeps {
  return {
    async save(code, metaUserId) {
      await getPool().query<ResultSetHeader>(
        `INSERT INTO web_meta_data_deletions (confirmation_code, meta_user_id) VALUES (?, ?)`,
        [code, metaUserId.slice(0, 64)]
      );
    },
    async markProcessed(code, connectionsRemoved) {
      await getPool().query(
        `UPDATE web_meta_data_deletions SET status = 'processed', connections_removed = ?, processed_at = NOW() WHERE confirmation_code = ?`,
        [connectionsRemoved, code]
      );
    },
    async find(code) {
      const [rows] = await getPool().query<RowDataPacket[]>(
        `SELECT confirmation_code, status, connections_removed, UNIX_TIMESTAMP(created_at) AS created_ts,
                UNIX_TIMESTAMP(processed_at) AS processed_ts
         FROM web_meta_data_deletions WHERE confirmation_code = ?`,
        [code]
      );
      const r = rows[0];
      if (!r) return null;
      return {
        code: String(r.confirmation_code),
        status: r.status === "processed" ? "processed" : "received",
        connectionsRemoved: Number(r.connections_removed),
        createdAt: Number(r.created_ts),
        processedAt: r.processed_ts === null ? null : Number(r.processed_ts),
      };
    },
    async checkAllConnections() {
      // `at` un día adelante: entra todo, aunque se haya verificado hoy.
      const at = Math.floor(Date.now() / 1000) + 24 * 3600;
      const [{ runHealthSweep }, { runSocialHealthSweep }] = await Promise.all([
        import("../whatsapp-accounts/health"),
        import("../channels/social-health"),
      ]);
      await Promise.all([runHealthSweep(undefined, at), runSocialHealthSweep(undefined, at)]);
    },
    async purgeRevokedSocial() {
      const [result] = await getPool().query<ResultSetHeader>(
        `UPDATE web_channel_accounts
         SET status = 'disconnected', access_token_enc = NULL, token_expires_at = NULL
         WHERE channel IN ('fb', 'ig') AND status = 'connected' AND health = 'disconnected'`
      );
      return result.affectedRows;
    },
  };
}
