// Panel de cobros (solo superadmins): suscripciones, pagos fallidos y MRR.

import { NextResponse } from "next/server";
import { buildAdminOverview } from "@/lib/billing/admin";
import { getMySqlBillingRepo } from "@/lib/billing/repo-mysql";
import { notConfigured } from "@/lib/crm/api-auth";
import { getMySqlAccountsRepo } from "@/lib/crm/accounts-mysql";
import { requireSuperadmin } from "@/lib/crm/superadmin-api";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSuperadmin();
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  try {
    const names = new Map((await getMySqlAccountsRepo().list()).map((a) => [a.id, a.name]));
    return NextResponse.json(await buildAdminOverview(getMySqlBillingRepo(), names));
  } catch (err) {
    console.error("[billing] panel de cobros:", err);
    return NextResponse.json({ error: "server_error", message: "No se pudieron cargar los cobros (¿falta la migración 0017?)." }, { status: 500 });
  }
}
