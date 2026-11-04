// ChannelsRepo sobre web_whatsapp_connections y web_channel_accounts. Server-only.
// Los tokens se guardan cifrados (AES-256-GCM, src/lib/crypto.ts).

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { decryptSecret, encryptSecret } from "../crypto";
import { getPool } from "../db";
import type { ChannelsRepo, NewSocial, NewWhatsApp, SocialKind, SocialRecord, WhatsAppRecord } from "./repo";

const WA_COLUMNS = `id, client_id, waba_id, phone_number_id, display_phone_number, verified_name, access_token_enc,
  UNIX_TIMESTAMP(COALESCE(connected_at, created_at)) AS connected_ts`;

const SOCIAL_COLUMNS = `id, client_id, channel, account_id, page_id, display_name, access_token_enc, meta,
  UNIX_TIMESTAMP(token_expires_at) AS expires_ts, UNIX_TIMESTAMP(COALESCE(connected_at, created_at)) AS connected_ts`;

interface WaRow extends RowDataPacket {
  id: number;
  client_id: number;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  access_token_enc: string;
  connected_ts: number | string;
}

interface SocialRow extends RowDataPacket {
  id: number;
  client_id: number;
  channel: SocialKind;
  account_id: string;
  page_id: string | null;
  display_name: string | null;
  access_token_enc: string | null;
  meta: unknown;
  expires_ts: number | string | null;
  connected_ts: number | string;
}

function mapWa(r: WaRow): WhatsAppRecord {
  return {
    id: r.id,
    accountId: r.client_id,
    wabaId: r.waba_id,
    phoneNumberId: r.phone_number_id,
    displayPhoneNumber: r.display_phone_number,
    verifiedName: r.verified_name,
    accessToken: decryptSecret(r.access_token_enc),
    connectedAt: Number(r.connected_ts),
  };
}

function parseMeta(value: unknown): { pictureUrl?: string; pageName?: string } {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value as { pictureUrl?: string; pageName?: string };
}

function mapSocial(r: SocialRow): SocialRecord {
  const meta = parseMeta(r.meta);
  return {
    id: r.id,
    accountId: r.client_id,
    channel: r.channel,
    externalId: r.account_id,
    pageId: r.page_id,
    displayName: r.display_name,
    accessToken: r.access_token_enc ? decryptSecret(r.access_token_enc) : "",
    tokenExpiresAt: r.expires_ts === null ? null : Number(r.expires_ts),
    pictureUrl: meta.pictureUrl ?? null,
    pageName: meta.pageName ?? null,
    connectedAt: Number(r.connected_ts),
  };
}

class MySqlChannelsRepo implements ChannelsRepo {
  async listWhatsApp(accountId: number) {
    const [rows] = await getPool().query<WaRow[]>(
      `SELECT ${WA_COLUMNS} FROM web_whatsapp_connections
       WHERE client_id = ? AND status = 'connected' AND phone_number_id IS NOT NULL ORDER BY id`,
      [accountId]
    );
    return rows.map(mapWa);
  }

  async findWhatsAppByPhone(phoneNumberId: string) {
    const [rows] = await getPool().query<WaRow[]>(
      `SELECT ${WA_COLUMNS} FROM web_whatsapp_connections WHERE phone_number_id = ? AND status = 'connected' LIMIT 1`,
      [phoneNumberId]
    );
    return rows[0] ? mapWa(rows[0]) : null;
  }

