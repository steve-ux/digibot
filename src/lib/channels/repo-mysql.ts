// ChannelsRepo sobre web_channel_accounts. Server-only.
// Los tokens se guardan cifrados (AES-256-GCM, src/lib/crypto.ts). El refresh token
// de TikTok va cifrado dentro de meta (refreshTokenEnc), así no hace falta otra columna.

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { decryptSecret, encryptSecret } from "../crypto";
import { getPool } from "../db";
import type { ChannelsRepo, NewSocial, SocialDisconnection, SocialHealth, SocialHealthPatch, SocialKind, SocialRecord } from "./repo";

const SOCIAL_COLUMNS = `id, client_id, channel, account_id, page_id, auth_type, business_id, config_id, display_name, access_token_enc, meta,
  UNIX_TIMESTAMP(token_expires_at) AS expires_ts, UNIX_TIMESTAMP(COALESCE(connected_at, created_at)) AS connected_ts,
  health, last_error, UNIX_TIMESTAMP(health_checked_at) AS checked_ts, disconnection_info`;

interface SocialRow extends RowDataPacket {
  id: number;
  client_id: number;
  channel: SocialKind;
  account_id: string;
  page_id: string | null;
  auth_type: "page" | "ig_unified" | null;
  business_id: string | null;
  config_id: string | null;
  display_name: string | null;
  access_token_enc: string | null;
  meta: unknown;
  expires_ts: number | string | null;
  connected_ts: number | string;
  health: SocialHealth | null;
  last_error: string | null;
  checked_ts: number | string | null;
  disconnection_info: unknown;
}

interface SocialMeta {
  pictureUrl?: string | null;
  pageName?: string | null;
  refreshTokenEnc?: string | null;
  refreshExpiresAt?: number | null;
}

function parseMeta(value: unknown): SocialMeta {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value as SocialMeta;
}

function decryptOrNull(value: string | null | undefined) {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}

function mapSocial(r: SocialRow): SocialRecord {
  const meta = parseMeta(r.meta);
  return {
    id: r.id,
    accountId: r.client_id,
    channel: r.channel,
    externalId: r.account_id,
    pageId: r.page_id,
    authType: r.auth_type ?? "page",
    businessId: r.business_id ?? null,
    configId: r.config_id ?? null,
    displayName: r.display_name,
    accessToken: r.access_token_enc ? decryptSecret(r.access_token_enc) : "",
    tokenExpiresAt: r.expires_ts === null ? null : Number(r.expires_ts),
    pictureUrl: meta.pictureUrl ?? null,
    pageName: meta.pageName ?? null,
    refreshToken: decryptOrNull(meta.refreshTokenEnc),
    refreshExpiresAt: meta.refreshExpiresAt ?? null,
    connectedAt: Number(r.connected_ts),
    health: r.health ?? "active",
    lastError: r.last_error ?? null,
    healthCheckedAt: r.checked_ts === null || r.checked_ts === undefined ? null : Number(r.checked_ts),
    disconnectionInfo: r.disconnection_info ? (parseMeta(r.disconnection_info) as unknown as SocialDisconnection) : null,
  };
}

class MySqlChannelsRepo implements ChannelsRepo {
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
    const meta = JSON.stringify({
      pictureUrl: r.pictureUrl,
      pageName: r.pageName,
      ...(r.refreshToken ? { refreshTokenEnc: encryptSecret(r.refreshToken), refreshExpiresAt: r.refreshExpiresAt ?? null } : {}),
    });
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO web_channel_accounts
         (client_id, channel, account_id, page_id, auth_type, business_id, config_id, display_name, access_token_enc,
          token_expires_at, status, health, meta, connected_at, connected_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), 'connected', 'active', ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         client_id = VALUES(client_id), page_id = VALUES(page_id), auth_type = VALUES(auth_type),
         business_id = VALUES(business_id), config_id = VALUES(config_id), display_name = VALUES(display_name),
         health = 'active', last_error = NULL, last_error_at = NULL, disconnection_info = NULL,
         access_token_enc = VALUES(access_token_enc), token_expires_at = VALUES(token_expires_at),
         status = 'connected', meta = VALUES(meta), connected_at = NOW(), connected_by = VALUES(connected_by),
         id = LAST_INSERT_ID(id)`,
      [
        r.accountId,
        r.channel,
        r.externalId,
        r.pageId,
        r.authType ?? "page",
        r.businessId ?? null,
        r.configId ?? null,
        r.displayName,
        encryptSecret(r.accessToken),
        r.tokenExpiresAt,
        meta,
        r.connectedBy,
      ]
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
      `UPDATE web_channel_accounts
       SET status = 'disconnected', access_token_enc = NULL, token_expires_at = NULL,
           meta = JSON_REMOVE(COALESCE(meta, JSON_OBJECT()), '$.refreshTokenEnc')
       WHERE id = ?`,
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

  async updateRefreshToken(id: number, refreshToken: string, expiresAt: number | null) {
    await getPool().query(
      `UPDATE web_channel_accounts
       SET meta = JSON_SET(COALESCE(meta, JSON_OBJECT()), '$.refreshTokenEnc', ?, '$.refreshExpiresAt', ?)
       WHERE id = ?`,
      [encryptSecret(refreshToken), expiresAt, id]
    );
  }

  async updateSocialHealth(id: number, patch: SocialHealthPatch) {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.health !== undefined) {
      sets.push("health = ?");
      params.push(patch.health);
    }
    if (patch.lastError !== undefined) {
      sets.push("last_error = ?");
      params.push(patch.lastError === null ? null : patch.lastError.slice(0, 500));
    }
    if (patch.lastErrorAt !== undefined) {
      sets.push("last_error_at = FROM_UNIXTIME(?)");
      params.push(patch.lastErrorAt);
    }
    if (patch.healthCheckedAt !== undefined) {
      sets.push("health_checked_at = FROM_UNIXTIME(?)");
      params.push(patch.healthCheckedAt);
    }
    if (patch.disconnectionInfo !== undefined) {
      sets.push("disconnection_info = ?");
      params.push(patch.disconnectionInfo === null ? null : JSON.stringify(patch.disconnectionInfo));
    }
    if (sets.length === 0) return;
    await getPool().query(`UPDATE web_channel_accounts SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
  }

  async listSocialForHealthCheck(beforeUnix: number) {
    const [rows] = await getPool().query<SocialRow[]>(
      `SELECT ${SOCIAL_COLUMNS} FROM web_channel_accounts
       WHERE channel IN ('fb', 'ig') AND status = 'connected' AND access_token_enc IS NOT NULL
         AND health <> 'disconnected' AND (health_checked_at IS NULL OR health_checked_at < FROM_UNIXTIME(?))`,
      [beforeUnix]
    );
    return rows.map(mapSocial);
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
