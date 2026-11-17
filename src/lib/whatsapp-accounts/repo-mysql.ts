// WaRepo sobre MySQL. Server-only. Tokens, PIN y code de sesión se guardan cifrados
// (AES-256-GCM, src/lib/crypto.ts); nunca se loguean.

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { decryptSecret, encryptSecret } from "../crypto";
import { getPool } from "../db";
import {
  MAX_JOB_ATTEMPTS,
  type NewWaAccount,
  type SignupSession,
  type SignupSessionPatch,
  type WaAccount,
  type WaAccountPatch,
  type WaRepo,
  type WebhookJob,
} from "./repo";
import type { DisconnectionInfo, SignupEventRow, Steps } from "./types";

const ACCOUNT_COLUMNS = `id, client_id, waba_id, phone_number_id, business_id, display_phone_number, verified_name,
  access_token_enc, pin_enc, meta, is_coexistence, status, health, disconnection_info, onboarding,
  sync_state_request_id, history_request_id, history_status, history_progress, last_error,
  UNIX_TIMESTAMP(last_error_at) AS last_error_ts, UNIX_TIMESTAMP(health_checked_at) AS checked_ts,
  signup_session_id, UNIX_TIMESTAMP(COALESCE(connected_at, created_at)) AS connected_ts`;

interface AccountRow extends RowDataPacket {
  id: number;
  client_id: number;
  waba_id: string;
  phone_number_id: string;
  business_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  access_token_enc: string;
  pin_enc: string | null;
  meta: unknown;
  is_coexistence: number;
  status: WaAccount["status"];
  health: WaAccount["health"];
  disconnection_info: unknown;
  onboarding: unknown;
  sync_state_request_id: string | null;
  history_request_id: string | null;
  history_status: WaAccount["historyStatus"];
  history_progress: number;
  last_error: string | null;
  last_error_ts: number | string | null;
  checked_ts: number | string | null;
  signup_session_id: string | null;
  connected_ts: number | string | null;
}

function json<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

const num = (v: number | string | null) => (v === null ? null : Number(v));

function safeDecrypt(value: string | null | undefined) {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}

function mapAccount(r: AccountRow): WaAccount {
  // Las conexiones de la etapa 6 guardaban el PIN en meta.pin_enc.
  const legacyPin = json<{ pin_enc?: string }>(r.meta)?.pin_enc ?? null;
  return {
    id: r.id,
    accountId: r.client_id,
    wabaId: r.waba_id,
    phoneNumberId: r.phone_number_id,
    businessId: r.business_id,
    displayPhoneNumber: r.display_phone_number,
    verifiedName: r.verified_name,
    accessToken: safeDecrypt(r.access_token_enc) ?? "",
    pin: safeDecrypt(r.pin_enc ?? legacyPin),
    isCoexistence: Boolean(r.is_coexistence),
    status: r.status,
    health: r.health,
    disconnectionInfo: json<DisconnectionInfo>(r.disconnection_info),
    steps: json<Steps>(r.onboarding) ?? {},
    syncStateRequestId: r.sync_state_request_id,
    historyRequestId: r.history_request_id,
    historyStatus: r.history_status,
    historyProgress: Number(r.history_progress) || 0,
    lastError: r.last_error,
    lastErrorAt: num(r.last_error_ts),
    healthCheckedAt: num(r.checked_ts),
    signupSessionId: r.signup_session_id,
    connectedAt: num(r.connected_ts),
  };
}

const SESSION_COLUMNS = `id, client_id, user_id, reconnect_connection_id, status, access_token_enc,
  UNIX_TIMESTAMP(code_received_at) AS code_ts, event_type, waba_id, phone_number_id, business_id, is_coexistence,
  meta_session_id, current_step, error_code, error_message, connection_id, UNIX_TIMESTAMP(created_at) AS created_ts`;

interface SessionRow extends RowDataPacket {
  id: string;
  client_id: number;
  user_id: number | null;
  reconnect_connection_id: number | null;
  status: SignupSession["status"];
  access_token_enc: string | null;
  code_ts: number | string | null;
  event_type: string | null;
  waba_id: string | null;
  phone_number_id: string | null;
  business_id: string | null;
  is_coexistence: number;
  meta_session_id: string | null;
  current_step: string | null;
  error_code: string | null;
  error_message: string | null;
  connection_id: number | null;
  created_ts: number | string;
}

