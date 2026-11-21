// Cola de los webhooks de /webhooks/meta (Messenger, comentarios de Facebook, Instagram). Server-only.
//
// El route valida la firma, guarda el body en web_meta_webhook_events y responde 200
// enseguida (Meta corta a los pocos segundos y reintenta). Un worker en el mismo proceso
// lo procesa apenas llega y el scheduler barre lo que haya quedado (reintentos).
//
// Idempotencia en dos niveles:
//   - dedupe_key = sha256 del body: si Meta reintenta la misma entrega, no se encola de nuevo
//   - cada mensaje / comentario se guarda por su mid / comment_id (insertMessage ignora repetidos)

import { createHash } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "../db";
import { processSocialWebhook, type SocialWebhookDeps } from "./webhook";

const LOG = "[meta-webhook]";
// Un evento que falla se reintenta al minuto; después de 5 intentos queda en "failed" para revisarlo a mano.
const MAX_ATTEMPTS = 5;

export interface QueuedEvent {
  id: number;
  payload: unknown;
  attempts: number;
}

export interface MetaEventQueue {
  // false si esa misma entrega ya estaba encolada
  enqueue(dedupeKey: string, object: string | null, payload: unknown): Promise<boolean>;
  claim(limit: number): Promise<QueuedEvent[]>;
  finish(id: number, error: string | null): Promise<void>;
}

export const dedupeKeyOf = (rawBody: string) => createHash("sha256").update(rawBody).digest("hex");

class MySqlMetaEventQueue implements MetaEventQueue {
  async enqueue(dedupeKey: string, object: string | null, payload: unknown) {
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO web_meta_webhook_events (dedupe_key, object, payload) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [dedupeKey, object, JSON.stringify(payload)]
    );
    return result.affectedRows === 1;
  }

  async claim(limit: number) {
    // Los que quedaron "processing" más de 10 minutos (el server se reinició) se vuelven a tomar.
    const [candidates] = await getPool().query<RowDataPacket[]>(
      `SELECT id FROM web_meta_webhook_events
       WHERE (status = 'pending' AND (attempts = 0 OR updated_at < NOW() - INTERVAL 1 MINUTE))
          OR (status = 'processing' AND locked_at < NOW() - INTERVAL 10 MINUTE)
       ORDER BY id LIMIT ?`,
      [limit]
    );
    const claimed: QueuedEvent[] = [];
    for (const { id } of candidates) {
      const [result] = await getPool().query<ResultSetHeader>(
        `UPDATE web_meta_webhook_events SET status = 'processing', locked_at = NOW(), attempts = attempts + 1
         WHERE id = ? AND (status = 'pending' OR (status = 'processing' AND locked_at < NOW() - INTERVAL 10 MINUTE))`,
        [id]
      );
      if (result.affectedRows !== 1) continue; // lo tomó otro proceso
      const [rows] = await getPool().query<RowDataPacket[]>(
        `SELECT id, payload, attempts FROM web_meta_webhook_events WHERE id = ?`,
        [id]
      );
      const r = rows[0];
      if (!r) continue;
      const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
      claimed.push({ id: Number(r.id), payload, attempts: Number(r.attempts) });
    }
    return claimed;
  }

  async finish(id: number, error: string | null) {
    await getPool().query(
      `UPDATE web_meta_webhook_events
       SET status = IF(? IS NULL, 'done', IF(attempts >= ?, 'failed', 'pending')), error = ?, locked_at = NULL
       WHERE id = ?`,
      [error, MAX_ATTEMPTS, error ? error.slice(0, 500) : null, id]
    );
  }
}

// Para tests.
export class MemoryMetaEventQueue implements MetaEventQueue {
  events: (QueuedEvent & {
    key: string;
    status: "pending" | "processing" | "done" | "failed";
    error: string | null;
    retryAt: number;
  })[] = [];
  async enqueue(dedupeKey: string, _object: string | null, payload: unknown) {
    if (this.events.some((e) => e.key === dedupeKey)) return false;
    this.events.push({ id: this.events.length + 1, key: dedupeKey, payload, attempts: 0, status: "pending", error: null, retryAt: 0 });
    return true;
  }
  async claim(limit: number) {
    const pending = this.events.filter((e) => e.status === "pending" && e.retryAt <= Date.now()).slice(0, limit);
    for (const e of pending) {
      e.status = "processing";
      e.attempts++;
    }
    return pending.map(({ id, payload, attempts }) => ({ id, payload, attempts }));
  }
  async finish(id: number, error: string | null) {
    const e = this.events.find((x) => x.id === id);
    if (!e) return;
    e.error = error;
    e.status = error === null ? "done" : e.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
    e.retryAt = Date.now() + 60_000;
  }
}

let override: MetaEventQueue | null = null;
let defaultQueue: MetaEventQueue | null = null;

export function getMetaEventQueue(): MetaEventQueue {
  if (override) return override;
  defaultQueue ??= new MySqlMetaEventQueue();
  return defaultQueue;
}

// Solo para tests.
export function setMetaEventQueue(next: MetaEventQueue | null) {
  override = next;
}

export async function enqueueMetaWebhook(rawBody: string, payload: unknown, queue = getMetaEventQueue()) {
  const object = typeof (payload as { object?: unknown })?.object === "string" ? (payload as { object: string }).object : null;
  return queue.enqueue(dedupeKeyOf(rawBody), object, payload);
}

// Procesa lo pendiente. Un solo worker a la vez por proceso; devuelve cuántos terminó bien.
let running = false;
export async function processMetaWebhookQueue(
  opts: { queue?: MetaEventQueue; deps?: SocialWebhookDeps; limit?: number } = {}
) {
  if (running && !opts.queue) return 0;
  running = true;
  let done = 0;
  try {
    const queue = opts.queue ?? getMetaEventQueue();
    // Se repite mientras haya: una ráfaga de comentarios no espera al próximo tick.
    for (let round = 0; round < 20; round++) {
      const batch = await queue.claim(opts.limit ?? 20);
      if (batch.length === 0) break;
      for (const event of batch) {
        try {
          await processSocialWebhook(event.payload, opts.deps);
          await queue.finish(event.id, null);
          done++;
        } catch (err) {
          console.error(`${LOG} Evento ${event.id} falló (intento ${event.attempts}):`, (err as Error).message);
          await queue.finish(event.id, (err as Error).message);
        }
      }
    }
  } finally {
    running = false;
  }
  return done;
}
