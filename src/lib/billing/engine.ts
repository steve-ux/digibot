// Motor de cobro: ciclo diario (renovaciones, reintentos, suspensión, fin de las
// canceladas), pago con otra tarjeta, cambio de plan y cancelación.
//
// Idempotencia:
//   - Todo lo de una suscripción corre bajo el lock "sub:{id}".
//   - Cada intento tiene un order_id determinístico (SUB-{id}-{AAAAMM}-{intento}) y
//     UNIQUE en la base: si ya existe, no se crea otro cobro. Si quedó a medias
//     (se cortó la respuesta), se reenvía el MISMO order_id: dLocal Go rechaza el
//     duplicado (904) en vez de cobrar dos veces.

import { randomBytes } from "crypto";
import { decryptSecret, encryptSecret } from "../crypto";
import { BILLING_COUNTRIES, addDays, addMonthsAnchored, daysBetween, isBillingCountry, todayIn, yyyymm } from "./config";
import { DlocalApiError, DlocalNetworkError, type DlocalPayment } from "./dlocalgo";
import { apiErrorMessage, BillingError, rejectionMessage } from "./errors";
import { DuplicateOrderError } from "./repo";
import { applyDlocalPayment, type BillingDeps, type CheckoutStart } from "./service";
import type { BillingSubscription, SubscriptionPayment } from "./types";

const newRef = () => randomBytes(16).toString("hex");
const todayOf = (deps: BillingDeps) => (deps.today ? deps.today() : todayIn());
const LIVE = new Set(["active", "past_due", "suspended"]);

async function safeHook(label: string, fn: () => Promise<void> | undefined) {
  try {
    await fn();
  } catch (err) {
    console.error(`[billing] ${label}:`, (err as Error).message);
  }
}

async function changed(deps: BillingDeps, id: number) {
  const sub = (await deps.repo.getSubscription(id))!;
  await safeHook("suscripción", () => deps.hooks?.subscriptionChanged?.(sub));
  return sub;
}

// Fecha del período impago más viejo: el vencimiento original si está en mora, o el fin del período actual.
export function dueDate(sub: BillingSubscription) {
  return sub.pastDueSince ?? sub.periodEnd ?? sub.nextChargeOn;
}

// ---------- Handlers de pagos aprobados / fallidos (los llama applyDlocalPayment) ----------

// Renovación o pago con otra tarjeta: cubre el próximo período impago.
export async function applyPeriodPayment(deps: BillingDeps, sub: BillingSubscription, payment: SubscriptionPayment): Promise<BillingSubscription> {
  if (payment.periodEnd) return sub; // ya aplicado: un mismo pago nunca adelanta dos períodos
  const start = dueDate(sub) ?? todayOf(deps);
  const anchor = sub.anchorDay ?? Number(start.slice(8, 10));
  const end = addMonthsAnchored(start, 1, anchor);
  const wasBlocked = sub.status === "suspended" || sub.status === "past_due";
  const isCard = payment.kind === "card_update";
  await deps.repo.updateSubscription(sub.id, {
    status: "active",
    periodStart: start,
    periodEnd: end,
    nextChargeOn: end,
    failedAttempts: 0,
    pastDueSince: null,
    suspendedAt: null,
    // El cobro ya se hizo con el plan que corresponde (si había una baja pendiente, la aplica).
    planKey: payment.planKey,
    amount: payment.amount,
    ...(sub.pendingPlanKey && payment.planKey === sub.pendingPlanKey ? { pendingPlanKey: null, pendingAmount: null } : {}),
    ...(isCard ? { cardTokenEnc: payment.checkoutTokenEnc, cardBrand: payment.cardBrand, cardLast4: payment.cardLast4 } : {}),
    ...(!isCard && payment.cardLast4 ? { cardLast4: payment.cardLast4 } : {}),
  });
  await deps.repo.updatePayment(payment.id, { periodStart: start, periodEnd: end });
  if (sub.accountId !== null && wasBlocked) {
    await deps.setAccountAccess(sub.accountId, true, null);
  }
  const updated = await changed(deps, sub.id);
  if (wasBlocked) await safeHook("reactivación", () => deps.hooks?.subscriptionReactivated?.(updated));
  return updated;
}

// Mejora de plan: se cobró la diferencia; el plan nuevo rige desde ya.
export async function applyUpgrade(deps: BillingDeps, sub: BillingSubscription, payment: SubscriptionPayment): Promise<BillingSubscription> {
  const price = isBillingCountry(sub.country) ? await deps.repo.getPrice(payment.planKey, sub.country) : null;
  await deps.repo.updateSubscription(sub.id, {
    planKey: payment.planKey,
    amount: price?.amount ?? sub.amount,
    pendingPlanKey: null,
    pendingAmount: null,
  });
  return changed(deps, sub.id);
}

