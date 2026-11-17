// ChannelsRepo sobre web_channel_accounts. Server-only.
// Los tokens se guardan cifrados (AES-256-GCM, src/lib/crypto.ts).

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { decryptSecret, encryptSecret } from "../crypto";
import { getPool } from "../db";
import type { ChannelsRepo, NewSocial, SocialKind, SocialRecord } from "./repo";

const SOCIAL_COLUMNS = `id, client_id, channel, account_id, page_id, display_name, access_token_enc, meta,
  UNIX_TIMESTAMP(token_expires_at) AS expires_ts, UNIX_TIMESTAMP(COALESCE(connected_at, created_at)) AS connected_ts`;

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
