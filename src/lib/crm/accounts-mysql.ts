// AccountsRepo sobre web_clients. Server-only.

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "../db";
import type { Account, AccountsRepo, AccountStatus, AccountSummary } from "./accounts-repo";

interface AccountRow extends RowDataPacket {
  id: number;
  name: string;
  status: AccountStatus;
  created_ts: number | string;
  users?: number | string;
  conversations?: number | string;
}

const map = (r: AccountRow): Account => ({
  id: r.id,
  name: r.name,
  status: r.status,
  createdAt: Number(r.created_ts),
});

class MySqlAccountsRepo implements AccountsRepo {
  async list(): Promise<AccountSummary[]> {
    const [rows] = await getPool().query<AccountRow[]>(
      `SELECT c.id, c.name, c.status, UNIX_TIMESTAMP(c.created_at) AS created_ts,
         (SELECT COUNT(*) FROM web_users u WHERE u.client_id = c.id AND u.role <> 'superadmin' AND u.status <> 'disabled') AS users,
         (SELECT COUNT(*) FROM web_wa_conversations w WHERE w.client_id = c.id) AS conversations
       FROM web_clients c
       ORDER BY c.id`
    );
    return rows.map((r) => ({ ...map(r), users: Number(r.users ?? 0), conversations: Number(r.conversations ?? 0) }));
  }

  async get(id: number) {
    const [rows] = await getPool().query<AccountRow[]>(
      `SELECT id, name, status, UNIX_TIMESTAMP(created_at) AS created_ts FROM web_clients WHERE id = ?`,
      [id]
    );
    return rows[0] ? map(rows[0]) : null;
  }

  async create(name: string) {
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO web_clients (name, status) VALUES (?, 'active')`,
      [name]
    );
    return result.insertId;
  }

  async update(id: number, patch: Partial<Pick<Account, "name" | "status">>) {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      sets.push("name = ?");
      params.push(patch.name);
    }
    if (patch.status !== undefined) {
      sets.push("status = ?");
      params.push(patch.status);
    }
    if (!sets.length) return;
    params.push(id);
    await getPool().query(`UPDATE web_clients SET ${sets.join(", ")} WHERE id = ?`, params);
  }
}

let repo: AccountsRepo | null = null;
export function getMySqlAccountsRepo(): AccountsRepo {
  repo ??= new MySqlAccountsRepo();
  return repo;
}
