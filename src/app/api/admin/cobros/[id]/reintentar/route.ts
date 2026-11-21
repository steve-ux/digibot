// POST: reintento manual del cobro de una suscripción en mora o suspendida (solo superadmins).
// Usa el mismo order_id del intento que corresponde: nunca cobra dos veces.

import { NextResponse } from "next/server";
import { retryNow } from "@/lib/billing/engine";
import { billingErrorResponse, billingUnavailable } from "@/lib/billing/http";
import { getBillingDeps } from "@/lib/billing/runtime";
import { parseId } from "@/lib/crm/api-auth";
import { requireSuperadmin } from "@/lib/crm/superadmin-api";

export const dynamic = "force-dynamic";

const MESSAGES = {
  charged: "Cobro aprobado: la suscripción quedó al día.",
  failed: "El cobro volvió a fallar. Se avisó al cliente.",
  skipped: "El cobro quedó pendiente en dLocal Go: se cierra solo con la notificación.",
};

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperadmin();
  if (auth.response) return auth.response;
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "not_found", message: "No existe." }, { status: 404 });
  const deps = getBillingDeps();
  if (!deps) return billingUnavailable();
  try {
    const result = await retryNow(deps, id);
    return NextResponse.json({ result, message: MESSAGES[result] });
  } catch (err) {
    return billingErrorResponse(err);
  }
}
