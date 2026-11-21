// POST /api/billing/checkout/confirm: confirma el pago con el cardToken de SmartFields.
// La tarjeta nunca llega acá: solo el token de un solo uso que generó el iframe de dLocal Go.
// Respuesta: {status: "paid" | "pending"} o {status: "redirect", redirectUrl} (3DS).

import { NextRequest, NextResponse } from "next/server";
import { billingErrorResponse, billingUnavailable, tooManyRequests } from "@/lib/billing/http";
import { getBillingDeps } from "@/lib/billing/runtime";
import { confirmCheckout } from "@/lib/billing/service";
import { clientIp, hitRateLimit } from "@/lib/crm/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (hitRateLimit(`billing:confirm:${clientIp(req.headers)}`, 20, 15 * 60 * 1000)) return tooManyRequests();
  const deps = getBillingDeps();
  if (!deps) return billingUnavailable();
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await confirmCheckout(deps, body));
  } catch (err) {
    return billingErrorResponse(err);
  }
}