function mapSession(r: SessionRow): SignupSession {
  return {
    id: r.id,
    accountId: r.client_id,
    userId: r.user_id,
    reconnectConnectionId: r.reconnect_connection_id,
    status: r.status,
    accessToken: safeDecrypt(r.access_token_enc),
    codeReceivedAt: num(r.code_ts),
    eventType: r.event_type,
    wabaId: r.waba_id,
    phoneNumberId: r.phone_number_id,
    businessId: r.business_id,
    isCoexistence: Boolean(r.is_coexistence),
    metaSessionId: r.meta_session_id,
    currentStep: r.current_step,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    connectionId: r.connection_id,
    createdAt: Number(r.created_ts),
  };
}

const truncate = (s: string | null | undefined, max: number) => (s ? s.slice(0, max) : null);

class MySqlWaRepo implements WaRepo {
  private async accountsWhere(where: string, params: unknown[]) {
    const [rows] = await getPool().query<AccountRow[]>(`SELECT ${ACCOUNT_COLUMNS} FROM web_whatsapp_connections ${where}`, params);
    return rows.map(mapAccount);
  }

  async getAccount(id: number) {
    return (await this.accountsWhere("WHERE id = ?", [id]))[0] ?? null;
  }
  async findByPhone(phoneNumberId: string) {
    return (await this.accountsWhere("WHERE phone_number_id = ? LIMIT 1", [phoneNumberId]))[0] ?? null;
  }
  listByAccount(accountId: number) {
    return this.accountsWhere("WHERE client_id = ? AND status = 'connected' AND phone_number_id IS NOT NULL ORDER BY id", [accountId]);
  }
  listByWaba(wabaId: string) {
    return this.accountsWhere("WHERE waba_id = ? AND status = 'connected' ORDER BY id", [wabaId]);
  }
  listAll() {
    return this.accountsWhere("WHERE phone_number_id IS NOT NULL ORDER BY id DESC", []);
  }
  listForHealthCheck(beforeUnix: number) {
    return this.accountsWhere(
      `WHERE status = 'connected' AND health <> 'disconnected' AND phone_number_id IS NOT NULL
         AND (health_checked_at IS NULL OR health_checked_at < FROM_UNIXTIME(?)) ORDER BY id`,
      [beforeUnix]
    );
  }

