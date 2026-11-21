// Comprobante de pago en PDF (Configuración → Suscripción → Historial de pagos).
// No es una factura fiscal: la de ARCA se conecta en la fase de facturación.
// Solo se genera para pagos aprobados de la propia cuenta.

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { LEGAL_OWNER } from "../legal";
import { BILLING_COUNTRIES, formatMoney, isBillingCountry } from "./config";
import type { BillingRepo } from "./repo";
import type { SubscriptionPayment } from "./types";

export interface ReceiptData {
  number: string; // order_id
  paidAt: number; // unix
  accountId: number;
  accountName: string;
  country: string;
  holder: { name: string; document: string | null; email: string | null } | null;
  concept: string;
  period: { start: string; end: string } | null;
  amount: number;
  currency: string;
  card: string | null;
  dlocalPaymentId: string | null;
  invoiceRef: string | null;
}

const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", VI: "Visa", MC: "Mastercard" };

function conceptOf(p: SubscriptionPayment, planName: string) {
  switch (p.kind) {
    case "initial":
      return `Suscripción DigiBot - Plan ${planName} (alta)`;
    case "renewal":
      return `Suscripción DigiBot - Plan ${planName} (mensual)`;
    case "upgrade":
      return `Mejora al Plan ${planName} (proporcional)`;
    case "card_update":
      return `Suscripción DigiBot - Plan ${planName} (mensual)`;
  }
}

function holderOf(raw: unknown): ReceiptData["holder"] {
  const payer = (raw as { payer?: { first_name?: string; last_name?: string; document?: string; document_type?: string; email?: string } } | null)?.payer;
  if (!payer) return null;
  const name = [payer.first_name, payer.last_name].filter(Boolean).join(" ").trim();
  if (!name) return null;
  return {
    name,
    document: payer.document ? `${payer.document_type ?? "Doc."} ${payer.document}` : null,
    email: payer.email ?? null,
  };
}

// null si el pago no existe, no es de esta cuenta o no está aprobado (así una cuenta
// nunca puede bajar el comprobante de otra).
export async function getReceipt(
  repo: BillingRepo,
  accountId: number,
  paymentId: number,
  accountName: string,
  planName: (planKey: string) => string
): Promise<ReceiptData | null> {
  const payment = await repo.getPayment(paymentId);
  if (!payment || payment.status !== "paid") return null;
  const sub = await repo.getSubscription(payment.subscriptionId);
  if (!sub || sub.accountId !== accountId) return null;
  // Los cobros recurrentes (renovación, mejora) no traen titular ni tarjeta: se toman del
  // último pago anterior en que se cargó la tarjeta (alta o "pagar con otra tarjeta"),
  // que es la tarjeta guardada con la que se cobró.
  let holder = holderOf(payment.raw);
  let brand = payment.cardBrand;
  let last4 = payment.cardLast4;
  if (!holder || !last4 || !brand) {
    const source = (await repo.listPayments([sub.id])).find(
      (p) => p.id !== payment.id && p.status === "paid" && (p.kind === "initial" || p.kind === "card_update") && p.id < payment.id
    );
    if (source) {
      holder ??= holderOf(source.raw);
      // Solo si es la misma tarjeta (o no sabemos cuál fue): nunca mezclar marca y números de dos tarjetas.
      if (!last4 || last4 === source.cardLast4) {
        last4 = last4 ?? source.cardLast4;
        brand = brand ?? source.cardBrand;
      }
    }
  }
  return {
    number: payment.orderId,
    paidAt: payment.paidAt ?? payment.createdAt,
    accountId,
    accountName,
    country: sub.country,
    holder,
    concept: conceptOf(payment, planName(payment.planKey)),
    period: payment.periodStart && payment.periodEnd ? { start: payment.periodStart, end: payment.periodEnd } : null,
    amount: payment.amount,
    currency: payment.currency,
    card: last4 ? `${BRANDS[brand ?? ""] ?? (brand ? brand : "Tarjeta")} terminada en ${last4}` : brand ? BRANDS[brand] ?? brand : null,
    dlocalPaymentId: payment.dlocalPaymentId,
    invoiceRef: payment.invoiceRef,
  };
}

// ---------- PDF ----------

const BLUE = rgb(0, 0.4, 1); // #0066FF (primary de DigiBot)
const INK = rgb(0.11, 0.11, 0.11);
const MUTED = rgb(0.38, 0.4, 0.45);
const LINE = rgb(0.86, 0.87, 0.9);
const SOFT = rgb(0.95, 0.97, 1);
const GREEN = rgb(0.05, 0.55, 0.3);

// Las fuentes estándar del PDF (WinAnsi) no tienen algunos caracteres: se reemplazan.
const safe = (s: string) => s.replace(/[•·]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E -ÿ]/g, "");

