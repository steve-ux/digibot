// POST {cancel: true|false}: cancelar al fin del período (o arrepentirse antes).

import { NextRequest, NextResponse } from "next/server";
import { accountBillingOverview } from "@/lib/billing/account-api";
import { setCancelAtPeriodEnd } from "@/lib/billing/engine";
import { billingErrorResponse, billingUnavailable } from "@/lib/billing/http";
import { getBillingDeps } from "@/lib/billing/runtime";
import { requireAccountApi } from "@/lib/crm/api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "settings");
  if (auth.response) return auth.response;
  const deps = getBillingDeps();
  if (!deps) return billingUnavailable();
  const body = (await req.json().catch(() => ({}))) as { cancel?: unknown };
  try {
    await setCancelAtPeriodEnd(deps, auth.accountId, body.cancel !== false);
    return NextResponse.json({ overview: await accountBillingOverview(auth.accountId) });
  } catch (err) {
    return billingErrorResponse(err);
  }
}
