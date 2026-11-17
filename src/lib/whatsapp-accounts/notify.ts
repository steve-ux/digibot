// Avisos cuando una cuenta de WhatsApp se desconecta o necesita atención: aviso en el
// panel de la cuenta, aviso para los superadmins y mail a los dos. Server-only.
// Un fallo acá se loguea y nunca corta el flujo que lo disparó.

import type { RowDataPacket } from "mysql2";
import { getPool } from "../db";
import { sendMail } from "../mailer";
import { addNotification } from "../notifications";
import type { WaAccount } from "./repo";
import type { DisconnectionInfo } from "./types";

export interface WaNotifier {
  disconnected(account: WaAccount, info: DisconnectionInfo): Promise<void>;
  needsAttention(account: WaAccount, detail: string): Promise<void>;
}

const REASONS: Record<string, string> = {
  PARTNER_REMOVED: "Quitaron a DigiBot de las apps conectadas de la cuenta de WhatsApp Business.",
  ACCOUNT_OFFBOARDED: "La cuenta se desvinculó de DigiBot (por ejemplo, desde la app de WhatsApp Business).",
  TOKEN_INVALID: "Meta revocó el permiso que nos diste para usar este número.",
  PERMISSIONS_MISSING: "Faltan los permisos de WhatsApp que le diste a DigiBot.",
};

export function describeDisconnection(info: DisconnectionInfo | null) {
  if (!info) return "Se cortó la conexión con WhatsApp.";
  return REASONS[info.event ?? ""] ?? REASONS[info.reason ?? ""] ?? `Meta informó: ${info.reason ?? "desconexión"}.`;
}

const phoneOf = (a: WaAccount) => a.displayPhoneNumber ?? a.phoneNumberId;
const canalesPath = (accountId: number) => `/admin/cuentas/${accountId}/canales`;

async function accountEmails(accountId: number): Promise<{ name: string; emails: string[] }> {
  const [clients] = await getPool().query<RowDataPacket[]>(`SELECT name, email FROM web_clients WHERE id = ?`, [accountId]);
  const [admins] = await getPool().query<RowDataPacket[]>(
    `SELECT email FROM web_users WHERE client_id = ? AND role = 'admin' AND status = 'active'`,
    [accountId]
  );
  const emails = [clients[0]?.email, ...admins.map((a) => a.email)].filter((e): e is string => typeof e === "string" && !!e);
  return { name: clients[0]?.name ?? `Cuenta ${accountId}`, emails };
}

// Superadmins: ALERTS_EMAIL, o si no está, el remitente (info@digibotlatam.com).
function superadminEmails() {
  const raw = process.env.ALERTS_EMAIL || process.env.SMTP_USER || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function panelUrl(path: string) {
  return `${(process.env.APP_URL || "https://digibotlatam.com").replace(/\/$/, "")}${path}`;
}

async function safely(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    console.error(`[wa-notify] ${label}:`, (err as Error).message);
  }
}

export const mysqlNotifier: WaNotifier = {
  async disconnected(account, info) {
    const reason = describeDisconnection(info);
    const phone = phoneOf(account);
    const { name, emails } = await accountEmails(account.accountId).catch(() => ({ name: `Cuenta ${account.accountId}`, emails: [] }));
    await safely("aviso en el panel", () =>
      addNotification({
        accountId: account.accountId,
        kind: "wa_disconnected",
        title: `WhatsApp desconectado (${phone})`,
        body: `${reason} No vas a poder responder desde la bandeja hasta que lo reconectes en Canales.`,
        link: canalesPath(account.accountId),
      })
    );
    await safely("aviso a superadmins", () =>
      addNotification({
        accountId: null,
        kind: "wa_disconnected",
        title: `${name}: WhatsApp ${phone} desconectado`,
        body: `${reason} Origen: ${info.source}${info.initiatedBy ? ` · iniciado por ${info.initiatedBy}` : ""}.`,
        link: "/admin/cuentas/whatsapp",
      })
    );
    await sendMail({
      to: emails,
      subject: `Tu WhatsApp ${phone} se desconectó de DigiBot`,
      text:
        `Hola,\n\n${reason}\n\nMientras tanto no llegan mensajes nuevos a la bandeja y no se puede responder desde DigiBot.\n` +
        `Para volver a conectarlo entrá a Canales y tocá "Reconectar":\n${panelUrl(canalesPath(account.accountId))}\n\n` +
        `Si no fuiste vos, respondé este mail y te ayudamos.\n\nEquipo de DigiBot`,
    });
    await sendMail({
      to: superadminEmails(),
      subject: `[DigiBot] ${name}: WhatsApp ${phone} desconectado`,
      text: `${reason}\nCuenta: ${name} (#${account.accountId})\nWABA: ${account.wabaId}\nOrigen: ${info.source}\nIniciado por: ${info.initiatedBy ?? "-"}\n${panelUrl("/admin/cuentas/whatsapp")}`,
    });
  },

  async needsAttention(account, detail) {
    const phone = phoneOf(account);
    await safely("aviso a superadmins", () =>
      addNotification({
        accountId: null,
        kind: "wa_needs_attention",
        title: `WhatsApp ${phone} necesita atención`,
        body: detail,
        link: "/admin/cuentas/whatsapp",
      })
    );
  },
};
