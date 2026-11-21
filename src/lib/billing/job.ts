// Job del cobro recurrente (lo arranca el scheduler en segundo plano). Server-only.
//
// Corre cada hora, pero cobra recién desde BILLING_RUN_HOUR (por defecto 9, hora de
// Argentina), para que los cobros y los mails no salgan de madrugada. Es idempotente:
// correrlo varias veces el mismo día no cobra dos veces (order_id único + lock global).

import { BILLING_TIMEZONE } from "./config";
import { runBillingCycle } from "./engine";
import { getBillingDeps } from "./runtime";

function localHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: BILLING_TIMEZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
}

export async function runBillingJob(opts: { force?: boolean } = {}) {
  const deps = getBillingDeps();
  if (!deps) return null;
  const runHour = Number(process.env.BILLING_RUN_HOUR ?? 9);
  if (!opts.force && localHour() < runHour) return null;
  // Un solo proceso a la vez corre el ciclo (si hay varias réplicas del server).
  const report = await deps.repo.withLock("cycle", () => runBillingCycle(deps));
  if (report.charged || report.failed || report.suspended || report.ended) {
    console.info(`[billing] Ciclo: ${report.charged} cobrados, ${report.failed} fallidos, ${report.suspended} suspendidas, ${report.ended} terminadas.`);
  }
  return report;
}