// Falló un cobro de renovación: mora, próximo reintento y avisos.
export async function applyRenewalFailure(deps: BillingDeps, payment: SubscriptionPayment) {
  const sub = await deps.repo.getSubscription(payment.subscriptionId);
  if (!sub || !LIVE.has(sub.status)) return;
  const settings = await deps.repo.getSettings();
  const failedAttempts = sub.failedAttempts + 1;
  const since = sub.pastDueSince ?? payment.periodStart ?? todayOf(deps);
  const retryOffset = settings.retryDays[failedAttempts - 1];
  let nextRetry: string | null = null;
  if (retryOffset !== undefined) {
    nextRetry = addDays(since, retryOffset);
    if (nextRetry <= todayOf(deps)) nextRetry = addDays(todayOf(deps), 1);
  }
  await deps.repo.updateSubscription(sub.id, {
    status: sub.status === "suspended" ? "suspended" : "past_due",
    failedAttempts,
    pastDueSince: since,
    nextChargeOn: sub.status === "suspended" ? null : nextRetry,
  });
  const updated = await changed(deps, sub.id);
  const raw = (payment.raw ?? {}) as { redirect_url?: string };
  await safeHook("aviso de pago fallido", () =>
    deps.hooks?.paymentFailed?.(updated, payment, {
      reason: rejectionMessage(payment.rejectedReason),
      nextRetryOn: updated.status === "past_due" ? nextRetry : null,
      suspendOn: addDays(since, settings.graceDays),
      redirectUrl: typeof raw.redirect_url === "string" ? raw.redirect_url : null,
    })
  );
}

// ---------- Ciclo diario ----------

export interface CycleReport {
  charged: number;
  failed: number;
  suspended: number;
  ended: number;
  skipped: number;
}

export async function runBillingCycle(deps: BillingDeps): Promise<CycleReport> {
  const today = todayOf(deps);
  const report: CycleReport = { charged: 0, failed: 0, suspended: 0, ended: 0, skipped: 0 };
  const settings = await deps.repo.getSettings();

  for (const due of await deps.repo.listDue(today)) {
    await deps.repo.withLock(`sub:${due.id}`, async () => {
      const sub = await deps.repo.getSubscription(due.id);
      if (!sub || !LIVE.has(sub.status) || !sub.nextChargeOn || sub.nextChargeOn > today) return;

      // Pidió cancelar y llegó el fin del período: no se cobra, termina.
      if (sub.cancelAtPeriodEnd && sub.status === "active") {
        await endSubscription(deps, sub, "subscription_ended");
        report.ended++;
        return;
      }
      if (sub.status === "suspended") return; // suspendida: solo paga desde el panel
      const result = await chargeRenewal(deps, sub);
      report[result]++;
    });
  }

  // Suspensión: en mora y pasaron los días de gracia desde el vencimiento.
  for (const pd of await deps.repo.listByStatus(["past_due"])) {
    await deps.repo.withLock(`sub:${pd.id}`, async () => {
      const sub = await deps.repo.getSubscription(pd.id);
      if (!sub || sub.status !== "past_due" || !sub.pastDueSince) return;
      if (daysBetween(sub.pastDueSince, today) < settings.graceDays) return;
      await deps.repo.updateSubscription(sub.id, { status: "suspended", suspendedAt: Math.floor(Date.now() / 1000), nextChargeOn: null });
      if (sub.accountId !== null) await deps.setAccountAccess(sub.accountId, false, "billing_suspended");
      const updated = await changed(deps, sub.id);
      await safeHook("aviso de suspensión", () => deps.hooks?.subscriptionSuspended?.(updated));
      report.suspended++;
    });
  }
  return report;
}

async function endSubscription(deps: BillingDeps, sub: BillingSubscription, reason: string) {
  await deps.repo.updateSubscription(sub.id, {
    status: "cancelled",
    cancelledAt: Math.floor(Date.now() / 1000),
    nextChargeOn: null,
  });
  if (sub.accountId !== null) await deps.setAccountAccess(sub.accountId, false, reason);
  const updated = await changed(deps, sub.id);
  await safeHook("fin de suscripción", () => deps.hooks?.subscriptionEnded?.(updated));
}

type ChargeResult = "charged" | "failed" | "skipped";

