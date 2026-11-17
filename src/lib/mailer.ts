// Envío de mails (SMTP de info@digibotlatam.com). Server-only.
//
//   SMTP_HOST, SMTP_PORT (465 = TLS directo; 587 = STARTTLS), SMTP_USER, SMTP_PASS
//   SMTP_FROM   -> remitente, ej: "DigiBot <info@digibotlatam.com>" (por defecto SMTP_USER)
//
// Si falta la config, no se manda nada y queda un aviso en el log (los avisos en el
// panel funcionan igual). Un error de SMTP nunca rompe el flujo que pidió el mail.

import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export interface MailInput {
  to: string[];
  subject: string;
  text: string;
}

export async function sendMail({ to, subject, text }: MailInput): Promise<boolean> {
  const recipients = [...new Set(to.map((t) => t.trim()).filter((t) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)))];
  if (recipients.length === 0) return false;
  if (!isMailConfigured()) {
    console.warn(`[mail] SMTP sin configurar: no se mandó "${subject}".`);
    return false;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients.join(", "),
      subject,
      text,
    });
    return true;
  } catch (err) {
    console.error(`[mail] No se pudo mandar "${subject}":`, (err as Error).message);
    return false;
  }
}