  async upsertAccount(r: NewWaAccount) {
    // phone_number_id es único: reconectar el mismo número actualiza la misma fila.
    const resetSync = r.resetSync
      ? `, sync_state_request_id = NULL, history_request_id = NULL, history_status = 'none', history_progress = 0`
      : "";
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO web_whatsapp_connections
         (client_id, waba_id, phone_number_id, business_id, display_phone_number, verified_name, access_token_enc,
          token_type, status, health, is_coexistence, signup_session_id, connected_at, connected_by, onboarding)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'system_user', 'connected', 'active', ?, ?, NOW(), ?, JSON_OBJECT())
       ON DUPLICATE KEY UPDATE
         client_id = VALUES(client_id), waba_id = VALUES(waba_id), business_id = COALESCE(VALUES(business_id), business_id),
         display_phone_number = COALESCE(VALUES(display_phone_number), display_phone_number),
         verified_name = COALESCE(VALUES(verified_name), verified_name),
         access_token_enc = VALUES(access_token_enc), status = 'connected', health = 'active', disconnection_info = NULL,
         is_coexistence = VALUES(is_coexistence), signup_session_id = VALUES(signup_session_id),
         last_error = NULL, last_error_at = NULL, connected_at = NOW(), connected_by = VALUES(connected_by),
         onboarding = JSON_OBJECT()${resetSync}, id = LAST_INSERT_ID(id)`,
      [
        r.accountId,
        r.wabaId,
        r.phoneNumberId,
        r.businessId,
        r.displayPhoneNumber,
        r.verifiedName,
        encryptSecret(r.accessToken),
        r.isCoexistence ? 1 : 0,
        r.signupSessionId,
        r.connectedBy,
      ]
    );
    return result.insertId;
  }

  async updateAccount(id: number, patch: WaAccountPatch) {
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (sql: string, value: unknown) => {
      sets.push(sql);
      params.push(value);
    };
    if ("displayPhoneNumber" in patch) set("display_phone_number = ?", patch.displayPhoneNumber);
    if ("verifiedName" in patch) set("verified_name = ?", patch.verifiedName);
    if ("pin" in patch) set("pin_enc = ?", patch.pin ? encryptSecret(patch.pin) : null);
    if ("health" in patch) set("health = ?", patch.health);
    if ("status" in patch) set("status = ?", patch.status);
    if ("disconnectionInfo" in patch) set("disconnection_info = ?", patch.disconnectionInfo ? JSON.stringify(patch.disconnectionInfo) : null);
    if ("steps" in patch) set("onboarding = ?", JSON.stringify(patch.steps ?? {}));
    if ("syncStateRequestId" in patch) set("sync_state_request_id = ?", patch.syncStateRequestId);
    if ("historyRequestId" in patch) set("history_request_id = ?", patch.historyRequestId);
    if ("historyStatus" in patch) set("history_status = ?", patch.historyStatus);
    if ("historyProgress" in patch) set("history_progress = ?", Math.max(0, Math.min(100, Math.round(patch.historyProgress ?? 0))));
    if ("lastError" in patch) set("last_error = ?", truncate(patch.lastError, 500));
    if ("lastErrorAt" in patch) set("last_error_at = FROM_UNIXTIME(?)", patch.lastErrorAt);
    if ("healthCheckedAt" in patch) set("health_checked_at = FROM_UNIXTIME(?)", patch.healthCheckedAt);
    if (sets.length === 0) return;
    params.push(id);
    await getPool().query(`UPDATE web_whatsapp_connections SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async revokeAccount(accountId: number, id: number) {
    const account = (await this.accountsWhere("WHERE id = ? AND client_id = ? AND status = 'connected'", [id, accountId]))[0];
    if (!account) return null;
    await getPool().query(`UPDATE web_whatsapp_connections SET status = 'revoked' WHERE id = ?`, [id]);
    return account;
  }

