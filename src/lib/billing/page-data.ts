// Datos para las páginas públicas de suscripción. Server-only.

import { getCurrentUser } from "../crm/session";
import { getPlans, type Plan } from "../pricing-plans";
import { BILLING_COUNTRIES, isBillingCountry, type BillingCountry } from "./config";
import { dlocalEnv } from "./dlocalgo";
import { getMySqlBillingRepo } from "./repo-mysql";
import { getBillingDeps } from "./runtime";

export type CountryPrices = Partial<Record<BillingCountry, { amount: number; currency: string }>>;

export async function pricesByPlan(): Promise<Record<string, CountryPrices>> {
  const out: Record<string, CountryPrices> = {};
  try {
    for (const p of await getMySqlBillingRepo().listPrices()) {
      if (!isBillingCountry(p.country) || BILLING_COUNTRIES[p.country].currency !== p.currency) continue;
      (out[p.planKey] ??= {})[p.country] = { amount: p.amount, currency: p.currency };
    }
  } catch (err) {
    console.error("[billing] No se pudieron leer los precios (¿falta la migración 0017?):", (err as Error).message);
  }
  return out;
}

// ¿Se puede contratar online este plan? (cobro configurado y al menos un país con precio)
export async function onlinePlanKeys(): Promise<Set<string>> {
  if (!getBillingDeps()) return new Set();
  const prices = await pricesByPlan();
  return new Set(Object.keys(prices).filter((k) => Object.keys(prices[k]).length > 0));
}

export type CheckoutMode =
  | { kind: "signup" }
  | { kind: "account"; accountId: number; accountName: string }
  | { kind: "forbidden"; message: string };

export interface CheckoutPageData {
  plan: Plan;
  prices: CountryPrices;
  mode: CheckoutMode;
  available: boolean;
  sandbox: boolean;
}

export async function loadCheckoutPage(planKey: string, accountParam?: string): Promise<CheckoutPageData | null> {
  const plan = (await getPlans()).find((p) => p.planKey === planKey);
  if (!plan) return null;
  const deps = getBillingDeps();
  const prices = (await pricesByPlan())[planKey] ?? {};
  const user = await getCurrentUser().catch(() => null);

  let mode: CheckoutMode = { kind: "signup" };
  if (user?.role === "admin" && user.accountId !== null) {
    const account = deps ? await deps.accounts.get(user.accountId) : null;
    mode = { kind: "account", accountId: user.accountId, accountName: account?.name ?? `Cuenta ${user.accountId}` };
  } else if (user?.role === "superadmin" && accountParam && /^\d+$/.test(accountParam)) {
    const account = deps ? await deps.accounts.get(Number(accountParam)) : null;
    if (account) mode = { kind: "account", accountId: account.id, accountName: account.name };
  } else if (user && user.role !== "superadmin") {
    mode = { kind: "forbidden", message: "Solo quien administra la cuenta puede contratar o cambiar el plan." };
  }

  return { plan, prices, mode, available: Boolean(deps) && Object.keys(prices).length > 0, sandbox: dlocalEnv() === "sandbox" };
}