async function chargeRenewal(deps: BillingDeps, sub: BillingSubscription): Promise<ChargeResult> {
  if (!sub.cardTokenEnc) return "skipped";
  const due = dueDate(sub)!;
  const attempt = sub.failedAttempts + 1;
  const orderId = `SUB-${sub.id}-${yyyymm(due)}-${attempt}`;

  // Un "pagar con otra tarjeta" en curso para este período: no se cobra en paralelo con la tarjeta vieja.
  const recent = await deps.repo.listPayments([sub.id]);
  if (recent.some((p) => p.kind === "card_update" && p.status === "pending" && p.createdAt > Date.now() / 1000 - 3600)) return "skipped";

  // Si hay baja de plan pendiente, este cobro ya es con el plan y el monto nuevos.
  const planKey = sub.pendingPlanKey ?? sub.planKey;
  const amount = sub.pendingPlanKey ? sub.pendingAmount ?? sub.amount : sub.amount;

  let payment: SubscriptionPayment;
  try {
    payment = await deps.repo.createPayment({
      subscriptionId: sub.id,
      orderId,
      kind: "renewal",
      publicRef: newRef(),
      planKey,
      amount,
      currency: sub.currency,
      periodStart: due,
      periodEnd: null,
    });
  } catch (err) {
    if (!(err instanceof DuplicateOrderError)) throw err;
    // Ese intento ya existe: nunca se crea otro cobro. Se reconcilia el que hay.
    const existing = (await deps.repo.getPaymentByOrderId(orderId))!;
    if (existing.status === "created" || existing.status === "unknown") return sendRecurring(deps, sub, existing);
    // Pendiente, o aprobado pero sin aplicar (se cortó el proceso): se consulta dLocal y se
    // termina de aplicar. applyDlocalPayment es idempotente (evento PaymentApproved + periodEnd).
    if ((existing.status === "pending" || existing.status === "paid") && existing.dlocalPaymentId) {
      const wasPaid = existing.status === "paid";
      const synced = await applyDlocalPayment(deps, existing.id, await deps.dlocal.getPayment(existing.dlocalPaymentId));
      return synced?.status === "paid" && !wasPaid ? "charged" : "skipped";
    }
    return "skipped";
  }
  return sendRecurring(deps, sub, payment);
}

async function sendRecurring(deps: BillingDeps, sub: BillingSubscription, payment: SubscriptionPayment): Promise<ChargeResult> {
  let remote: DlocalPayment;
  try {
    remote = await deps.dlocal.chargeRecurring(decryptSecret(sub.cardTokenEnc!), {
      amount: payment.amount,
      description: `DigiBot - suscripción mensual (${payment.orderId})`,
      orderId: payment.orderId,
    });
  } catch (err) {
    if (err instanceof DlocalNetworkError || (err instanceof DlocalApiError && err.isDuplicateOrder)) {
      // No sabemos el resultado (o dLocal ya lo tiene): queda "unknown"; la notificación lo resuelve.
      await deps.repo.updatePayment(payment.id, { status: "unknown", rejectedReason: (err as Error).message });
      if (err instanceof DlocalApiError) {
        await safeHook("alerta", () => deps.hooks?.alert?.("Cobro a reconciliar", `${payment.orderId}: dLocal Go ya tenía ese cobro. Revisalo en su panel.`));
      }
      return "skipped";
    }
    if (err instanceof DlocalApiError) {
      await deps.repo.updatePayment(payment.id, { status: "rejected", rejectedReason: `${err.code ?? err.httpStatus}: ${err.message}`, raw: err.body });
      await applyRenewalFailure(deps, (await deps.repo.getPayment(payment.id))!);
      return "failed";
    }
    throw err;
  }
  await deps.repo.updatePayment(payment.id, { dlocalPaymentId: remote.id, status: "pending", raw: remote });
  const applied = await applyDlocalPayment(deps, payment.id, remote);
  if (applied?.status === "paid") return "charged";
  if (applied && ["rejected", "cancelled", "expired"].includes(applied.status)) return "failed";
  return "skipped"; // pendiente: lo cierra la notificación
}

// Reintento manual (superadmin): cobra ya, sin esperar al próximo reintento.
export async function retryNow(deps: BillingDeps, subscriptionId: number): Promise<ChargeResult> {
  return deps.repo.withLock(`sub:${subscriptionId}`, async () => {
    const sub = await deps.repo.getSubscription(subscriptionId);
    if (!sub || (sub.status !== "past_due" && sub.status !== "suspended")) throw new BillingError("Esta suscripción no tiene pagos pendientes.", 409);
    return chargeRenewal(deps, sub);
  });
}