  async createSession(s: { id: string; accountId: number; userId: number | null; reconnectConnectionId: number | null }) {
    await getPool().query(
      `INSERT INTO web_wa_signup_sessions (id, client_id, user_id, reconnect_connection_id) VALUES (?, ?, ?, ?)`,
      [s.id, s.accountId, s.userId, s.reconnectConnectionId]
    );
  }
  async getSession(id: string) {
    const [rows] = await getPool().query<SessionRow[]>(`SELECT ${SESSION_COLUMNS} FROM web_wa_signup_sessions WHERE id = ?`, [id]);
    return rows[0] ? mapSession(rows[0]) : null;
  }
  async updateSession(id: string, patch: SignupSessionPatch) {
    const columns: Record<string, string> = {
      reconnectConnectionId: "reconnect_connection_id",
      status: "status",
      eventType: "event_type",
      wabaId: "waba_id",
      phoneNumberId: "phone_number_id",
      businessId: "business_id",
      metaSessionId: "meta_session_id",
      currentStep: "current_step",
      errorCode: "error_code",
      errorMessage: "error_message",
      connectionId: "connection_id",
    };
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of Object.entries(columns)) {
      if (!(key in patch)) continue;
      sets.push(`${column} = ?`);
      const value = patch[key as keyof SignupSessionPatch];
      params.push(key === "errorMessage" ? truncate(value as string | null, 500) : value);
    }
    if ("accessToken" in patch) {
      sets.push("access_token_enc = ?");
      params.push(patch.accessToken ? encryptSecret(patch.accessToken) : null);
    }
    if ("codeReceivedAt" in patch) {
      sets.push("code_received_at = FROM_UNIXTIME(?)");
      params.push(patch.codeReceivedAt);
    }
    if ("isCoexistence" in patch) {
      sets.push("is_coexistence = ?");
      params.push(patch.isCoexistence ? 1 : 0);
    }
    if (sets.length === 0) return;
    params.push(id);
    await getPool().query(`UPDATE web_wa_signup_sessions SET ${sets.join(", ")} WHERE id = ?`, params);
  }
  async claimCode(id: string) {
    const [result] = await getPool().query<ResultSetHeader>(
      `UPDATE web_wa_signup_sessions SET code_received_at = NOW() WHERE id = ? AND status = 'pending' AND code_received_at IS NULL`,
      [id]
    );
    return result.affectedRows === 1;
  }
  async claimSession(id: string) {
    const [result] = await getPool().query<ResultSetHeader>(
      `UPDATE web_wa_signup_sessions SET status = 'onboarding' WHERE id = ? AND status = 'pending'`,
      [id]
    );
    return result.affectedRows === 1;
  }
  async addSessionEvent(sessionId: string, kind: string, payload: unknown) {
    await getPool().query(`INSERT INTO web_wa_signup_events (session_id, kind, payload) VALUES (?, ?, ?)`, [
      sessionId,
      kind,
      JSON.stringify(payload ?? null).slice(0, 60_000),
    ]);
  }
  async listSessionEvents(sessionId: string): Promise<SignupEventRow[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT id, kind, payload, UNIX_TIMESTAMP(created_at) AS at FROM web_wa_signup_events WHERE session_id = ? ORDER BY id`,
      [sessionId]
    );
    return rows.map((r) => ({ id: Number(r.id), kind: String(r.kind), payload: json(r.payload), at: Number(r.at) }));
  }

  async enqueueJob(job: { field: string; wabaId: string | null; phoneNumberId: string | null; payload: unknown }) {
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO web_wa_webhook_jobs (field, waba_id, phone_number_id, payload) VALUES (?, ?, ?, ?)`,
      [job.field, job.wabaId, job.phoneNumberId, JSON.stringify(job.payload)]
    );
    return result.insertId;
  }
  async claimJobs(limit: number): Promise<WebhookJob[]> {
    // Los que quedaron "processing" más de 10 minutos (el server se reinició) se vuelven a tomar.
    const [candidates] = await getPool().query<RowDataPacket[]>(
      `SELECT id FROM web_wa_webhook_jobs
       WHERE status = 'pending' OR (status = 'processing' AND locked_at < NOW() - INTERVAL 10 MINUTE)
       ORDER BY id LIMIT ?`,
      [limit]
    );
    const claimed: WebhookJob[] = [];
    for (const { id } of candidates) {
      const [result] = await getPool().query<ResultSetHeader>(
        `UPDATE web_wa_webhook_jobs SET status = 'processing', locked_at = NOW(), attempts = attempts + 1
         WHERE id = ? AND (status = 'pending' OR (status = 'processing' AND locked_at < NOW() - INTERVAL 10 MINUTE))`,
        [id]
      );
      if (result.affectedRows !== 1) continue; // lo tomó otro proceso
      const [rows] = await getPool().query<RowDataPacket[]>(
        `SELECT id, field, waba_id, phone_number_id, payload, attempts FROM web_wa_webhook_jobs WHERE id = ?`,
        [id]
      );
      const r = rows[0];
      if (r) {
        claimed.push({
          id: Number(r.id),
          field: r.field,
          wabaId: r.waba_id,
          phoneNumberId: r.phone_number_id,
          payload: json(r.payload),
          attempts: Number(r.attempts),
        });
      }
    }
    return claimed;
  }
  async finishJob(id: number, error: string | null) {
    await getPool().query(
      `UPDATE web_wa_webhook_jobs
       SET status = IF(? IS NULL, 'done', IF(attempts >= ?, 'failed', 'pending')), error = ?, locked_at = NULL
       WHERE id = ?`,
      [error, MAX_JOB_ATTEMPTS, truncate(error, 500), id]
    );
  }

  async upsertContact(phoneNumberId: string, waId: string, names: { fullName: string | null; firstName: string | null }) {
    await getPool().query(
      `INSERT INTO web_wa_contacts (phone_number_id, wa_id, full_name, first_name) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), first_name = VALUES(first_name), removed_at = NULL, synced_at = NOW()`,
      [phoneNumberId, waId, truncate(names.fullName, 191), truncate(names.firstName, 191)]
    );
  }
  async removeContact(phoneNumberId: string, waId: string) {
    await getPool().query(
      `UPDATE web_wa_contacts SET removed_at = NOW(), synced_at = NOW() WHERE phone_number_id = ? AND wa_id = ?`,
      [phoneNumberId, waId]
    );
  }
}

let repo: WaRepo | null = null;
export function getMySqlWaRepo(): WaRepo {
  repo ??= new MySqlWaRepo();
  return repo;
}
