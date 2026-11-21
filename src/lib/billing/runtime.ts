// Arma BillingDeps con MySQL, mails y avisos reales. Server-only.

import type { RowDataPacket } from "mysql2";
import { createAccount } from "../crm/accounts";
import { getMySqlAccountsRepo } from "../crm/accounts-mysql";
import { getMySqlSettingsRepo } from "../crm/settings-mysql";
import { getMySqlUsersRepo } from "../crm/users-mysql";
import { getPool, isDbConfigured } from "../db";
import { sendMail } from "../mailer";
import { addNotification } from "../notifications";
import { sendWhatsAppMessage } from "../meta-whatsapp";
import { formatMoney } from "./config";
import { getDlocalClient, type FetchLike } from "./dlocalgo";
import { getMySqlBillingRepo } from "./repo-mysql";
import type { BillingDeps, BillingHooks, PaymentFailureInfo, PlanInfo } from "./service";
import type { BillingSubscription, SignupData, SubscriptionPayment } from "./types";

// URL pública para success_url, back_url y notification_url. En local, BILLING_PUBLIC_URL
// apunta al túnel (cloudflared) para que dLocal Go pueda llegar.
export function publicAppUrl() {
  return (process.env.BILLING_PUBLIC_URL || process.env.APP_URL || "https://digibotlatam.com").replace(/\/$/, "");
}

async function getPlan(planKey: string): Promise<PlanInfo | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT plan_key, name FROM web_pricing_plans WHERE plan_key = ? AND is_active = 1`,
    [planKey]
  );
  return rows[0] ? { planKey: rows[0].plan_key, name: rows[0].name } : null;
}

const SYSTEM_ACTOR = { id: 0, role: "superadmin" as const };

async function createSignupAccount(signup: SignupData) {
  const repos = { accounts: getMySqlAccountsRepo(), users: getMySqlUsersRepo(), settings: getMySqlSettingsRepo() };
  try {
    const res = await createAccount(repos, SYSTEM_ACTOR, { name: signup.businessName, adminName: signup.name, adminEmail: signup.email });
    return { accountId: res.account.id, inviteToken: res.inviteToken };
  } catch (err) {
    // El pago ya se aprobó: la cuenta se crea igual y el equipo carga el admin a mano.
    console.error("[billing] No se pudo crear el admin del cliente nuevo:", (err as Error).message);
    const res = await createAccount(repos, SYSTEM_ACTOR, { name: signup.businessName });
    await alertTeam(
      `${signup.businessName}: falta el administrador`,
      `Pagó y se creó la cuenta #${res.account.id}, pero no se pudo invitar a ${signup.email} (${(err as Error).message}). Invitalo desde Equipo.`
    );
    return { accountId: res.account.id, inviteToken: null };
  }
}

function superadminEmails() {
  return (process.env.ALERTS_EMAIL || process.env.SMTP_USER || "").split(",").map((s) => s.trim()).filter(Boolean);
}

async function alertTeam(title: string, body: string) {
  await addNotification({ accountId: null, kind: "billing_alert", title, body, link: "/admin/cuentas" }).catch((err) =>
    console.error("[billing] aviso a superadmins:", (err as Error).message)
  );
  await sendMail({ to: superadminEmails(), subject: `[DigiBot cobros] ${title}`, text: body });
}

async function accountEmails(accountId: number) {
  const [clients] = await getPool().query<RowDataPacket[]>(`SELECT name, email FROM web_clients WHERE id = ?`, [accountId]);
  const [admins] = await getPool().query<RowDataPacket[]>(
    `SELECT email FROM web_users WHERE client_id = ? AND role = 'admin' AND status IN ('active', 'invited')`,
    [accountId]
  );
  return {
    name: String(clients[0]?.name ?? `Cuenta ${accountId}`),
    emails: [clients[0]?.email, ...admins.map((a) => a.email)].filter((e): e is string => typeof e === "string" && !!e),
  };
}

// web_subscriptions (migración 0012) la siguen leyendo partes del panel: se mantiene al día.
const LEGACY_STATUS: Record<BillingSubscription["status"], string | null> = {
  incomplete: null,
  active: "active",
  past_due: "past_due",
  suspended: "past_due",
  cancelled: "canceled",
};

export async function syncLegacySubscription(sub: BillingSubscription) {
  const status = LEGACY_STATUS[sub.status];
  if (!status || sub.accountId === null) return;
  await getPool().query(
    `INSERT INTO web_subscriptions
       (client_id, plan_key, status, current_period_end, cancel_at_period_end, payment_brand, payment_last4, provider, provider_subscription_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'dlocalgo', ?)
     ON DUPLICATE KEY UPDATE plan_key = VALUES(plan_key), status = VALUES(status), current_period_end = VALUES(current_period_end),
       cancel_at_period_end = VALUES(cancel_at_period_end), payment_brand = VALUES(payment_brand), payment_last4 = VALUES(payment_last4),
       provider = 'dlocalgo', provider_subscription_id = VALUES(provider_subscription_id)`,
    [
      sub.accountId,
      sub.planKey,
      status,
      sub.periodEnd ? `${sub.periodEnd} 23:59:59` : null,
      sub.cancelAtPeriodEnd ? 1 : 0,
      sub.cardBrand,
      sub.cardLast4,
      String(sub.id),
    ]
  );
}

