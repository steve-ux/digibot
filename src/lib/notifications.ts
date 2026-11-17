// Avisos en el panel (web_notifications). Server-only.
// client_id NULL = aviso para los superadmins (equipo de DigiBot).

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";

export interface PanelNotification {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: number;
}

export async function addNotification(n: {
  accountId: number | null;
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
}) {
  const [result] = await getPool().query<ResultSetHeader>(
    `INSERT INTO web_notifications (client_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?)`,
    [n.accountId, n.kind, n.title.slice(0, 191), n.body?.slice(0, 1000) ?? null, n.link ?? null]
  );
  return result.insertId;
}

export async function listUnreadNotifications(accountId: number | null, limit = 5): Promise<PanelNotification[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, kind, title, body, link, UNIX_TIMESTAMP(created_at) AS created_ts
     FROM web_notifications
     WHERE ${accountId === null ? "client_id IS NULL" : "client_id = ?"} AND read_at IS NULL
     ORDER BY id DESC LIMIT ?`,
    accountId === null ? [limit] : [accountId, limit]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    kind: String(r.kind),
    title: String(r.title),
    body: r.body ?? null,
    link: r.link ?? null,
    createdAt: Number(r.created_ts),
  }));
}

// Solo marca avisos de esa cuenta (o de superadmins): un id ajeno no hace nada.
export async function markNotificationRead(accountId: number | null, id: number) {
  await getPool().query(
    `UPDATE web_notifications SET read_at = NOW()
     WHERE id = ? AND ${accountId === null ? "client_id IS NULL" : "client_id = ?"} AND read_at IS NULL`,
    accountId === null ? [id] : [id, accountId]
  );
}
