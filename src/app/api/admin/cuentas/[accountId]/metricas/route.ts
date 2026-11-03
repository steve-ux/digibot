import { NextRequest, NextResponse } from "next/server";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";
import { errorResponse } from "@/lib/crm/api-errors";
import { isMetricsPeriod } from "@/lib/crm/metrics";
import { loadMetrics } from "@/lib/crm/metrics-mysql";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/admin/cuentas/7/metricas?periodo=today|7d|30d — reporte agregado de la cuenta.
export async function GET(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "metrics");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const raw = req.nextUrl.searchParams.get("periodo");
  const period = isMetricsPeriod(raw) ? raw : "7d";
  try {
    return NextResponse.json({ report: await loadMetrics(auth.accountId, period) });
  } catch (err) {
    return errorResponse(err, "No se pudieron calcular las métricas.");
  }
}
