// POST /api/billing/checkout: crea el pago en dLocal Go (allow_transparent + allow_recurring)
// y devuelve el merchant_checkout_token para inicializar SmartFields.
//
//   - Con sesión de admin: la suscripción es de su cuenta.
//   - Superadmin: de la cuenta que indique (accountId), o un alta nueva si no indica ninguna.
//   - Sin sesión: cliente nuevo desde la web (signup: {businessName, name, email}).

import { NextRequest, NextResponse } from "next/server";
import { billingErrorResponse, billingUnavailable, tooManyRequests } from "@/lib/billing/http";
import { getBillingDeps, isEmailTaken } from "@/lib/billing/runtime";
import { startCheckout } from "@/lib/billing/service";
import { forbidden } from "@/lib/crm/api-auth";
import { clientIp, hitRateLimit } from "@/lib/crm/rate-limit";
import { getCurrentUser } from "@/lib/crm/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (hitRateLimit(`billing:start:${clientIp(req.headers)}`, 15, 15 * 60 * 1000)) return tooManyRequests();
  const deps = getBillingDeps();
  if (!deps) return billingUnavailable();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const user = await getCurrentUser();
  let accountId: number | null = null;
  if (user) {
    if (user.role === "superadmin") {
      const requested = Number(body.accountId);
      accountId = Number.isSafeInteger(requested) && requested > 0 ? requested : null;
      if (accountId !== null && !(await deps.accounts.get(accountId))) return NextResponse.json({ error: "not_found", message: "La cuenta no existe." }, { status: 404 });
    } else if (user.role === "admin") {
      accountId = user.accountId;
    } else {
      return forbidden("Solo quien administra la cuenta puede contratar un plan.");
    }
  }

  try {
    const result = await startCheckout(deps, { accountId }, body, isEmailTaken);
    return NextResponse.json({ checkout: result });
  } catch (err) {
    return billingErrorResponse(err);
  }
}