function text(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size: number, color = INK) {
  page.drawText(safe(s), { x, y, size, font, color });
}
function rightText(page: PDFPage, s: string, right: number, y: number, font: PDFFont, size: number, color = INK) {
  const v = safe(s);
  page.drawText(v, { x: right - font.widthOfTextAtSize(v, size), y, size, font, color });
}
function wrap(s: string, font: PDFFont, size: number, width: number) {
  const words = safe(s).split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderReceiptPdf(data: ReceiptData, logoPng?: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Comprobante ${data.number} - DigiBot`);
  pdf.setAuthor("DigiBot");
  pdf.setCreator("DigiBot (digibotlatam.com)");
  const page = pdf.addPage([595.28, 841.89]); // A4
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const L = 48;
  const R = 595.28 - 48;
  const W = R - L;

  // Franja superior
  page.drawRectangle({ x: 0, y: 841.89 - 10, width: 595.28, height: 10, color: BLUE });

  // Encabezado: logo + título
  let y = 770;
  if (logoPng) {
    const logo = await pdf.embedPng(logoPng);
    const h = 34;
    page.drawImage(logo, { x: L - 4, y: y - 6, width: (logo.width / logo.height) * h, height: h });
  } else {
    text(page, "DigiBot", L, y, bold, 24, BLUE);
  }
  rightText(page, "COMPROBANTE DE PAGO", R, y + 14, bold, 15);
  rightText(page, `N° ${data.number}`, R, y - 2, regular, 10, MUTED);
  y -= 34;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: LINE });

  // Emisor / Cliente
  y -= 26;
  const col2 = L + W / 2 + 10;
  text(page, "EMITIDO POR", L, y, bold, 8.5, MUTED);
  text(page, "CLIENTE", col2, y, bold, 8.5, MUTED);
  y -= 16;
  const issuer = ["DigiBot", LEGAL_OWNER.name, LEGAL_OWNER.taxId, LEGAL_OWNER.location, "digibotlatam.com"];
  const country = isBillingCountry(data.country) ? BILLING_COUNTRIES[data.country].name : data.country;
  const client = [data.accountName, `Cuenta N° ${data.accountId}`, country];
  if (data.holder) client.push(`Titular: ${data.holder.name}`, ...(data.holder.document ? [data.holder.document] : []), ...(data.holder.email ? [data.holder.email] : []));
  const rows = Math.max(issuer.length, client.length);
  for (let i = 0; i < rows; i++) {
    if (issuer[i]) text(page, issuer[i], L, y, i === 0 ? bold : regular, 10.5, i === 0 ? INK : MUTED);
    if (client[i]) text(page, client[i], col2, y, i === 0 ? bold : regular, 10.5, i === 0 ? INK : MUTED);
    y -= 15;
  }

  // Datos del pago
  y -= 14;
  const paidOn = new Date(data.paidAt * 1000);
  const paidStr = paidOn.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
  const facts: [string, string][] = [
    ["Fecha de pago", `${paidStr} (hora de Argentina)`],
    ["Medio de pago", data.card ?? "Tarjeta"],
    ["Procesado por", "dLocal Go"],
    ["ID de operación", data.dlocalPaymentId ?? "-"],
    ["Estado", "Pagado"],
  ];
  page.drawRectangle({ x: L, y: y - facts.length * 17 - 6, width: W, height: facts.length * 17 + 20, color: SOFT });
  y -= 6;
  for (const [k, v] of facts) {
    text(page, k, L + 14, y - 4, regular, 10, MUTED);
    text(page, v, L + 150, y - 4, k === "Estado" ? bold : regular, 10, k === "Estado" ? GREEN : INK);
    y -= 17;
  }

  // Detalle
  y -= 32;
  text(page, "DETALLE", L, y, bold, 8.5, MUTED);
  y -= 12;
  page.drawRectangle({ x: L, y: y - 18, width: W, height: 22, color: BLUE });
  text(page, "Concepto", L + 12, y - 11, bold, 10, rgb(1, 1, 1));
  text(page, "Período", L + 300, y - 11, bold, 10, rgb(1, 1, 1));
  rightText(page, "Importe", R - 12, y - 11, bold, 10, rgb(1, 1, 1));
  y -= 40;
  const conceptLines = wrap(data.concept, regular, 10.5, 280);
  conceptLines.forEach((l, i) => text(page, l, L + 12, y - i * 13, regular, 10.5));
  if (data.period) {
    text(page, `Del ${shortDate(data.period.start)}`, L + 300, y, regular, 10);
    text(page, `al ${shortDate(data.period.end)}`, L + 300, y - 13, regular, 10);
  } else {
    text(page, "-", L + 300, y, regular, 10);
  }
  rightText(page, formatMoney(data.amount, data.currency), R - 12, y, regular, 10.5);
  y -= Math.max(conceptLines.length, data.period ? 2 : 1) * 13 + 14;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: LINE });

  // Total
  y -= 28;
  text(page, "TOTAL PAGADO", R - 250, y, bold, 11, MUTED);
  rightText(page, formatMoney(data.amount, data.currency), R - 12, y - 2, bold, 18, BLUE);

  // Factura (cuando esté ARCA)
  y -= 44;
  text(page, data.invoiceRef ? `Factura asociada: ${data.invoiceRef}` : "La factura electrónica se emite por separado.", L, y, regular, 9.5, MUTED);

  // Pie
  const foot = 70;
  page.drawLine({ start: { x: L, y: foot + 26 }, end: { x: R, y: foot + 26 }, thickness: 1, color: LINE });
  text(page, "Documento no válido como factura. Comprobante del pago recibido por DigiBot.", L, foot + 10, bold, 9, INK);
  text(page, "Consultas: info@digibotlatam.com - digibotlatam.com", L, foot - 4, regular, 9, MUTED);
  rightText(page, `Emitido el ${new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`, R, foot - 4, regular, 9, MUTED);
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 6, color: BLUE });

  return pdf.save();
}

export function receiptFileName(data: Pick<ReceiptData, "number">) {
  return `comprobante-digibot-${data.number}.pdf`;
}
