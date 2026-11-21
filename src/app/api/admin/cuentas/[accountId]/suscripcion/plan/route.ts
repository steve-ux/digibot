// POST {planKey}: mejora (cobra ya la diferencia proporcional) o baja (rige desde el próximo cobro).

import { NextRequest, NextResponse } from "next/server";
import { accountBillingOverview } from "@/lib/billing/account-api";
import { changePlan } from "@/lib/billing/engine";
import { billingErrorResponse, billingUnavailable } from "@/lib/billing/http";
import { getBillingDeps } from "@/lib/billing/runtime";
import { requireAccountApi } from "@/lib/crm/api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "settings");
  if (auth.response) return auth.response;
  const deps = getBillingDeps();
  if (!deps) return billingUnavailable();
  const body = (await req.json().catch(() => ({}))) as { planKey?: unknown };
  try {
    const result = await changePlan(deps, auth.accountId, typeof body.planKey === "string" ? body.planKey : "");
    return NextResponse.json({ result, overview: await accountBillingOverview(auth.accountId) });
  } catch (err) {
    return billingErrorResponse(err);
  }
}
