// Cobro recurrente con dLocal Go: alta (checkout transparente), aplicación de pagos
// y notificaciones. Sin acceso directo a la base: todo pasa por BillingDeps, así
// los tests usan repos en memoria y un fetch fakeado.
//
// Reglas:
//   - La tarjeta nunca llega acá: SmartFields la tokeniza en el navegador y solo
//     viaja el cardToken (de un solo uso).
//   - El merchant_checkout_token se guarda siempre cifrado.
//   - Nunca se confía en lo que manda el navegador ni en el cuerpo de la
//     notificación: el estado se confirma con GET /v1/payments/{id}.
//   - Cada pago se procesa bajo un lock por pago y es idempotente: aplicar dos
//     veces el mismo estado no hace nada.

import { randomBytes } from "crypto";
import { decryptSecret, encryptSecret } from "../crypto";
import type { AccountsRepo } from "../crm/accounts-repo";
import { validateEmail, validateName } from "../crm/team";
import { BILLING_COUNTRIES, addMonthsAnchored, isBillingCountry, todayIn, yyyymm, type BillingCountry } from "./config";
import { DlocalApiError, DlocalNetworkError, type DlocalGoClient, type DlocalPayment, type DlocalStatus } from "./dlocalgo";
import { apiErrorMessage, BillingError, rejectionMessage } from "./errors";
import { applyPeriodPayment, applyRenewalFailure, applyUpgrade } from "./engine";
import type { BillingRepo } from "./repo";
import type { BillingSubscription, PaymentStatus, SignupData, SubscriptionPayment } from "./types";

export interface PlanInfo {
  planKey: string;
  name: string;
}

// Lo que el servicio necesita del resto del sistema. Los efectos (mails, avisos,
// web_subscriptions) van por hooks para no acoplar el dominio a la base.
export interface BillingDeps {
  repo: BillingRepo;
  dlocal: DlocalGoClient;
  accounts: AccountsRepo;
  plans: { get(planKey: string): Promise<PlanInfo | null> };
  // Crea la cuenta y su primer admin para un cliente nuevo. Devuelve el token de invitación (o null si no se pudo crear el admin).
  createAccount(signup: SignupData): Promise<{ accountId: number; inviteToken: string | null }>;
  // Prende o apaga panel y bot de la cuenta (suspensión por falta de pago / reactivación al pagar).
  setAccountAccess(accountId: number, enabled: boolean, reason: string | null): Promise<void>;
  appUrl: string;
  notificationUrl?: string;
  today?: () => string;
  hooks?: BillingHooks;
}

export interface BillingHooks {
  // Se llama cada vez que cambia el estado de una suscripción (para web_subscriptions, avisos, etc.)
  subscriptionChanged?(sub: BillingSubscription): Promise<void>;
  // Pago aprobado (evento PaymentApproved ya guardado): comprobante por mail, facturación.
  paymentApproved?(sub: BillingSubscription, payment: SubscriptionPayment): Promise<void>;
  // Cliente nuevo: mail con el link para crear la contraseña.
  signupCompleted?(sub: BillingSubscription, signup: SignupData, inviteToken: string | null): Promise<void>;
  // Algo que tiene que mirar una persona del equipo (monto que no coincide, doble alta…).
  alert?(title: string, body: string): Promise<void>;
  paymentFailed?(sub: BillingSubscription, payment: SubscriptionPayment, info: PaymentFailureInfo): Promise<void>;
  subscriptionSuspended?(sub: BillingSubscription): Promise<void>;
  subscriptionReactivated?(sub: BillingSubscription): Promise<void>;
  subscriptionEnded?(sub: BillingSubscription): Promise<void>;
  cancelScheduled?(sub: BillingSubscription): Promise<void>;
}

export interface PaymentFailureInfo {
  reason: string;
  nextRetryOn: string | null;
  suspendOn: string;
  // Alternativa de dLocal Go: checkout hosteado para reintentar con otra tarjeta (vence a las 24 h)
  redirectUrl: string | null;
}

