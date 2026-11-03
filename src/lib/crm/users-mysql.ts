// UsersRepo sobre web_users (migraciones 0008 y 0009). Server-only.

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "../db";
import { parseChannels, type CrmRole } from "./permissions";
import type { NewUser, UserPatch, UserRecord, UsersRepo, UserStatus } from "./users-repo";

const COLUMNS = `
  id, client_id, name, email, role, channels, status, password_hash, invite_token_hash, session_version,
  UNIX_TIMESTAMP(invite_expires_at) AS invite_expires_ts,
  UNIX_TIMESTAMP(last_login_at) AS last_login_ts,
  UNIX_TIMESTAMP(created_at) AS created_ts`;

const ORDER = `ORDER BY FIELD(status, 'active', 'invited', 'disabled'), name`;

interface UserRow extends RowDataPacket {
  id: number;
  client_id: number | null;
  name: string;
  email: string;
  role: CrmRole;
  channels: unknown;
  status: UserStatus;
  password_hash: string | null;
  invite_token_hash: string | null;
  session_version: number;
  invite_expires_ts: number | string | null;
  last_login_ts: number | string | null;
  created_ts: number | string;
}

const num = (v: number | string | null) => (v === null ? null : Number(v));

function map(row: UserRow): UserRecord {
  return {
    id: row.id,
    accountId: row.role === "superadmin" ? null : num(row.client_id),
    name: row.name,
    email: row.email,
    role: row.role,
    channels: parseChannels(row.channels),
    status: row.status,
    passwordHash: row.password_hash,
    inviteTokenHash: row.invite_token_hash,
    inviteExpiresAt: num(row.invite_expires_ts),
    sessionVersion: Number(row.session_version),
    lastLoginAt: num(row.last_login_ts),
    createdAt: Number(row.created_ts),
  };
}

const COLUMN_OF: Record<keyof UserPatch, string> = {
  accountId: "client_id = ?",
  name: "name = ?",
  email: "email = ?",
  role: "role = ?",
  channels: "channels = ?",
  status: "status = ?",
  passwordHash: "password_hash = ?",
  inviteTokenHash: "invite_token_hash = ?",
  inviteExpiresAt: "invite_expires_at = FROM_UNIXTIME(?)",
  sessionVersion: "session_version = ?",
  lastLoginAt: "last_login_at = FROM_UNIXTIME(?)",
};

class MySqlUsersRepo implements UsersRepo {
  private async one(where: string, value: unknown) {
    const [rows] = await getPool().query<UserRow[]>(`SELECT ${COLUMNS} FROM web_users WHERE ${where} LIMIT 1`, [value]);
    return rows[0] ? map(rows[0]) : null;
  }

  async listByAccount(accountId: number) {
    const [rows] = await getPool().query<UserRow[]>(
      `SELECT ${COLUMNS} FROM web_users WHERE client_id = ? AND role <> 'superadmin' ${ORDER}`,
      [accountId]
    );
    return rows.map(map);
  }
  async listSuperadmins() {
    const [rows] = await getPool().query<UserRow[]>(`SELECT ${COLUMNS} FROM web_users WHERE role = 'superadmin' ${ORDER}`);
    return rows.map(map);
  }
  getById(id: number) {
    return this.one("id = ?", id);
  }
  getByEmail(email: string) {
    return this.one("email = ?", email.toLowerCase());
  }
  getByInviteHash(hash: string) {
    return this.one("invite_token_hash = ?", hash);
  }

  async create(user: NewUser) {
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO web_users (client_id, name, email, role, channels, status, invite_token_hash, invite_expires_at)
       VALUES (?, ?, ?, ?, ?, 'invited', ?, FROM_UNIXTIME(?))`,
      [
        user.accountId,
        user.name,
        user.email,
        user.role,
        JSON.stringify(user.channels),
        user.inviteTokenHash,
        user.inviteExpiresAt,
      ]
    );
    return result.insertId;
  }

  async update(id: number, patch: UserPatch) {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(patch) as [keyof UserPatch, unknown][]) {
      if (value === undefined) continue;
      sets.push(COLUMN_OF[key]);
      params.push(key === "channels" ? JSON.stringify(value) : value);
    }
    if (sets.length === 0) return;
    params.push(id);
    await getPool().query(`UPDATE web_users SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async countActiveAdmins(accountId: number) {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM web_users WHERE client_id = ? AND role = 'admin' AND status = 'active'`,
      [accountId]
    );
    return Number(rows[0]?.n ?? 0);
  }

  async countActiveSuperadmins() {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM web_users WHERE role = 'superadmin' AND status = 'active'`
    );
    return Number(rows[0]?.n ?? 0);
  }
}

let repo: UsersRepo | null = null;
export function getMySqlUsersRepo(): UsersRepo {
  repo ??= new MySqlUsersRepo();
  return repo;
}