// Panel + bot de la cuenta (migración 0018: web_clients.bot_enabled, que lee n8n).
// Solo se reactiva lo que bloqueó el cobro: una suspensión manual del equipo no se pisa.
const BILLING_REASONS = ["billing_suspended", "subscription_ended"];

export async function setAccountAccess(accountId: number, enabled: boolean, reason: string | null) {
  try {
    if (enabled) {
      await getPool().query(
        `UPDATE web_clients SET status = IF(status = 'suspended', 'active', status), bot_enabled = 1, bot_disabled_reason = NULL
         WHERE id = ? AND (bot_disabled_reason IS NULL OR bot_disabled_reason IN (?))`,
        [accountId, BILLING_REASONS]
      );
    } else {
      await getPool().query(`UPDATE web_clients SET status = 'suspended', bot_enabled = 0, bot_disabled_reason = ? WHERE id = ?`, [reason, accountId]);
    }
  } catch (err) {
    // Nunca corta el cobro (p. ej. si falta la migración 0018): avisa al equipo para hacerlo a mano.
    console.error("[billing] No se pudo cambiar el acceso de la cuenta:", (err as Error).message);
    await alertTeam(
      `Cuenta #${accountId}: no se pudo ${enabled ? "reactivar" : "suspender"}`,
      `Hacelo a mano desde Cuentas (${(err as Error).message}).`
    );
  }
}

// WhatsApp a los superadmins desde el número de DigiBot, con la plantilla aprobada de
// web_billing_settings ("nombre" o "nombre|idioma"; por defecto es_AR). Cuerpo con 3
// variables: {{1}} cuenta, {{2}} monto, {{3}} motivo. Sin números o sin plantilla, no se manda.
async function whatsappSuperadmins(params: [string, string, string]) {
  const settings = await getMySqlBillingRepo().getSettings();
  if (!settings.superadminWhatsapp.length || !settings.failedPaymentTemplate) return;
  const [name, language = "es_AR"] = settings.failedPaymentTemplate.split("|").map((s) => s.trim());
  for (const to of settings.superadminWhatsapp) {
    try {
      await sendWhatsAppMessage(
        to,
        { type: "template", template: { name, language, components: [{ type: "body", parameters: params.map((text) => ({ type: "text" as const, text })) }] } },
        process.env.WHATSAPP_PHONE_NUMBER_ID || null
      );
    } catch (err) {
      console.error(`[billing] WhatsApp a ${to}:`, (err as Error).message);
    }
  }
}

const panelLink = (accountId: number) => `${publicAppUrl()}/admin/cuentas/${accountId}/configuracion?tab=suscripcion`;

async function notifyAccount(accountId: number, kind: string, title: string, body: string, mailLines: string[]) {
  await addNotification({ accountId, kind, title, body, link: `/admin/cuentas/${accountId}/configuracion?tab=suscripcion` }).catch((err) =>
    console.error("[billing] aviso en el panel:", (err as Error).message)
  );
  const { emails } = await accountEmails(accountId);
  await sendMail({ to: emails, subject: `DigiBot: ${title}`, text: mailLines.join("\n") });
}

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "-";