  async saveWhatsApp(r: NewWhatsApp) {
    // Reconectar el mismo número actualiza la fila (phone_number_id es único).
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO web_whatsapp_connections
         (client_id, waba_id, phone_number_id, display_phone_number, verified_name, access_token_enc,
          token_type, status, connected_at, connected_by, meta)
       VALUES (?, ?, ?, ?, ?, ?, 'system_user', 'connected', NOW(), ?, ?)
       ON DUPLICATE KEY UPDATE
         client_id = VALUES(client_id), waba_id = VALUES(waba_id),
         display_phone_number = VALUES(display_phone_number), verified_name = VALUES(verified_name),
         access_token_enc = VALUES(access_token_enc), status = 'connected', connected_at = NOW(),
         connected_by = VALUES(connected_by), meta = COALESCE(VALUES(meta), meta), id = LAST_INSERT_ID(id)`,
      [
        r.accountId,
        r.wabaId,
        r.phoneNumberId,
        r.displayPhoneNumber,
        r.verifiedName,
        encryptSecret(r.accessToken),
        r.connectedBy,
        r.pin ? JSON.stringify({ pin_enc: encryptSecret(r.pin) }) : null,
      ]
    );
    return result.insertId;
  }

  async disconnectWhatsApp(accountId: number, id: number) {
    const [rows] = await getPool().query<WaRow[]>(
      `SELECT ${WA_COLUMNS} FROM web_whatsapp_connections WHERE id = ? AND client_id = ? AND status = 'connected'`,
      [id, accountId]
    );
    if (!rows[0]) return null;
    await getPool().query(`UPDATE web_whatsapp_connections SET status = 'revoked' WHERE id = ?`, [id]);
    return mapWa(rows[0]);
  }

  async listSocial(accountId: number) {
    const [rows] = await getPool().query<SocialRow[]>(
      `SELECT ${SOCIAL_COLUMNS} FROM web_channel_accounts WHERE client_id = ? AND status = 'connected' ORDER BY id`,
      [accountId]
    );
    return rows.map(mapSocial);
  }

  async findSocial(channel: SocialKind, externalId: string) {
    const [rows] = await getPool().query<SocialRow[]>(
      `SELECT ${SOCIAL_COLUMNS} FROM web_channel_accounts WHERE channel = ? AND account_id = ? AND status = 'connected' LIMIT 1`,
      [channel, externalId]
    );
    return rows[0] ? mapSocial(rows[0]) : null;
  }

  async saveSocial(r: NewSocial) {
    const meta = JSON.stringify({ pictureUrl: r.pictureUrl, pageName: r.pageName });
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO web_channel_accounts
         (client_id, channel, account_id, page_id, display_name, access_token_enc, token_expires_at,
          status, meta, connected_at, connected_by)
       VALUES (?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), 'connected', ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         client_id = VALUES(client_id), page_id = VALUES(page_id), display_name = VALUES(display_name),
         access_token_enc = VALUES(access_token_enc), token_expires_at = VALUES(token_expires_at),
         status = 'connected', meta = VALUES(meta), connected_at = NOW(), connected_by = VALUES(connected_by),
         id = LAST_INSERT_ID(id)`,
      [r.accountId, r.channel, r.externalId, r.pageId, r.displayName, encryptSecret(r.accessToken), r.tokenExpiresAt, meta, r.connectedBy]
    );
    return result.insertId;
  }

  async disconnectSocial(accountId: number, id: number) {
    const [rows] = await getPool().query<SocialRow[]>(
      `SELECT ${SOCIAL_COLUMNS} FROM web_channel_accounts WHERE id = ? AND client_id = ? AND status = 'connected'`,
      [id, accountId]
    );
    if (!rows[0]) return null;
    // El token se borra: desconectar no deja credenciales guardadas.
    await getPool().query(
      `UPDATE web_channel_accounts SET status = 'disconnected', access_token_enc = NULL, token_expires_at = NULL WHERE id = ?`,
      [id]
    );
    return mapSocial(rows[0]);
  }

  async updateSocialToken(id: number, accessToken: string, expiresAt: number | null) {
    await getPool().query(
      `UPDATE web_channel_accounts SET access_token_enc = ?, token_expires_at = FROM_UNIXTIME(?) WHERE id = ?`,
      [encryptSecret(accessToken), expiresAt, id]
    );
  }

  async listExpiring(channel: SocialKind, beforeUnix: number) {
    const [rows] = await getPool().query<SocialRow[]>(
      `SELECT ${SOCIAL_COLUMNS} FROM web_channel_accounts
       WHERE channel = ? AND status = 'connected' AND token_expires_at IS NOT NULL AND token_expires_at < FROM_UNIXTIME(?)`,
      [channel, beforeUnix]
    );
    return rows.map(mapSocial);
  }
}

let repo: ChannelsRepo | null = null;
export function getMySqlChannelsRepo(): ChannelsRepo {
  repo ??= new MySqlChannelsRepo();
  return repo;
}
