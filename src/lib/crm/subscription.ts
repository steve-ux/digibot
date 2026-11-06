// Suscripción de una cuenta (web_subscriptions, migración 0012). Server-only.
// Si la tabla no existe o la cuenta no tiene fila, la pantalla muestra "Sin plan".

import type { RowDataPacket } from "mysql2";
import { getPool, isDbConfigured } from "../db";

export type SubscriptionStatus = "trial" | "active" | "past_due" | "canceled";

export interface Subscription {
  planKey: string;
  status: SubscriptionStatus;
  // unix (segundos)
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  paymentMethod: { brand: string; last4: string } | null;
  provider: string;
}

export async function getSubscription(accountId: number): Promise<Subscription | null> {
  if (!isDbConfigured()) return null;
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT plan_key, status, UNIX_TIMESTAMP(current_period_end) AS period_end_ts, cancel_at_period_end,
              payment_brand, payment_last4, provider
       FROM web_subscriptions WHERE client_id = ? LIMIT 1`,
      [accountId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      planKey: String(row.plan_key),
      status: row.status as SubscriptionStatus,
      currentPeriodEnd: row.period_end_ts === null ? null : Number(row.period_end_ts),
      cancelAtPeriodEnd: Boolean(Number(row.cancel_at_period_end)),
      paymentMethod: row.payment_last4 ? { brand: String(row.payment_brand || "Tarjeta"), last4: String(row.payment_last4) } : null,
      provider: String(row.provider),
    };
  } catch (err) {
    console.error("[crm] No se pudo leer la suscripción (¿falta la migración 0012?):", (err as Error).message);
    return null;
  }
}