const today = (deps: BillingDeps) => (deps.today ?? (() => todayIn()))();
const newRef = () => randomBytes(16).toString("hex");
const appUrl = (deps: BillingDeps, path: string) => `${deps.appUrl.replace(/\/$/, "")}${path}`;
const LIVE = new Set(["active", "past_due", "suspended"]);

async function safeHook(label: string, fn: () => Promise<void> | undefined) {
  try {
    await fn();
  } catch (err) {
    console.error(`[billing] ${label}:`, (err as Error).message);
  }
}

const STATUS_MAP: Record<DlocalStatus, PaymentStatus> = {
  PENDING: "pending",
  PAID: "paid",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};

// ---------- Alta: crear el checkout ----------

export interface CheckoutActor {
  // Cuenta ya existente (admin logueado, o superadmin operando una cuenta). null = cliente nuevo desde la web.
  accountId: number | null;
}

export interface CheckoutStart {
  ref: string;
  checkoutToken: string;
  smartFieldsKey: string;
  sdkUrl: string;
  plan: PlanInfo;
  amount: number;
  currency: string;
  country: BillingCountry;
}

const clean = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

function parseSignup(body: Record<string, unknown>): SignupData {
  const signup = (body.signup ?? {}) as Record<string, unknown>;
  const data: SignupData = {
    businessName: clean(signup.businessName),
    name: clean(signup.name),
    email: clean(signup.email, 191).toLowerCase(),
  };
  const fields: Record<string, string | undefined> = {};
  if (data.businessName.length < 2) fields.businessName = "Escribí el nombre de tu negocio.";
  const nameProblem = validateName(data.name);
  if (nameProblem) fields.name = nameProblem;
  const emailProblem = validateEmail(data.email);
  if (emailProblem) fields.email = emailProblem;
  if (Object.keys(fields).length) throw new BillingError(Object.values(fields)[0]!, 400, fields);
  return data;
}

export async function startCheckout(
  deps: BillingDeps,
  actor: CheckoutActor,
  body: unknown,
  emailTaken: (email: string) => Promise<boolean>
): Promise<CheckoutStart> {
  const data = (body ?? {}) as Record<string, unknown>;
  const planKey = clean(data.planKey, 50);
  const country = clean(data.country, 2).toUpperCase();
  if (!isBillingCountry(country)) throw new BillingError("Elegí un país de la lista.", 400, { country: "Elegí un país de la lista." });
  const plan = await deps.plans.get(planKey);
  if (!plan) throw new BillingError("Ese plan no existe.", 404);
  const price = await deps.repo.getPrice(planKey, country);
  if (!price || price.currency !== BILLING_COUNTRIES[country].currency) {
    throw new BillingError(`El plan ${plan.name} todavía no está disponible en ${BILLING_COUNTRIES[country].name}.`, 409);
  }

  let signup: SignupData | null = null;
  if (actor.accountId === null) {
    signup = parseSignup(data);
    if (await emailTaken(signup.email)) {
      throw new BillingError("Ya hay una cuenta con ese email. Iniciá sesión para elegir tu plan.", 409, {
        email: "Ya hay una cuenta con ese email. Iniciá sesión para elegir tu plan.",
      });
    }
  } else {
    const current = await deps.repo.getCurrentForAccount(actor.accountId);
    if (current && LIVE.has(current.status)) {
      throw new BillingError("Esta cuenta ya tiene una suscripción. Para cambiar de plan usá Configuración → Suscripción.", 409);
    }
  }

  const subscriptionId = await deps.repo.createSubscription({
    accountId: actor.accountId,
    planKey,
    country,
    currency: price.currency,
    amount: price.amount,
    signup,
  });
  const ref = newRef();
  const payment = await deps.repo.createPayment({
    subscriptionId,
    orderId: `SUB-${subscriptionId}-${yyyymm(today(deps))}-1`,
    kind: "initial",
    publicRef: ref,
    planKey,
    amount: price.amount,
    currency: price.currency,
    periodStart: null,
    periodEnd: null,
  });

  const account = actor.accountId === null ? null : await deps.accounts.get(actor.accountId);
  const who = signup?.businessName ?? account?.name ?? `Cuenta ${actor.accountId}`;
  let created: DlocalPayment;
  try {
    created = await deps.dlocal.createPayment({
      amount: price.amount,
      currency: price.currency,
      country,
      orderId: payment.orderId,
      description: `DigiBot ${plan.name} - ${who}`.slice(0, 100),
      notificationUrl: deps.notificationUrl ?? appUrl(deps, "/api/billing/dlocalgo/notificaciones"),
      successUrl: appUrl(deps, `/suscripcion/resultado?ref=${ref}`),
      backUrl: appUrl(deps, `/suscripcion/${encodeURIComponent(planKey)}`),
    });
  } catch (err) {
    await deps.repo.updatePayment(payment.id, { status: "cancelled", rejectedReason: (err as Error).message });
    if (err instanceof DlocalApiError) throw new BillingError(apiErrorMessage(err.code, err.message), 502);
    throw new BillingError("No pudimos conectar con el procesador de pagos. Probá de nuevo en unos minutos.", 502);
  }
  if (!created.merchant_checkout_token) throw new BillingError("dLocal Go no devolvió el checkout. Probá de nuevo.", 502);

  await deps.repo.updatePayment(payment.id, {
    dlocalPaymentId: created.id,
    checkoutTokenEnc: encryptSecret(created.merchant_checkout_token),
    status: "pending",
    raw: created,
  });

  return {
    ref,
    checkoutToken: created.merchant_checkout_token,
    smartFieldsKey: deps.dlocal.smartFieldsKey,
    sdkUrl: deps.dlocal.sdkUrl,
    plan,
    amount: price.amount,
    currency: price.currency,
    country,
  };
}

