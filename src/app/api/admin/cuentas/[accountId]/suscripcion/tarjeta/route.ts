// POST: "Pagar con otra tarjeta". Crea un pago nuevo (allow_transparent + allow_recurring)
// por el próximo período impago y devuelve el checkout para SmartFields. Al aprobarse,
// reemplaza el token guardado. Disponible también para una cuenta suspendida (así se reactiva).

import { NextRequest, NextResponse } from "next/server";
import { startCardUpdate } from "@/lib/billing/engine";
import { billingErrorResponse, billingUnavailable, tooManyRequests } from "@/lib/billing/http";
import { getBillingDeps } from "@/lib/billing/runtime";
import { requireAccountApi } from "@/lib/crm/api-auth";
import { hitRateLimit } from "@/lib/crm/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "settings", { allowBillingLocked: true });
  if (auth.response) return auth.response;
  if (hitRateLimit(`billing:card:${auth.accountId}`, 10, 15 * 60 * 1000)) return tooManyRequests();
  const deps = getBillingDeps();
  if (!deps) return billingUnavailable();
  try {
    return NextResponse.json({ checkout: await startCardUpdate(deps, auth.accountId) });
  } catch (err) {
    return billingErrorResponse(err);
  }
}