export const mysqlBillingHooks: BillingHooks = {
  subscriptionChanged: syncLegacySubscription,

  async paymentApproved(sub: BillingSubscription, payment: SubscriptionPayment) {
    if (sub.accountId === null) return;
    const { name, emails } = await accountEmails(sub.accountId);
    const plan = (await getPlan(payment.planKey))?.name ?? payment.planKey;
    const card = sub.cardLast4 ? `${sub.cardBrand ?? "Tarjeta"} terminada en ${sub.cardLast4}` : "tu tarjeta";
    await sendMail({
      to: emails,
      subject: `Comprobante de pago DigiBot - ${plan}`,
      text: [
        `Hola ${name},`,
        "",
        `Recibimos tu pago de ${formatMoney(payment.amount, payment.currency)} por el plan ${plan}.`,
        payment.periodStart ? `Período: del ${fmtDate(payment.periodStart)} al ${fmtDate(payment.periodEnd)}.` : "",
        `Medio de pago: ${card}.`,
        `Comprobante: ${payment.orderId} (dLocal Go ${payment.dlocalPaymentId ?? ""}).`,
        sub.nextChargeOn ? `Próximo cobro: ${fmtDate(sub.nextChargeOn)}.` : "",
        "",
        `Podés ver tu historial de pagos en ${publicAppUrl()}/admin/cuentas/${sub.accountId}/configuracion?tab=suscripcion`,
        "",
        "Gracias por elegir DigiBot.",
      ]
        .filter((l, i, all) => l !== "" || all[i - 1] !== "")
        .join("\n"),
    });
  },

  async signupCompleted(sub, signup, inviteToken) {
    const link = inviteToken ? `${publicAppUrl()}/admin/invitacion/${encodeURIComponent(inviteToken)}` : null;
    await sendMail({
      to: [signup.email],
      subject: "Bienvenido a DigiBot: creá tu contraseña",
      text: [
        `Hola ${signup.name},`,
        "",
        `Tu suscripción de ${signup.businessName} ya está activa.`,
        link ? `Creá tu contraseña para entrar al panel: ${link}` : "En breve te escribimos para darte acceso al panel.",
        link ? "El link vence en 7 días." : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    await alertTeam(`Cliente nuevo: ${signup.businessName}`, `Se suscribió desde la web (cuenta #${sub.accountId}, plan ${sub.planKey}, ${sub.country}).`);
  },

  alert: alertTeam,

  async paymentFailed(sub, payment, info: PaymentFailureInfo) {
    if (sub.accountId === null) return;
    const { name } = await accountEmails(sub.accountId);
    const amount = formatMoney(payment.amount, payment.currency);
    const next = info.nextRetryOn ? `Lo vamos a volver a intentar el ${fmtDate(info.nextRetryOn)}.` : "No vamos a volver a intentarlo automáticamente.";
    const mail = [
      `Hola ${name},`,
      "",
      `No pudimos cobrar ${amount} de tu suscripción a DigiBot. ${info.reason}`,
      next,
      `Si no se registra el pago antes del ${fmtDate(info.suspendOn)}, la cuenta (panel y bot) se suspende hasta que se pague.`,
      "",
      `Pagá con otra tarjeta desde tu panel: ${panelLink(sub.accountId)}`,
    ];
    if (info.redirectUrl) mail.push(`O en la página segura de dLocal Go (vence en 24 h): ${info.redirectUrl}`);
    await notifyAccount(
      sub.accountId,
      "billing_failed",
      "No pudimos cobrar tu suscripción",
      `${info.reason} ${next} Si no se paga antes del ${fmtDate(info.suspendOn)}, la cuenta se suspende.`,
      mail
    );
    await alertTeam(`Pago fallido: ${name}`, `${name} (#${sub.accountId}): falló el cobro ${payment.orderId} de ${amount}. ${info.reason} Intento ${sub.failedAttempts}. ${next}`);
    await whatsappSuperadmins([name, amount, info.reason]);
  },

  async subscriptionSuspended(sub) {
    if (sub.accountId === null) return;
    const { name } = await accountEmails(sub.accountId);
    await notifyAccount(sub.accountId, "billing_suspended", "Tu cuenta está suspendida por falta de pago", "El panel y el bot están pausados. Pagá con otra tarjeta y se reactiva todo al instante.", [
      `Hola ${name},`,
      "",
      "Tu cuenta de DigiBot quedó suspendida por falta de pago: el panel y el bot están pausados.",
      `Podés pagar con otra tarjeta y se reactiva al instante: ${panelLink(sub.accountId)}`,
    ]);
    await alertTeam(`Cuenta suspendida: ${name}`, `#${sub.accountId} pasó los días de gracia sin pagar. Panel y bot bloqueados (bot_enabled = 0).`);
  },

  async subscriptionReactivated(sub) {
    if (sub.accountId === null) return;
    const { name } = await accountEmails(sub.accountId);
    await alertTeam(`Cuenta al día: ${name}`, `#${sub.accountId} pagó la deuda. Panel y bot reactivados.`);
  },

  async subscriptionEnded(sub) {
    if (sub.accountId === null) return;
    const { name } = await accountEmails(sub.accountId);
    await notifyAccount(sub.accountId, "billing_ended", "Tu suscripción terminó", "Como pediste, no la renovamos. Cuando quieras volver, elegí un plan.", [
      `Hola ${name},`,
      "",
      "Tu suscripción a DigiBot terminó, como pediste, y no se va a cobrar más.",
      `Cuando quieras volver: ${publicAppUrl()}/#planes`,
    ]);
    await alertTeam(`Suscripción terminada: ${name}`, `#${sub.accountId} había pedido cancelar. Panel y bot pausados.`);
  },

  async cancelScheduled(sub) {
    if (sub.accountId === null) return;
    const { name } = await accountEmails(sub.accountId);
    await alertTeam(`Pidió cancelar: ${name}`, `#${sub.accountId} cancela al fin del período (${fmtDate(sub.periodEnd)}).`);
  },
};

export function getBillingDeps(fetchImpl?: FetchLike): BillingDeps | null {
  if (!isDbConfigured()) return null;
  const dlocal = getDlocalClient(fetchImpl);
  if (!dlocal) return null;
  return {
    repo: getMySqlBillingRepo(),
    dlocal,
    accounts: getMySqlAccountsRepo(),
    plans: { get: getPlan },
    createAccount: createSignupAccount,
    setAccountAccess,
    appUrl: publicAppUrl(),
    notificationUrl: process.env.DLOCALGO_NOTIFICATION_URL || undefined,
    hooks: mysqlBillingHooks,
  };
}

export async function isEmailTaken(email: string) {
  return (await getMySqlUsersRepo().getByEmail(email)) !== null;
}