// ---------- Alta: confirmar con el token de SmartFields ----------

export interface HolderInput {
  firstName: string;
  lastName: string;
  documentType: string;
  document: string;
  email: string;
}

export function parseHolder(body: Record<string, unknown>, country: string): HolderInput {
  const holder: HolderInput = {
    firstName: clean(body.firstName, 60),
    lastName: clean(body.lastName, 60),
    documentType: clean(body.documentType, 10).toUpperCase(),
    document: clean(body.document, 30).replace(/[\s.-]/g, ""),
    email: clean(body.email, 191).toLowerCase(),
  };
  const fields: Record<string, string | undefined> = {};
  if (holder.firstName.length < 1) fields.firstName = "Escribí el nombre como figura en la tarjeta.";
  if (holder.lastName.length < 1) fields.lastName = "Escribí el apellido.";
  const docs: readonly string[] = isBillingCountry(country) ? BILLING_COUNTRIES[country].documents : [];
  if (!docs.includes(holder.documentType)) fields.documentType = "Elegí el tipo de documento.";
  if (!/^[A-Za-z0-9]{3,30}$/.test(holder.document)) fields.document = "Revisá el número de documento.";
  const emailProblem = validateEmail(holder.email);
  if (emailProblem) fields.email = emailProblem;
  if (Object.keys(fields).length) throw new BillingError(Object.values(fields)[0]!, 400, fields);
  return holder;
}

export type ConfirmOutcome =
  | { status: "paid"; ref: string }
  | { status: "redirect"; ref: string; redirectUrl: string }
  | { status: "pending"; ref: string };

const CONFIRMABLE = new Set<SubscriptionPayment["kind"]>(["initial", "card_update"]);

