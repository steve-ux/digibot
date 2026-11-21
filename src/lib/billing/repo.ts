// Acceso a datos del cobro. MemoryBillingRepo es para tests; la versión MySQL
// está en repo-mysql.ts (server-only).

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

export class DuplicateOrderError extends Error {
  constructor(orderId: string) {
    super(`El cobro ${orderId} ya existe.`);
  }
}

export interface BillingRepo {
  getPrice(planKey: string, country: string): Promise<PlanPrice | null>;
  listPrices(): Promise<PlanPrice[]>;
  getSettings(): Promise<BillingSettings>;

  createSubscription(input: NewSubscription): Promise<number>;
  getSubscription(id: number): Promise<BillingSubscription | null>;
  // La suscripción "viva" de la cuenta (active, past_due o suspended), o la última cancelada.
  getCurrentForAccount(accountId: number): Promise<BillingSubscription | null>;
  updateSubscription(id: number, patch: SubscriptionPatch): Promise<void>;
  listDue(today: string): Promise<BillingSubscription[]>;
  listAll(): Promise<BillingSubscription[]>;
  listByStatus(statuses: BillingSubscription["status"][]): Promise<BillingSubscription[]>;

  // Lanza DuplicateOrderError si el order_id ya existe: así un cobro nunca se manda dos veces.
  createPayment(input: NewPayment): Promise<SubscriptionPayment>;
  getPayment(id: number): Promise<SubscriptionPayment | null>;
  getPaymentByRef(publicRef: string): Promise<SubscriptionPayment | null>;
  getPaymentByDlocalId(dlocalPaymentId: string): Promise<SubscriptionPayment | null>;
  getPaymentByOrderId(orderId: string): Promise<SubscriptionPayment | null>;
  updatePayment(id: number, patch: PaymentPatch): Promise<void>;
  listPayments(subscriptionIds: number[]): Promise<SubscriptionPayment[]>;
  listPaymentsForAccount(accountId: number): Promise<SubscriptionPayment[]>;
  // Últimos pagos de todas las cuentas con esos estados (panel del superadmin).
  listRecentPayments(statuses: SubscriptionPayment["status"][], limit: number): Promise<SubscriptionPayment[]>;

  // Inserta el evento una sola vez por (type, paymentId). Devuelve false si ya existía.
  addEvent(event: BillingEvent): Promise<boolean>;
  hasEvent(type: BillingEvent["type"], paymentId: number): Promise<boolean>;

  // Exclusión mutua entre procesos (GET_LOCK en MySQL) para procesar un pago o correr el job.
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

const now = () => Math.floor(Date.now() / 1000);
const clone = <T>(v: T): T => structuredClone(v);

export class MemoryBillingRepo implements BillingRepo {
  prices: PlanPrice[] = [];
  settings: BillingSettings = clone(DEFAULT_SETTINGS);
  subscriptions: BillingSubscription[] = [];
  payments: SubscriptionPayment[] = [];
  events: BillingEvent[] = [];
  private locks = new Map<string, Promise<unknown>>();

  async getPrice(planKey: string, country: string) {
    const p = this.prices.find((x) => x.planKey === planKey && x.country === country);
    return p ? { ...p } : null;
  }
  async listPrices() {
    return clone(this.prices);
  }
  async getSettings() {
    return clone(this.settings);
  }

  async createSubscription(input: NewSubscription) {
    const id = this.subscriptions.length + 1;
    this.subscriptions.push({
      ...clone(input),
      id,
      status: "incomplete",
      anchorDay: null,
      periodStart: null,
      periodEnd: null,
      nextChargeOn: null,
      cardTokenEnc: null,
      cardBrand: null,
      cardLast4: null,
      failedAttempts: 0,
      pastDueSince: null,
      cancelAtPeriodEnd: false,
      suspendedAt: null,
      cancelledAt: null,
      pendingPlanKey: null,
      pendingAmount: null,
      signupInviteEnc: null,
      signupInviteExpiresAt: null,
      createdAt: now(),
    });
    return id;
  }
  async getSubscription(id: number) {
    const s = this.subscriptions.find((x) => x.id === id);
    return s ? clone(s) : null;
  }
  async getCurrentForAccount(accountId: number) {
    const mine = this.subscriptions.filter((s) => s.accountId === accountId);
    const live = mine.filter((s) => s.status === "active" || s.status === "past_due" || s.status === "suspended");
    const pick = live.at(-1) ?? mine.filter((s) => s.status === "cancelled").at(-1) ?? null;
    return pick ? clone(pick) : null;
  }
  async updateSubscription(id: number, patch: SubscriptionPatch) {
    const s = this.subscriptions.find((x) => x.id === id);
    if (s) Object.assign(s, clone(patch));
  }
  async listDue(today: string) {
    return clone(
      this.subscriptions.filter(
        (s) => (s.status === "active" || s.status === "past_due" || s.status === "suspended") && s.nextChargeOn !== null && s.nextChargeOn <= today
      )
    );
  }
  async listAll() {
    return clone(this.subscriptions);
  }
  async listByStatus(statuses: BillingSubscription["status"][]) {
    return clone(this.subscriptions.filter((s) => statuses.includes(s.status)));
  }

  async createPayment(input: NewPayment) {
    if (this.payments.some((p) => p.orderId === input.orderId)) throw new DuplicateOrderError(input.orderId);
    const payment: SubscriptionPayment = {
      ...clone(input),
      id: this.payments.length + 1,
      dlocalPaymentId: null,
      checkoutTokenEnc: null,
      status: "created",
      rejectedReason: null,
      cardBrand: null,
      cardLast4: null,
      raw: null,
      paidAt: null,
      invoiceRef: null,
      createdAt: now(),
    };
    this.payments.push(payment);
    return clone(payment);
  }
  async getPayment(id: number) {
    const p = this.payments.find((x) => x.id === id);
    return p ? clone(p) : null;
  }
  async getPaymentByRef(ref: string) {
    const p = this.payments.find((x) => x.publicRef === ref);
    return p ? clone(p) : null;
  }
  async getPaymentByDlocalId(id: string) {
    const p = this.payments.find((x) => x.dlocalPaymentId === id);
    return p ? clone(p) : null;
  }
  async getPaymentByOrderId(orderId: string) {
    const p = this.payments.find((x) => x.orderId === orderId);
    return p ? clone(p) : null;
  }
  async updatePayment(id: number, patch: PaymentPatch) {
    const p = this.payments.find((x) => x.id === id);
    if (p) Object.assign(p, clone(patch));
  }
  async listPayments(ids: number[]) {
    return clone(this.payments.filter((p) => ids.includes(p.subscriptionId)).sort((a, b) => b.id - a.id));
  }
  async listPaymentsForAccount(accountId: number) {
    const ids = this.subscriptions.filter((s) => s.accountId === accountId).map((s) => s.id);
    return this.listPayments(ids);
  }

  async listRecentPayments(statuses: SubscriptionPayment["status"][], limit: number) {
    return clone(this.payments.filter((p) => statuses.includes(p.status)).sort((a, b) => b.id - a.id).slice(0, limit));
  }

  async addEvent(event: BillingEvent) {
    if (this.events.some((e) => e.type === event.type && e.paymentId === event.paymentId)) return false;
    this.events.push(clone(event));
    return true;
  }

  async hasEvent(type: BillingEvent["type"], paymentId: number) {
    return this.events.some((e) => e.type === type && e.paymentId === paymentId);
  }

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.locks.set(key, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(key) === run) this.locks.delete(key);
    }
  }
}
