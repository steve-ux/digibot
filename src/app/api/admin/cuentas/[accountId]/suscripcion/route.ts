// GET: plan, tarjeta, próximo cobro e historial de pagos de la cuenta (solo de esta cuenta).
// Lo puede ver una cuenta suspendida por falta de pago (es donde paga).

import { NextResponse } from "next/server";
import { accountBillingOverview } from "@/lib/billing/account-api";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "settings", { allowBillingLocked: true });
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  try {
    return NextResponse.json(await accountBillingOverview(auth.accountId));
  } catch (err) {
    console.error("[billing] resumen de la cuenta:", err);
    return NextResponse.json({ error: "server_error", message: "No se pudo cargar la suscripción." }, { status: 500 });
  }
}