export async function confirmCheckout(deps: BillingDeps, body: unknown, guard?: (sub: BillingSubscription) => void): Promise<ConfirmOutcome> {
  const data = (body ?? {}) as Record<string, unknown>;
  const ref = clean(data.ref, 32);
  const cardToken = clean(data.cardToken, 200);
  const brand = clean(data.brand, 30) || null;
  const payment = /^[0-9a-f]{32}$/.test(ref) ? await deps.repo.getPaymentByRef(ref) : null;
  if (!payment || !CONFIRMABLE.has(payment.kind) || !payment.checkoutTokenEnc) throw new BillingError("El pago no existe o venció. Volvé a empezar.", 404);
  const sub = (await deps.repo.getSubscription(payment.subscriptionId))!;
  guard?.(sub);
  if (payment.status === "paid") return { status: "paid", ref };
  if (payment.status !== "pending") throw new BillingError("Este pago ya no se puede completar. Volvé a empezar.", 409);
  if (!cardToken) throw new BillingError("Completá los datos de la tarjeta.", 400);
  const holder = parseHolder(data, sub.country);

  if (brand) await deps.repo.updatePayment(payment.id, { cardBrand: brand });
  let result;
  try {
    result = await deps.dlocal.confirmPayment(decryptSecret(payment.checkoutTokenEnc), {
      cardToken,
      ...holder,
    });
  } catch (err) {
    if (err instanceof DlocalApiError) {
      // Rechazos: el pago sigue PENDING en dLocal y se puede reintentar con otra tarjeta.
      await syncPayment(deps, payment.id).catch(() => undefined);
      throw new BillingError(apiErrorMessage(err.code, err.message), 402);
    }
    if (err instanceof DlocalNetworkError) {
      // No sabemos si se cobró: la notificación (o la página de resultado) lo resuelve.
      return { status: "pending", ref };
    }
    throw err;
  }
  if (result.redirectUrl) return { status: "redirect", ref, redirectUrl: result.redirectUrl };

  const synced = await syncPayment(deps, payment.id);
  if (synced?.status === "paid") return { status: "paid", ref };
  if (synced?.status === "rejected") throw new BillingError(rejectionMessage(synced.rejectedReason), 402);
  return { status: "pending", ref };
}

// ---------- Aplicar el estado real de un pago (idempotente) ----------

// Consulta dLocal y aplica. Devuelve el pago actualizado.
export async function syncPayment(deps: BillingDeps, paymentId: number): Promise<SubscriptionPayment | null> {
  const payment = await deps.repo.getPayment(paymentId);
  if (!payment?.dlocalPaymentId) return payment;
  const remote = await deps.dlocal.getPayment(payment.dlocalPaymentId);
  return applyDlocalPayment(deps, paymentId, remote);
}

export async function applyDlocalPayment(deps: BillingDeps, paymentId: number, remote: DlocalPayment): Promise<SubscriptionPayment | null> {
  return deps.repo.withLock(`pay:${paymentId}`, async () => {
    const payment = await deps.repo.getPayment(paymentId);
    if (!payment) return null;
    if (remote.order_id && remote.order_id !== payment.orderId) {
      await safeHook("alerta", () => deps.hooks?.alert?.("Pago de dLocal que no coincide", `El pago ${remote.id} trae order_id ${remote.order_id} y esperábamos ${payment.orderId}.`));
      return payment;
    }
    const next = STATUS_MAP[remote.status] ?? "pending";
    // Un pago aprobado no vuelve atrás. Si quedó aprobado pero sin aplicar (se cortó el
    // proceso a mitad de camino), se termina de aplicar: el evento marca que ya está completo.
    if (payment.status === "paid") {
      if (!(await deps.repo.hasEvent("PaymentApproved", payment.id))) await onPaid(deps, payment);
      return deps.repo.getPayment(payment.id);
    }
    if (next === payment.status) return payment;

    if (next === "paid") {
      if (Number(remote.amount) !== payment.amount || remote.currency !== payment.currency) {
        await deps.repo.updatePayment(payment.id, { status: "unknown", raw: remote });
        await safeHook("alerta", () =>
          deps.hooks?.alert?.(
            "Pago con monto distinto",
            `${payment.orderId}: dLocal informa ${remote.amount} ${remote.currency} y esperábamos ${payment.amount} ${payment.currency}. No se activó nada.`
          )
        );
        return deps.repo.getPayment(payment.id);
      }
      await deps.repo.updatePayment(payment.id, {
        status: "paid",
        dlocalPaymentId: payment.dlocalPaymentId ?? remote.id,
        cardLast4: remote.card?.last_four ?? null,
        paidAt: remote.approved_date ? Math.floor(Date.parse(`${remote.approved_date}Z`) / 1000) || Math.floor(Date.now() / 1000) : Math.floor(Date.now() / 1000),
        raw: remote,
      });
      const paid = (await deps.repo.getPayment(payment.id))!;
      await onPaid(deps, paid);
      return deps.repo.getPayment(payment.id);
    }

    await deps.repo.updatePayment(payment.id, {
      status: next,
      rejectedReason: remote.rejected_reason ?? null,
      raw: remote,
    });
    const updated = (await deps.repo.getPayment(payment.id))!;
    await failedHandler(updated.kind)?.(deps, updated);
    return updated;
  });
}

