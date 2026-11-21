// BillingRepo sobre MySQL (migración 0017). Server-only.

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import mysql from "mysql2/promise";
import { getPool } from "../db";
import { DuplicateOrderError, type BillingRepo } from "./repo";
import {
  DEFAULT_SETTINGS,
  type BillingEvent,
  type BillingSettings,
  type BillingSubscription,
  type NewPayment,
  type NewSubscription,
  type PaymentPatch,
  type PlanPrice,
  type SubscriptionPatch,
  type SubscriptionPayment,
} from "./types";

const json = (v: unknown) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v;
};
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const date = (v: unknown) => (v ? String(v).slice(0, 10) : null);

const SUB_COLUMNS = `id, client_id, plan_key, country, currency, amount, status, billing_anchor_day,
  current_period_start, current_period_end, next_charge_on, card_token_enc, card_brand, card_last4,
  failed_attempts, past_due_since, cancel_at_period_end, UNIX_TIMESTAMP(suspended_at) AS suspended_ts, UNIX_TIMESTAMP(cancelled_at) AS cancelled_ts, pending_plan_key, pending_amount, signup,
  signup_invite_enc, UNIX_TIMESTAMP(signup_invite_expires_at) AS invite_exp_ts, UNIX_TIMESTAMP(created_at) AS created_ts`;

function mapSub(r: RowDataPacket): BillingSubscription {
  return {
    id: Number(r.id),
    accountId: num(r.client_id),
    planKey: String(r.plan_key),
    country: String(r.country),
    currency: String(r.currency),
    amount: Number(r.amount),
    status: r.status,
    anchorDay: num(r.billing_anchor_day),
    periodStart: date(r.current_period_start),
    periodEnd: date(r.current_period_end),
    nextChargeOn: date(r.next_charge_on),
    cardTokenEnc: r.card_token_enc ?? null,
    cardBrand: r.card_brand ?? null,
    cardLast4: r.card_last4 ?? null,
    failedAttempts: Number(r.failed_attempts),
    pastDueSince: date(r.past_due_since),
    cancelAtPeriodEnd: Boolean(Number(r.cancel_at_period_end)),
    suspendedAt: num(r.suspended_ts),
    cancelledAt: num(r.cancelled_ts),
    pendingPlanKey: r.pending_plan_key ?? null,
    pendingAmount: num(r.pending_amount),
    signup: json(r.signup),
    signupInviteEnc: r.signup_invite_enc ?? null,
    signupInviteExpiresAt: num(r.invite_exp_ts),
    createdAt: Number(r.created_ts),
  };
}

const PAY_COLUMNS = `id, subscription_id, order_id, kind, public_ref, dlocal_payment_id, checkout_token_enc, plan_key,
  amount, currency, status, rejected_reason, card_brand, card_last4, period_start, period_end, raw_response, UNIX_TIMESTAMP(paid_at) AS paid_ts,
  invoice_ref, UNIX_TIMESTAMP(created_at) AS created_ts`;

function mapPay(r: RowDataPacket): SubscriptionPayment {
  return {
    id: Number(r.id),
    subscriptionId: Number(r.subscription_id),
    orderId: String(r.order_id),
    kind: r.kind,
    publicRef: String(r.public_ref),
    dlocalPaymentId: r.dlocal_payment_id ?? null,
    checkoutTokenEnc: r.checkout_token_enc ?? null,
    planKey: String(r.plan_key),
    amount: Number(r.amount),
    currency: String(r.currency),
    status: r.status,
    rejectedReason: r.rejected_reason ?? null,
    cardBrand: r.card_brand ?? null,
    cardLast4: r.card_last4 ?? null,
    periodStart: date(r.period_start),
    periodEnd: date(r.period_end),
    raw: json(r.raw_response),
    paidAt: num(r.paid_ts),
    invoiceRef: r.invoice_ref ?? null,
    createdAt: Number(r.created_ts),
  };
}

// Campo del modelo -> columna (y cómo se guarda)
const SUB_FIELDS: Record<string, [string, (v: unknown) => unknown]> = {
  accountId: ["client_id", (v) => v],
  planKey: ["plan_key", (v) => v],
  country: ["country", (v) => v],
  currency: ["currency", (v) => v],
  amount: ["amount", (v) => v],
  status: ["status", (v) => v],
  anchorDay: ["billing_anchor_day", (v) => v],
  periodStart: ["current_period_start", (v) => v],
  periodEnd: ["current_period_end", (v) => v],
  nextChargeOn: ["next_charge_on", (v) => v],
  cardTokenEnc: ["card_token_enc", (v) => v],
  cardBrand: ["card_brand", (v) => v],
  cardLast4: ["card_last4", (v) => v],
  failedAttempts: ["failed_attempts", (v) => v],
  pastDueSince: ["past_due_since", (v) => v],
  cancelAtPeriodEnd: ["cancel_at_period_end", (v) => (v ? 1 : 0)],
  suspendedAt: ["suspended_at", (v) => (v === null ? null : new Date(Number(v) * 1000))],
  cancelledAt: ["cancelled_at", (v) => (v === null ? null : new Date(Number(v) * 1000))],
  pendingPlanKey: ["pending_plan_key", (v) => v],
  pendingAmount: ["pending_amount", (v) => v],
  signup: ["signup", (v) => (v === null ? null : JSON.stringify(v))],
  signupInviteEnc: ["signup_invite_enc", (v) => v],
  signupInviteExpiresAt: ["signup_invite_expires_at", (v) => (v === null ? null : new Date(Number(v) * 1000))],
};

