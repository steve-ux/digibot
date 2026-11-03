// Datos de Métricas desde MySQL. Server-only.
// Trae solo lo necesario de los mensajes del período (y del anterior) y el
// cálculo lo hace computeMetrics(), igual que en el modo demo.

import type { RowDataPacket } from "mysql2";
import { getPool } from "../db";
import type { ChannelId } from "./channels";
import { computeMetrics, metricsWindowStart, type MetricsMessage, type MetricsPeriod } from "./metrics";

interface Row extends RowDataPacket {
  conversation_id: number;
  channel: ChannelId;
  direction: "in" | "out" | "internal";
  author: string | null;
  author_name: string | null;
  type: string;
  ts: number | string;
}

// Tope de seguridad: ~100 mil mensajes alcanzan para 60 días de una cuenta grande.
const MAX_ROWS = 100_000;

export async function loadMetrics(accountId: number, period: MetricsPeriod, now = Math.floor(Date.now() / 1000)) {
  const since = metricsWindowStart(period, now);
  const pool = getPool();
  const [[rows], [waiting]] = await Promise.all([
    pool.query<Row[]>(
      `SELECT m.conversation_id, c.channel, m.direction, m.author, m.author_name, m.type,
              UNIX_TIMESTAMP(m.message_at) AS ts
       FROM web_wa_messages m
       JOIN web_wa_conversations c ON c.id = m.conversation_id
       WHERE c.client_id = ? AND m.message_at >= FROM_UNIXTIME(?)
         AND (m.direction IN ('in', 'out') OR m.type = 'system:resolve')
         -- Un envío que falló no cuenta como respuesta.
         AND NOT (m.direction = 'out' AND m.status = 'failed')
       ORDER BY m.message_at, m.id
       LIMIT ?`,
      [accountId, since, MAX_ROWS]
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM web_wa_conversations
       WHERE client_id = ? AND status = 'open' AND last_message_author = 'customer'`,
      [accountId]
    ),
  ]);

  const messages: MetricsMessage[] = [];
  for (const r of rows) {
    const kind: MetricsMessage["kind"] =
      r.type === "system:resolve"
        ? "resolve"
        : r.direction === "in"
          ? "in"
          : r.author === "bot"
            ? "bot"
            : "agent";
    messages.push({
      conversationId: Number(r.conversation_id),
      channel: r.channel ?? "wa",
      kind,
      authorName: r.author_name,
      at: Number(r.ts),
    });
  }
  return computeMetrics({ period, now, messages, waitingNow: Number(waiting[0]?.n ?? 0) });
}