// Qué hace cada tipo de pago al aprobarse o fallar. Se resuelve al llamar (engine.ts importa este módulo).
function paidHandler(kind: SubscriptionPayment["kind"]) {
  switch (kind) {
    case "initial":
      return activateSubscription;
    case "renewal":
    case "card_update":
      return applyPeriodPayment;
    case "upgrade":
      return applyUpgrade;
  }
}

function failedHandler(kind: SubscriptionPayment["kind"]) {
  // Alta, cambio de tarjeta y mejora fallidos: el cliente lo ve en pantalla; no cambia la suscripción.
  return kind === "renewal" ? applyRenewalFailure : null;
}

async function onPaid(deps: BillingDeps, payment: SubscriptionPayment) {
  const sub = await deps.repo.getSubscription(payment.subscriptionId);
  if (!sub) return;
  const updated = await paidHandler(payment.kind)(deps, sub, payment);
  if (!updated) return;
  const fresh = (await deps.repo.getPayment(payment.id))!;
  const isNew = await deps.repo.addEvent({
    type: "PaymentApproved",
    subscriptionId: updated.id,
    paymentId: fresh.id,
    payload: {
      accountId: updated.accountId,
      orderId: fresh.orderId,
      dlocalPaymentId: fresh.dlocalPaymentId,
      kind: fresh.kind,
      planKey: fresh.planKey,
      amount: fresh.amount,
      currency: fresh.currency,
      country: updated.country,
      paidAt: fresh.paidAt,
      periodStart: fresh.periodStart,
      periodEnd: fresh.periodEnd,
    },
  });
  if (isNew) await safeHook("pago aprobado", () => deps.hooks?.paymentApproved?.(updated, fresh));
}

async function activateSubscription(deps: BillingDeps, sub: BillingSubscription, payment: SubscriptionPayment): Promise<BillingSubscription | null> {
  if (sub.status === "cancelled") return null; // alta duplicada ya descartada
  if (sub.status !== "incomplete") return sub; // ya activada (notificación repetida)

  let accountId = sub.accountId;
  let inviteToken: string | null = null;
  if (accountId === null && sub.signup) {
    const created = await deps.createAccount(sub.signup);
    accountId = created.accountId;
    inviteToken = created.inviteToken;
    // Se guarda ya, para que un reintento no cree otra cuenta.
    await deps.repo.updateSubscription(sub.id, { accountId });
  }
  if (accountId === null) return null;

  // Doble alta (dos checkouts pagados en paralelo): la segunda no se activa y avisa al equipo.
  const current = await deps.repo.getCurrentForAccount(accountId);
  if (current && current.id !== sub.id && LIVE.has(current.status)) {
    await deps.repo.updateSubscription(sub.id, { status: "cancelled" });
    await safeHook("alerta", () =>
      deps.hooks?.alert?.("Pago duplicado de alta", `La cuenta #${accountId} ya tenía la suscripción #${current.id} y pagó otra (${payment.orderId}). Hay que devolver ese pago.`)
    );
    return null;
  }

  const start = today(deps);
  const anchorDay = Number(start.slice(8, 10));
  const end = addMonthsAnchored(start, 1, anchorDay);
  await deps.repo.updateSubscription(sub.id, {
    status: "active",
    anchorDay,
    periodStart: start,
    periodEnd: end,
    nextChargeOn: end,
    cardTokenEnc: payment.checkoutTokenEnc,
    cardBrand: payment.cardBrand,
    cardLast4: payment.cardLast4,
    failedAttempts: 0,
    pastDueSince: null,
    cancelAtPeriodEnd: false,
    signupInviteEnc: inviteToken ? encryptSecret(inviteToken) : null,
    signupInviteExpiresAt: inviteToken ? Math.floor(Date.now() / 1000) + 24 * 3600 : null,
  });
  await deps.repo.updatePayment(payment.id, { periodStart: start, periodEnd: end });

  // Re-suscripción de una cuenta que había quedado bloqueada: se reactiva todo.
  await deps.setAccountAccess(accountId, true, null);

  const updated = (await deps.repo.getSubscription(sub.id))!;
  await safeHook("suscripción", () => deps.hooks?.subscriptionChanged?.(updated));
  if (sub.signup) await safeHook("alta de cliente", () => deps.hooks?.signupCompleted?.(updated, sub.signup!, inviteToken));
  return updated;
}

