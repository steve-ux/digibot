// Panel de cobros del superadmin: todas las suscripciones, pagos fallidos y MRR.
// MRR = suma mensual de las suscripciones activas y en mora, por moneda (sin convertir:
// la conversión a dólares la hace dLocal Go al liquidar).

import { rejectionMessage } from "./errors";
import type { BillingRepo } from "./repo";
import type { BillingStatus, PaymentStatus } from "./types";

export interface AdminSubscriptionRow {
  id: number;
  accountId: number | null;
  accountName: string;
  planKey: string;
  status: BillingStatus;
  amount: number;
  currency: string;
  country: string;
  nextChargeOn: string | null;
  periodEnd: string | null;
  failedAttempts: number;
  pastDueSince: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlanKey: string | null;
  card: string | null;
}

export interface AdminFailedPayment {
  id: number;
  subscriptionId: number;
  accountId: number | null;
  accountName: string;
  orderId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  reason: string;
  createdAt: number;
}

export interface AdminBillingOverview {
  mrr: { currency: string; amount: number; subscriptions: number }[];
  counts: Record<BillingStatus, number>;
  subscriptions: AdminSubscriptionRow[];
  failedPayments: AdminFailedPayment[];
}

export async function buildAdminOverview(repo: BillingRepo, accountNames: Map<number, string>): Promise<AdminBillingOverview> {
  const subs = await repo.listAll();
  const name = (id: number | null, fallback = "Cliente nuevo") => (id === null ? fallback : accountNames.get(id) ?? `Cuenta #${id}`);
  const counts: Record<BillingStatus, number> = { incomplete: 0, active: 0, past_due: 0, suspended: 0, cancelled: 0 };
  const mrr = new Map<string, { amount: number; subscriptions: number }>();
  for (const s of subs) {
    counts[s.status]++;
    if (s.status === "active" || s.status === "past_due") {
      const m = mrr.get(s.currency) ?? { amount: 0, subscriptions: 0 };
      m.amount += s.amount;
      m.subscriptions++;
      mrr.set(s.currency, m);
    }
  }
  const subName = new Map(subs.map((s) => [s.id, { accountId: s.accountId, name: name(s.accountId, s.signup?.businessName ?? "Cliente nuevo") }]));
  const failed = await repo.listRecentPayments(["rejected", "unknown"], 50);

  return {
    mrr: [...mrr.entries()].map(([currency, m]) => ({ currency, amount: Math.round(m.amount * 100) / 100, subscriptions: m.subscriptions })).sort((a, b) => a.currency.localeCompare(b.currency)),
    counts,
    subscriptions: subs.map((s) => ({
      id: s.id,
      accountId: s.accountId,
      accountName: name(s.accountId, s.signup?.businessName ?? "Cliente nuevo"),
      planKey: s.planKey,
      status: s.status,
      amount: s.amount,
      currency: s.currency,
      country: s.country,
      nextChargeOn: s.nextChargeOn,
      periodEnd: s.periodEnd,
      failedAttempts: s.failedAttempts,
      pastDueSince: s.pastDueSince,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      pendingPlanKey: s.pendingPlanKey,
      card: s.cardLast4 ? `${s.cardBrand ?? "Tarjeta"} •••• ${s.cardLast4}` : null,
    })),
    // Solo de suscripciones que llegaron a activarse (un alta rechazada no es "pago fallido" de un cliente).
    failedPayments: failed
      .filter((p) => p.kind === "renewal" || p.kind === "upgrade" || p.status === "unknown")
      .map((p) => ({
        id: p.id,
        subscriptionId: p.subscriptionId,
        accountId: subName.get(p.subscriptionId)?.accountId ?? null,
        accountName: subName.get(p.subscriptionId)?.name ?? `Suscripción #${p.subscriptionId}`,
        orderId: p.orderId,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        reason: p.status === "unknown" ? "Sin respuesta de dLocal Go: se reconcilia con la notificación." : rejectionMessage(p.rejectedReason),
        createdAt: p.createdAt,
      })),
  };
}