// ---------- Pagar con otra tarjeta (SmartFields) ----------
// Paga el próximo período impago (la deuda si está en mora, o adelanta el próximo mes
// si está al día) y, al aprobarse, reemplaza el token guardado.

export async function startCardUpdate(deps: BillingDeps, accountId: number): Promise<CheckoutStart> {
  const sub = await deps.repo.getCurrentForAccount(accountId);
  if (!sub || !LIVE.has(sub.status)) throw new BillingError("No hay una suscripción para actualizar.", 404);
  if (!isBillingCountry(sub.country)) throw new BillingError("País no habilitado.", 409);
  const due = dueDate(sub)!;
  const planKey = sub.pendingPlanKey ?? sub.planKey;
  const amount = sub.pendingPlanKey ? sub.pendingAmount ?? sub.amount : sub.amount;
  const plan = (await deps.plans.get(planKey)) ?? { planKey, name: planKey };
  const previous = (await deps.repo.listPayments([sub.id])).filter((p) => p.kind === "card_update").length;
  const ref = newRef();
  const payment = await deps.repo.createPayment({
    subscriptionId: sub.id,
    orderId: `SUB-${sub.id}-${yyyymm(due)}-CARD${previous + 1}`,
    kind: "card_update",
    publicRef: ref,
    planKey,
    amount,
    currency: sub.currency,
    periodStart: due,
    periodEnd: null,
  });
  const base = deps.appUrl.replace(/\/$/, "");
  let created: DlocalPayment;
  try {
    created = await deps.dlocal.createPayment({
      amount,
      currency: sub.currency,
      country: sub.country,
      orderId: payment.orderId,
      description: `DigiBot ${plan.name} - pago con otra tarjeta`,
      notificationUrl: deps.notificationUrl ?? `${base}/api/billing/dlocalgo/notificaciones`,
      successUrl: `${base}/suscripcion/resultado?ref=${ref}`,
      backUrl: `${base}/admin/cuentas/${accountId}/configuracion?tab=suscripcion`,
    });
  } catch (err) {
    await deps.repo.updatePayment(payment.id, { status: "cancelled", rejectedReason: (err as Error).message });
    if (err instanceof DlocalApiError) throw new BillingError(apiErrorMessage(err.code, err.message), 502);
    throw new BillingError("No pudimos conectar con el procesador de pagos. Probá de nuevo en unos minutos.", 502);
  }
  await deps.repo.updatePayment(payment.id, {
    dlocalPaymentId: created.id,
    checkoutTokenEnc: encryptSecret(created.merchant_checkout_token!),
    status: "pending",
    raw: created,
  });
  return {
    ref,
    checkoutToken: created.merchant_checkout_token!,
    smartFieldsKey: deps.dlocal.smartFieldsKey,
    sdkUrl: deps.dlocal.sdkUrl,
    plan,
    amount,
    currency: sub.currency,
    country: sub.country,
  };
}

// ---------- Cambio de plan ----------

const ZERO_DECIMALS = new Set(["CLP", "COP", "PYG"]);
const roundMoney = (n: number, currency: string) => (ZERO_DECIMALS.has(currency) ? Math.round(n) : Math.round(n * 100) / 100);

// Diferencia proporcional a los días que quedan del período.
export function prorate(sub: Pick<BillingSubscription, "periodStart" | "periodEnd" | "amount" | "currency">, newAmount: number, today: string) {
  if (!sub.periodStart || !sub.periodEnd) return 0;
  const total = Math.max(1, daysBetween(sub.periodStart, sub.periodEnd));
  const left = Math.min(total, Math.max(0, daysBetween(today, sub.periodEnd)));
  return roundMoney(((newAmount - sub.amount) * left) / total, sub.currency);
}

export type PlanChangeResult =
  | { kind: "upgraded"; charged: number; currency: string }
  | { kind: "downgrade_scheduled"; effectiveOn: string | null }
  | { kind: "downgrade_cancelled" };