// ---------- Notificaciones de dLocal Go ----------

export type NotificationResult = { ok: true; handled: boolean } | { ok: false; status: number; message: string };

// Llamar solo después de verificar la firma. El cuerpo trae {"payment_id": "..."} y
// nada más: el estado se lee siempre con GET.
export async function handleNotification(deps: BillingDeps, rawBody: string): Promise<NotificationResult> {
  let paymentId: string | null = null;
  try {
    const parsed = JSON.parse(rawBody) as { payment_id?: unknown };
    paymentId = typeof parsed.payment_id === "string" ? parsed.payment_id : null;
  } catch {
    paymentId = null;
  }
  if (!paymentId || !/^[A-Za-z0-9-]{1,64}$/.test(paymentId)) return { ok: false, status: 400, message: "payment_id inválido" };

  const remote = await deps.dlocal.getPayment(paymentId);
  const local =
    (await deps.repo.getPaymentByDlocalId(remote.id)) ?? (remote.order_id ? await deps.repo.getPaymentByOrderId(remote.order_id) : null);
  if (!local) {
    console.warn(`[billing] Notificación de un pago que no es nuestro: ${remote.id} (${remote.order_id ?? "sin order_id"}).`);
    return { ok: true, handled: false };
  }
  if (!local.dlocalPaymentId) await deps.repo.updatePayment(local.id, { dlocalPaymentId: remote.id });
  await applyDlocalPayment(deps, local.id, remote);
  return { ok: true, handled: true };
}

// ---------- Página de resultado (success_url) ----------

export interface CheckoutResult {
  status: PaymentStatus;
  kind: SubscriptionPayment["kind"];
  planKey: string;
  amount: number;
  currency: string;
  accountId: number | null;
  message: string | null;
  // Solo para un cliente nuevo, hasta 24 h después del alta
  inviteToken: string | null;
}

export async function getCheckoutResult(deps: BillingDeps, ref: string): Promise<CheckoutResult | null> {
  if (!/^[0-9a-f]{32}$/.test(ref)) return null;
  let payment = await deps.repo.getPaymentByRef(ref);
  if (!payment) return null;
  if (payment.status === "pending" || payment.status === "unknown") {
    payment = (await syncPayment(deps, payment.id).catch(() => payment)) ?? payment;
  }
  const sub = await deps.repo.getSubscription(payment.subscriptionId);
  let inviteToken: string | null = null;
  if (sub?.signupInviteEnc && sub.signupInviteExpiresAt && sub.signupInviteExpiresAt > Date.now() / 1000) {
    try {
      inviteToken = decryptSecret(sub.signupInviteEnc);
    } catch {
      inviteToken = null;
    }
  }
  return {
    status: payment.status,
    kind: payment.kind,
    planKey: payment.planKey,
    amount: payment.amount,
    currency: payment.currency,
    accountId: sub?.accountId ?? null,
    message: payment.status === "rejected" ? rejectionMessage(payment.rejectedReason) : null,
    // El link para crear la contraseña es solo del alta de un cliente nuevo.
    inviteToken: payment.status === "paid" && payment.kind === "initial" ? inviteToken : null,
  };
}