const PAY_FIELDS: Record<string, [string, (v: unknown) => unknown]> = {
  dlocalPaymentId: ["dlocal_payment_id", (v) => v],
  checkoutTokenEnc: ["checkout_token_enc", (v) => v],
  status: ["status", (v) => v],
  rejectedReason: ["rejected_reason", (v) => (typeof v === "string" ? v.slice(0, 191) : v)],
  cardBrand: ["card_brand", (v) => v],
  cardLast4: ["card_last4", (v) => v],
  periodStart: ["period_start", (v) => v],
  periodEnd: ["period_end", (v) => v],
  raw: ["raw_response", (v) => (v === null || v === undefined ? null : JSON.stringify(v))],
  paidAt: ["paid_at", (v) => (v === null ? null : new Date(Number(v) * 1000))],
  invoiceRef: ["invoice_ref", (v) => v],
};

function buildSet(patch: Record<string, unknown>, fields: Record<string, [string, (v: unknown) => unknown]>) {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const f = fields[key];
    if (!f || value === undefined) continue;
    sets.push(`${f[0]} = ?`);
    params.push(f[1](value));
  }
  return { sets, params };
}

const isDuplicate = (err: unknown) => (err as { code?: string })?.code === "ER_DUP_ENTRY";

class MySqlBillingRepo implements BillingRepo {
  async getPrice(planKey: string, country: string): Promise<PlanPrice | null> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT plan_key, country, currency, amount FROM web_plan_prices WHERE plan_key = ? AND country = ? AND is_active = 1`,
      [planKey, country]
    );
    const r = rows[0];
    return r ? { planKey: r.plan_key, country: r.country, currency: r.currency, amount: Number(r.amount) } : null;
  }

  async listPrices(): Promise<PlanPrice[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT plan_key, country, currency, amount FROM web_plan_prices WHERE is_active = 1 ORDER BY plan_key, country`
    );
    return rows.map((r) => ({ planKey: r.plan_key, country: r.country, currency: r.currency, amount: Number(r.amount) }));
  }

  async getSettings(): Promise<BillingSettings> {
    const [rows] = await getPool().query<RowDataPacket[]>(`SELECT * FROM web_billing_settings WHERE id = 1`);
    const r = rows[0];
    if (!r) return { ...DEFAULT_SETTINGS };
    const retry = json(r.retry_days);
    return {
      retryDays: Array.isArray(retry) ? retry.map(Number).filter((n) => n > 0).sort((a, b) => a - b) : DEFAULT_SETTINGS.retryDays,
      graceDays: Number(r.grace_days),
      trialDays: Number(r.trial_days),
      priceChangeNoticeDays: Number(r.price_change_notice_days),
      superadminWhatsapp: String(r.superadmin_whatsapp ?? "")
        .split(",")
        .map((s) => s.replace(/\D/g, ""))
        .filter(Boolean),
      failedPaymentTemplate: r.failed_payment_template || null,
    };
  }

  async createSubscription(input: NewSubscription) {
    const [res] = await getPool().query<ResultSetHeader>(
      `INSERT INTO web_billing_subscriptions (client_id, plan_key, country, currency, amount, signup) VALUES (?, ?, ?, ?, ?, ?)`,
      [input.accountId, input.planKey, input.country, input.currency, input.amount, input.signup ? JSON.stringify(input.signup) : null]
    );
    return res.insertId;
  }

  async getSubscription(id: number) {
    const [rows] = await getPool().query<RowDataPacket[]>(`SELECT ${SUB_COLUMNS} FROM web_billing_subscriptions WHERE id = ?`, [id]);
    return rows[0] ? mapSub(rows[0]) : null;
  }

  async getCurrentForAccount(accountId: number) {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${SUB_COLUMNS} FROM web_billing_subscriptions
       WHERE client_id = ? AND status IN ('active', 'past_due', 'suspended', 'cancelled')
       ORDER BY (status <> 'cancelled') DESC, id DESC LIMIT 1`,
      [accountId]
    );
    return rows[0] ? mapSub(rows[0]) : null;
  }

  async updateSubscription(id: number, patch: SubscriptionPatch) {
    const { sets, params } = buildSet(patch as Record<string, unknown>, SUB_FIELDS);
    if (!sets.length) return;
    await getPool().query(`UPDATE web_billing_subscriptions SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
  }

  async listDue(today: string) {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${SUB_COLUMNS} FROM web_billing_subscriptions
       WHERE status IN ('active', 'past_due', 'suspended') AND next_charge_on IS NOT NULL AND next_charge_on <= ?
       ORDER BY id`,
      [today]
    );
    return rows.map(mapSub);
  }

  async listAll() {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${SUB_COLUMNS} FROM web_billing_subscriptions WHERE status <> 'incomplete' ORDER BY id DESC`
    );
    return rows.map(mapSub);
  }

  async listByStatus(statuses: BillingSubscription["status"][]) {
    if (!statuses.length) return [];
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${SUB_COLUMNS} FROM web_billing_subscriptions WHERE status IN (?) ORDER BY id`,
      [statuses]
    );
    return rows.map(mapSub);
  }

  async createPayment(input: NewPayment) {
    try {
      const [res] = await getPool().query<ResultSetHeader>(
        `INSERT INTO web_subscription_payments
           (subscription_id, order_id, kind, public_ref, plan_key, amount, currency, period_start, period_end)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [input.subscriptionId, input.orderId, input.kind, input.publicRef, input.planKey, input.amount, input.currency, input.periodStart, input.periodEnd]
      );
      return (await this.getPayment(res.insertId))!;
    } catch (err) {
      if (isDuplicate(err)) throw new DuplicateOrderError(input.orderId);
      throw err;
    }
  }

  private async onePayment(where: string, value: unknown) {
    const [rows] = await getPool().query<RowDataPacket[]>(`SELECT ${PAY_COLUMNS} FROM web_subscription_payments WHERE ${where} = ?`, [value]);
    return rows[0] ? mapPay(rows[0]) : null;
  }
  getPayment(id: number) {
    return this.onePayment("id", id);
  }
  getPaymentByRef(ref: string) {
    return this.onePayment("public_ref", ref);
  }
  getPaymentByDlocalId(id: string) {
    return this.onePayment("dlocal_payment_id", id);
  }
  getPaymentByOrderId(orderId: string) {
    return this.onePayment("order_id", orderId);
  }

  async updatePayment(id: number, patch: PaymentPatch) {
    const { sets, params } = buildSet(patch as Record<string, unknown>, PAY_FIELDS);
    if (!sets.length) return;
    await getPool().query(`UPDATE web_subscription_payments SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
  }

  async listPayments(ids: number[]) {
    if (!ids.length) return [];
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${PAY_COLUMNS} FROM web_subscription_payments WHERE subscription_id IN (?) ORDER BY id DESC`,
      [ids]
    );
    return rows.map(mapPay);
  }

  async listPaymentsForAccount(accountId: number) {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${PAY_COLUMNS} FROM web_subscription_payments
       WHERE subscription_id IN (SELECT id FROM web_billing_subscriptions WHERE client_id = ?)
       ORDER BY id DESC`,
      [accountId]
    );
    return rows.map(mapPay);
  }

  async listRecentPayments(statuses: SubscriptionPayment["status"][], limit: number) {
    if (!statuses.length) return [];
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${PAY_COLUMNS} FROM web_subscription_payments WHERE status IN (?) ORDER BY id DESC LIMIT ?`,
      [statuses, limit]
    );
    return rows.map(mapPay);
  }

  async addEvent(event: BillingEvent) {
    const [res] = await getPool().query<ResultSetHeader>(
      `INSERT IGNORE INTO web_billing_events (type, subscription_id, payment_id, payload) VALUES (?, ?, ?, ?)`,
      [event.type, event.subscriptionId, event.paymentId, JSON.stringify(event.payload)]
    );
    return res.affectedRows === 1;
  }

  async hasEvent(type: BillingEvent["type"], paymentId: number) {
    const [rows] = await getPool().query<RowDataPacket[]>(`SELECT 1 FROM web_billing_events WHERE type = ? AND payment_id = ? LIMIT 1`, [type, paymentId]);
    return rows.length > 0;
  }

  // Los locks usan un pool aparte: si retuvieran conexiones del pool principal (5),
  // locks anidados (ciclo -> suscripción -> pago) + notificaciones podrían agotarlo
  // y dejar las consultas de adentro esperando para siempre.
  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const conn = await getLockPool().getConnection();
    const name = `digibot_billing:${key}`.slice(0, 64);
    try {
      const [rows] = await conn.query<RowDataPacket[]>(`SELECT GET_LOCK(?, 15) AS ok`, [name]);
      if (Number(rows[0]?.ok) !== 1) throw new Error(`No se pudo tomar el lock ${name}.`);
      try {
        return await fn();
      } finally {
        await conn.query(`SELECT RELEASE_LOCK(?)`, [name]).catch(() => undefined);
      }
    } finally {
      conn.release();
    }
  }
}

let lockPool: mysql.Pool | null = null;
function getLockPool() {
  lockPool ??= mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
  });
  return lockPool;
}

let repo: BillingRepo | null = null;
export function getMySqlBillingRepo(): BillingRepo {
  repo ??= new MySqlBillingRepo();
  return repo;
}
