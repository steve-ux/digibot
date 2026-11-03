import { cookies } from "next/headers";
import MetricasView, { type MetricsLoadState } from "@/components/crm/metricas/MetricasView";
import { loadAccountPage } from "@/lib/crm/account-page";
import { DEMO_COOKIE } from "@/lib/crm/demo-cookie";
import { isMetricsPeriod, type MetricsPeriod } from "@/lib/crm/metrics";
import { loadMetrics } from "@/lib/crm/metrics-mysql";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

async function load(accountId: number, period: MetricsPeriod): Promise<MetricsLoadState> {
  if (!isDbConfigured()) return { kind: "error", message: "La base de datos no está configurada." };
  try {
    return { kind: "ready", report: await loadMetrics(accountId, period) };
  } catch (err) {
    console.error("[crm] No se pudieron calcular las métricas:", err);
    return {
      kind: "error",
      message: "No se pudieron calcular las métricas. Si es la primera vez, falta correr la migración 0009 (npm run db:migrate).",
    };
  }
}

export default async function MetricasPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ accountId }, query] = await Promise.all([params, searchParams]);
  const { account } = await loadAccountPage(accountId, "metrics");
  const period: MetricsPeriod = isMetricsPeriod(query.periodo) ? query.periodo : "7d";
  const demo = (await cookies()).get(DEMO_COOKIE)?.value === "1";
  const initialState: MetricsLoadState = demo ? { kind: "loading" } : await load(account.id, period);
  return <MetricasView accountId={account.id} initialPeriod={period} initialState={initialState} />;
}
