// Plan vigente de una cuenta y control de lo que habilita. Server-only.

import { NextResponse } from "next/server";
import { isDbConfigured } from "../db";
import { providerLockReason, type Provider } from "./entitlements";
import { getMySqlBillingRepo } from "./repo-mysql";

// planKey de la suscripción viva (active/past_due/suspended), o null si la cuenta no
// tiene suscripción de dLocal Go (cuenta manual/interna: sin límites).
export async function accountPlanKey(accountId: number): Promise<string | null> {
  if (!isDbConfigured()) return null;
  try {
    const sub = await getMySqlBillingRepo().getCurrentForAccount(accountId);
    return sub && sub.status !== "cancelled" ? sub.planKey : null;
  } catch (err) {
    // Sin la migración 0017 no hay límites.
    console.error("[billing] No se pudo leer el plan de la cuenta:", (err as Error).message);
    return null;
  }
}

// Para las APIs de conexión de canales: 403 si el plan no incluye ese canal.
export async function planDenied(accountId: number, provider: Provider): Promise<NextResponse | null> {
  const reason = providerLockReason(await accountPlanKey(accountId), provider);
  if (!reason) return null;
  return NextResponse.json({ error: "plan_limit", message: `Tu plan no incluye este canal. ${reason}` }, { status: 403 });
}

export async function lockedProviders(accountId: number): Promise<Partial<Record<Provider, string>>> {
  const planKey = await accountPlanKey(accountId);
  const out: Partial<Record<Provider, string>> = {};
  for (const p of ["whatsapp", "instagram", "facebook", "threads", "tiktok"] as Provider[]) {
    const reason = providerLockReason(planKey, p);
    if (reason) out[p] = reason;
  }
  return out;
}
