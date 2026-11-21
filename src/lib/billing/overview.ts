// Resumen de facturación de UNA cuenta para Configuración → Suscripción.
// Todo sale filtrado por accountId: una cuenta nunca ve pagos de otra.

import { addDays, isBillingCountry } from "./config";
import { featuresLost } from "./entitlements";
import { rejectionMessage } from "./errors";
import { dueDate, prorate } from "./engine";
import type { BillingRepo } from "./repo";
import type { BillingStatus, SubscriptionPayment } from "./types";

export interface PlanCard {
  planKey: string;
  name: string;
  tagline: string;
  features: string[];
}

export type PlanChange =
  | { kind: "current" }
  | { kind: "upgrade"; chargeToday: number }
  | { kind: "downgrade"; lost: string[]; effectiveOn: string | null }
  | { kind: "pending_downgrade"; effectiveOn: string | null }
  | { kind: "unavailable" };

export interface PlanOptionView extends PlanCard {
  amount: number | null;
  currency: string | null;
  change: PlanChange;
}

export type PaymentRowStatus = "paid" | "rejected" | "pending" | "review";

export interface PaymentRow {
  id: number;
  date: number; // unix
  concept: string;
  amount: number;
  currency: string;
  status: PaymentRowStatus;
  detail: string | null;
  cardLast4: string | null;
  invoiceRef: string | null;
}

export interface SubscriptionSummary {
  id: number;
  planKey: string;
  planName: string;
  status: BillingStatus;
  amount: number;
  currency: string;
  country: string;
  periodStart: string | null;
  periodEnd: string | null;
  nextChargeOn: string | null;
  cancelAtPeriodEnd: boolean;
  card: { brand: string; last4: string } | null;
  pendingPlan: { planKey: string; name: string; amount: number } | null;
  failedAttempts: number;
  suspendOn: string | null;
  // Lo que se cobra al "pagar con otra tarjeta" (la deuda, o el próximo mes si está al día)
  payWithNewCard: { amount: number; covers: string | null };
}

export interface BillingOverview {
  subscription: SubscriptionSummary | null;
  plans: PlanOptionView[];
  payments: PaymentRow[];
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const monthName = (d: string | null) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "");

function concept(p: SubscriptionPayment, planName: (k: string) => string) {
  switch (p.kind) {
    case "initial":
      return `Alta del plan ${planName(p.planKey)}`;
    case "renewal":
      return `Plan ${planName(p.planKey)} · ${monthName(p.periodStart)}`;
    case "upgrade":
      return `Mejora a ${planName(p.planKey)} (proporcional)`;
    case "card_update":
      return `Plan ${planName(p.planKey)} · ${monthName(p.periodStart)} (otra tarjeta)`;
  }
}

// Qué pagos se muestran: los cobrados, rechazados y en revisión. Los checkouts que el
// cliente abrió y no terminó (alta o cambio de tarjeta sin confirmar) no son pagos.
function rowStatus(p: SubscriptionPayment): PaymentRowStatus | null {
  if (p.status === "paid") return "paid";
  if (p.status === "unknown") return "review";
  if (p.status === "rejected" || p.status === "expired") return p.kind === "initial" || p.kind === "card_update" ? null : "rejected";
  if (p.status === "pending" && p.kind === "renewal") return "pending";
  return null;
}

export async function buildOverview(repo: BillingRepo, accountId: number, plans: PlanCard[], today: string): Promise<BillingOverview> {
  const sub = await repo.getCurrentForAccount(accountId);
  const planName = (k: string) => plans.find((p) => p.planKey === k)?.name ?? k;

  const payments: PaymentRow[] = [];
  for (const p of await repo.listPaymentsForAccount(accountId)) {
    const status = rowStatus(p);
    if (!status) continue;
    payments.push({
      id: p.id,
      date: p.paidAt ?? p.createdAt,
      concept: concept(p, planName),
      amount: p.amount,
      currency: p.currency,
      status,
      detail: status === "rejected" ? rejectionMessage(p.rejectedReason) : null,
      cardLast4: p.cardLast4,
      invoiceRef: p.invoiceRef,
    });
  }
  payments.sort((a, b) => b.date - a.date || b.id - a.id);

  if (!sub) {
    return { subscription: null, plans: plans.map((p) => ({ ...p, amount: null, currency: null, change: { kind: "unavailable" } })), payments };
  }

  const settings = await repo.getSettings();
  const options: PlanOptionView[] = [];
  const current = plans.find((p) => p.planKey === sub.planKey);
  for (const p of plans) {
    const price = isBillingCountry(sub.country) ? await repo.getPrice(p.planKey, sub.country) : null;
    let change: PlanChange;
    if (p.planKey === sub.planKey) change = { kind: "current" };
    else if (!price || price.currency !== sub.currency) change = { kind: "unavailable" };
    else if (p.planKey === sub.pendingPlanKey) change = { kind: "pending_downgrade", effectiveOn: sub.nextChargeOn };
    else if (price.amount > sub.amount) change = { kind: "upgrade", chargeToday: prorate(sub, price.amount, today) };
    else change = { kind: "downgrade", lost: featuresLost(current?.features ?? [], p.features), effectiveOn: sub.nextChargeOn };
    options.push({ ...p, amount: price?.amount ?? null, currency: price?.currency ?? null, change });
  }

  const due = dueDate(sub);
  const nextAmount = sub.pendingPlanKey ? sub.pendingAmount ?? sub.amount : sub.amount;
  return {
    subscription: {
      id: sub.id,
      planKey: sub.planKey,
      planName: planName(sub.planKey),
      status: sub.status,
      amount: sub.amount,
      currency: sub.currency,
      country: sub.country,
      periodStart: sub.periodStart,
      periodEnd: sub.periodEnd,
      nextChargeOn: sub.nextChargeOn,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      card: sub.cardLast4 ? { brand: sub.cardBrand ?? "Tarjeta", last4: sub.cardLast4 } : null,
      pendingPlan: sub.pendingPlanKey ? { planKey: sub.pendingPlanKey, name: planName(sub.pendingPlanKey), amount: sub.pendingAmount ?? sub.amount } : null,
      failedAttempts: sub.failedAttempts,
      suspendOn: sub.status === "past_due" && sub.pastDueSince ? addDays(sub.pastDueSince, settings.graceDays) : null,
      payWithNewCard: { amount: nextAmount, covers: due },
    },
    plans: options,
    payments,
  };
}
