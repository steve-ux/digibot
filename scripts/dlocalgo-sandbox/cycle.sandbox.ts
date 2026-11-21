// Integración: corre el ciclo de cobro real (MySQL + sandbox de dLocal Go) "adelantando"
// la fecha al próximo cobro de la suscripción de prueba. SOLO sandbox.
import { expect, it } from "vitest";
import { runBillingCycle } from "@/lib/billing/engine";
import { getBillingDeps } from "@/lib/billing/runtime";

it("cobra la renovación de la suscripción de prueba en sandbox", async () => {
  expect(process.env.DLOCALGO_ENV).toBe("sandbox");
  const deps = getBillingDeps()!;
  expect(deps.dlocal.env).toBe("sandbox");
  const subId = Number(process.env.SBX_SUB_ID || 1);
  const before = (await deps.repo.getSubscription(subId))!;
  console.log("antes:", before.status, before.periodStart, "->", before.periodEnd, "próximo:", before.nextChargeOn);
  deps.today = () => before.nextChargeOn!;
  const report = await runBillingCycle(deps);
  console.log("ciclo:", report);
  const after = (await deps.repo.getSubscription(subId))!;
  console.log("después:", after.status, after.periodStart, "->", after.periodEnd, "próximo:", after.nextChargeOn);
  const payments = await deps.repo.listPayments([subId]);
  console.log(payments.map((p) => `${p.orderId} ${p.kind} ${p.status} ${p.dlocalPaymentId}`).join("\n"));
  expect(after.periodStart).toBe(before.periodEnd);
  // Segunda corrida el mismo "día": no cobra de nuevo.
  const again = await runBillingCycle(deps);
  expect(again.charged).toBe(0);
});