export async function changePlan(deps: BillingDeps, accountId: number, newPlanKey: string): Promise<PlanChangeResult> {
  const current = await deps.repo.getCurrentForAccount(accountId);
  if (!current || current.status !== "active") throw new BillingError("Para cambiar de plan, la suscripción tiene que estar al día.", 409);
  return deps.repo.withLock(`sub:${current.id}`, async () => {
    const sub = (await deps.repo.getSubscription(current.id))!;
    if (!(await deps.plans.get(newPlanKey))) throw new BillingError("Ese plan no existe.", 404);
    if (newPlanKey === sub.planKey) {
      if (!sub.pendingPlanKey) throw new BillingError("Ya estás en ese plan.", 409);
      await deps.repo.updateSubscription(sub.id, { pendingPlanKey: null, pendingAmount: null });
      await changed(deps, sub.id);
      return { kind: "downgrade_cancelled" };
    }
    const price = isBillingCountry(sub.country) ? await deps.repo.getPrice(newPlanKey, sub.country) : null;
    if (!price || price.currency !== sub.currency) {
      throw new BillingError(`Ese plan no está disponible en ${BILLING_COUNTRIES[sub.country as keyof typeof BILLING_COUNTRIES]?.name ?? sub.country}.`, 409);
    }

    // Baja (o mismo precio): rige desde el próximo cobro.
    if (price.amount <= sub.amount) {
      await deps.repo.updateSubscription(sub.id, { pendingPlanKey: newPlanKey, pendingAmount: price.amount });
      await changed(deps, sub.id);
      return { kind: "downgrade_scheduled", effectiveOn: sub.nextChargeOn };
    }

    // Mejora: se cobra ya la diferencia proporcional con la tarjeta guardada.
    const today = todayOf(deps);
    const diff = prorate(sub, price.amount, today);
    const n = (await deps.repo.listPayments([sub.id])).filter((p) => p.kind === "upgrade").length + 1;
    const payment = await deps.repo.createPayment({
      subscriptionId: sub.id,
      orderId: `SUB-${sub.id}-${yyyymm(today)}-UP${n}`,
      kind: "upgrade",
      publicRef: newRef(),
      planKey: newPlanKey,
      amount: diff,
      currency: sub.currency,
      periodStart: today,
      periodEnd: sub.periodEnd,
    });
    const freeUpgrade = async () => {
      // Diferencia de centavos (o por debajo del mínimo de dLocal): se cambia sin cobrar.
      await deps.repo.updatePayment(payment.id, { status: "cancelled", rejectedReason: "sin cargo: diferencia menor al mínimo" });
      await applyUpgrade(deps, sub, { ...payment, planKey: newPlanKey });
      return { kind: "upgraded" as const, charged: 0, currency: sub.currency };
    };
    if (diff <= 0 || !sub.cardTokenEnc) return freeUpgrade();
    let remote: DlocalPayment;
    try {
      remote = await deps.dlocal.chargeRecurring(decryptSecret(sub.cardTokenEnc), {
        amount: diff,
        description: `DigiBot - mejora de plan a ${newPlanKey} (${payment.orderId})`,
        orderId: payment.orderId,
      });
    } catch (err) {
      if (err instanceof DlocalApiError && err.code === 5016) return freeUpgrade();
      await deps.repo.updatePayment(payment.id, { status: err instanceof DlocalNetworkError ? "unknown" : "rejected", rejectedReason: (err as Error).message });
      if (err instanceof DlocalApiError) throw new BillingError(apiErrorMessage(err.code, err.message), 402);
      throw new BillingError("No pudimos confirmar el cobro. Si se aprueba, el plan cambia solo en unos minutos.", 502);
    }
    await deps.repo.updatePayment(payment.id, { dlocalPaymentId: remote.id, status: "pending", raw: remote });
    // applyDlocalPayment toma el lock del pago (otro nombre): no hay deadlock con el de la suscripción.
    const applied = await applyDlocalPayment(deps, payment.id, remote);
    if (applied?.status === "paid") return { kind: "upgraded", charged: diff, currency: sub.currency };
    if (applied?.status === "pending") throw new BillingError("El pago quedó pendiente. Si se aprueba, el plan cambia solo en unos minutos.", 202);
    throw new BillingError(rejectionMessage(applied?.rejectedReason), 402);
  });
}

// ---------- Cancelación ----------

export async function setCancelAtPeriodEnd(deps: BillingDeps, accountId: number, cancel: boolean) {
  const sub = await deps.repo.getCurrentForAccount(accountId);
  if (!sub || !LIVE.has(sub.status)) throw new BillingError("No hay una suscripción activa.", 404);
  if (cancel && sub.status !== "active") throw new BillingError("Con un pago pendiente no se puede programar la cancelación. Escribinos.", 409);
  await deps.repo.updateSubscription(sub.id, { cancelAtPeriodEnd: cancel });
  const updated = await changed(deps, sub.id);
  if (cancel) await safeHook("aviso de cancelación", () => deps.hooks?.cancelScheduled?.(updated));
  return updated;
}
