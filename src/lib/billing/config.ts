// Configuración del cobro con dLocal Go. Sin imports de servidor: la usan el
// backend y el checkout (países, documentos). Las claves secretas se leen solo
// en dlocalgo-env.ts (server-only).

// Países habilitados (El Salvador no: dLocal Go no lo tiene disponible).
export const BILLING_COUNTRIES = {
  AR: { name: "Argentina", currency: "ARS", documents: ["DNI", "CUIT", "CUIL"] },
  BR: { name: "Brasil", currency: "BRL", documents: ["CPF", "CNPJ"] },
  CL: { name: "Chile", currency: "CLP", documents: ["RUN", "RUT"] },
  CO: { name: "Colombia", currency: "COP", documents: ["CC", "NIT", "CE", "PASS"] },
  MX: { name: "México", currency: "MXN", documents: ["CURP", "RFC", "IFE", "PASS"] },
  PE: { name: "Perú", currency: "PEN", documents: ["DNI", "CE", "PASS", "RUC"] },
  PY: { name: "Paraguay", currency: "PYG", documents: ["CI", "RUC"] },
  UY: { name: "Uruguay", currency: "UYU", documents: ["CI", "RUT"] },
} as const;

export type BillingCountry = keyof typeof BILLING_COUNTRIES;

export const DOCUMENT_LABELS: Record<string, string> = {
  DNI: "DNI",
  CUIT: "CUIT",
  CUIL: "CUIL",
  CPF: "CPF",
  CNPJ: "CNPJ",
  RUN: "RUN",
  RUT: "RUT",
  CC: "Cédula de ciudadanía",
  NIT: "NIT",
  CE: "Cédula de extranjería",
  PASS: "Pasaporte",
  CURP: "CURP",
  RFC: "RFC",
  IFE: "INE / IFE",
  RUC: "RUC",
  CI: "Cédula de identidad",
};

export function isBillingCountry(value: unknown): value is BillingCountry {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(BILLING_COUNTRIES, value);
}

// Monedas sin decimales para mostrar.
const ZERO_DECIMALS = new Set(["CLP", "COP", "PYG"]);

export function formatMoney(amount: number, currency: string) {
  const digits = ZERO_DECIMALS.has(currency) || Number.isInteger(amount) ? 0 : 2;
  return `$${amount.toLocaleString("es-AR", { minimumFractionDigits: digits, maximumFractionDigits: 2 })} ${currency}`;
}

// ---------- Fechas del período (todo en días calendario, formato YYYY-MM-DD) ----------
// Se cobra el mismo día del mes del alta. Si el mes no tiene ese día (29-31), el último.

export const BILLING_TIMEZONE = "America/Argentina/Buenos_Aires";

export function todayIn(tz = BILLING_TIMEZONE, now = new Date()): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addMonthsAnchored(date: string, months: number, anchorDay: number): string {
  const { y, m } = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(anchorDay, daysInMonth(ny, nm)))}`;
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function daysBetween(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

export const yyyymm = (date: string) => date.slice(0, 4) + date.slice(5, 7);
