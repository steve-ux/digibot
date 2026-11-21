import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/billing/config";
import { changePlan, prorate, retryNow, runBillingCycle, setCancelAtPeriodEnd, startCardUpdate } from "@/lib/billing/engine";
import { confirmCheckout, handleNotification, startCheckout } from "@/lib/billing/service";
import { decryptSecret } from "@/lib/crypto";
import { HOLDER, TEST_KEY, makeBilling } from "./helpers/billing";

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

// Cuenta con suscripción activa dada de alta el 20/11 (próximo cobro 20/12).
async function subscribed(planKey = "premium") {
  const b = makeBilling({ today: "2026-11-20" });
  const accountId = await b.accounts.create("Panadería Lola");
  const start = await startCheckout(b.deps, { accountId }, { planKey, country: "AR" }, async () => false);
  await confirmCheckout(b.deps, { ref: start.ref, cardToken: "ok", brand: "visa", ...HOLDER });
  const sub = (await b.repo.getCurrentForAccount(accountId))!;
  b.log.approved.length = 0;
  return { ...b, accountId, subId: sub.id, firstToken: start.checkoutToken };
}

const recurringCalls = (b: ReturnType<typeof makeBilling>) => b.dlocal.calls.filter((c) => c.path.startsWith("/v1/payments/recurring/"));

describe("cobro mensual", () => {
  it("no cobra antes del vencimiento", async () => {
    const b = await subscribed();
    b.clock.today = "2026-12-19";
    await runBillingCycle(b.deps);
    expect(recurringCalls(b)).toHaveLength(0);
  });

  it("exitoso: cobra con el token guardado, renueva el período y manda el comprobante", async () => {
    const b = await subscribed();
    b.clock.today = "2026-12-20";
    const report = await runBillingCycle(b.deps);
    expect(report.charged).toBe(1);

    const calls = recurringCalls(b);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe(`/v1/payments/recurring/${encodeURIComponent(b.firstToken)}`);
    expect(calls[0].body).toMatchObject({ amount: 30000, order_id: `SUB-${b.subId}-202612-1` });

    const sub = (await b.repo.getSubscription(b.subId))!;
    expect(sub).toMatchObject({ status: "active", periodStart: "2026-12-20", periodEnd: "2027-01-20", nextChargeOn: "2027-01-20", failedAttempts: 0 });
    expect(b.log.approved.map((p) => p.orderId)).toEqual([`SUB-${b.subId}-202612-1`]);
    expect(b.repo.events.filter((e) => e.type === "PaymentApproved")).toHaveLength(2);
  });

  it("sin cobros dobles: correr el ciclo varias veces el mismo día cobra una sola vez", async () => {
    const b = await subscribed();
    b.clock.today = "2026-12-20";
    await Promise.all([runBillingCycle(b.deps), runBillingCycle(b.deps)]);
    await runBillingCycle(b.deps);
    expect(recurringCalls(b)).toHaveLength(1);
    expect(b.repo.payments.filter((p) => p.kind === "renewal")).toHaveLength(1);
  });

  it("sin cobros dobles: si se cortó la respuesta, reintenta con el MISMO order_id y dLocal no cobra dos veces", async () => {
    const b = await subscribed();
    b.clock.today = "2026-12-20";
    const original = b.dlocal.handle.bind(b.dlocal);
    let cut = true;
    // La primera vez dLocal cobra pero la respuesta no llega (el fetch falla después de procesar).
    b.dlocal.handle = async (url, init) => {
      const res = await original(url, init);
      if (cut && url.includes("/recurring/")) {
        cut = false;
        throw new TypeError("fetch failed");
      }
      return res;
    };

    await runBillingCycle(b.deps);
    const renewal = b.repo.payments.find((p) => p.kind === "renewal")!;
    expect(renewal.status).toBe("unknown");

    await runBillingCycle(b.deps); // reenvía el mismo order_id -> dLocal responde 904
    const orderIds = recurringCalls(b).map((c) => (c.body as { order_id: string }).order_id);
    expect(orderIds).toEqual([`SUB-${b.subId}-202612-1`, `SUB-${b.subId}-202612-1`]);
    expect([...b.dlocal.payments.values()].filter((p) => p.order_id === `SUB-${b.subId}-202612-1`)).toHaveLength(1);

    // La notificación de dLocal cierra el cobro.
    const remote = [...b.dlocal.payments.values()].find((p) => p.order_id === `SUB-${b.subId}-202612-1`)!;
    await handleNotification(b.deps, JSON.stringify({ payment_id: remote.id }));
    expect((await b.repo.getSubscription(b.subId))?.periodEnd).toBe("2027-01-20");
  });

  it("fallido: reintenta los días 1, 3 y 5, avisa en cada fallo y suspende a los 7 días", async () => {
    const b = await subscribed();
    b.dlocal.failRecurring = "INSUFFICIENT_FUNDS";
    const due = "2026-12-20";

    for (let d = 0; d <= 8; d++) {
      b.clock.today = addDays(due, d);
      await runBillingCycle(b.deps);
    }
    const orderIds = recurringCalls(b).map((c) => (c.body as { order_id: string }).order_id);
    expect(orderIds).toEqual([1, 2, 3, 4].map((n) => `SUB-${b.subId}-202612-${n}`));
    const days = b.repo.payments.filter((p) => p.kind === "renewal").map((p) => p.orderId);
    expect(days).toHaveLength(4);
    expect(b.log.failed.map((f) => f.nextRetryOn)).toEqual(["2026-12-21", "2026-12-23", "2026-12-25", null]);
    expect(b.log.failed[0].redirectUrl).toContain("checkout-sbx.dlocalgo.com");

    const sub = (await b.repo.getSubscription(b.subId))!;
    expect(sub.status).toBe("suspended");
    expect(sub.failedAttempts).toBe(4);
    expect(b.log.suspended).toEqual([b.subId]);
    expect(b.log.access.at(-1)).toEqual({ accountId: b.accountId, enabled: false, reason: "billing_suspended" });
    expect((await b.accounts.get(b.accountId))?.status).toBe("suspended");
  });

  it("suspendida: paga con otra tarjeta (SmartFields), reemplaza el token y se reactiva todo", async () => {
    const b = await subscribed();
    b.dlocal.failRecurring = "CARD_EXPIRED";
    for (let d = 0; d <= 7; d++) {
      b.clock.today = addDays("2026-12-20", d);
      await runBillingCycle(b.deps);
    }
    expect((await b.repo.getSubscription(b.subId))?.status).toBe("suspended");

    b.clock.today = "2026-12-28";
    const co = await startCardUpdate(b.deps, b.accountId);
    const created = b.dlocal.calls.filter((c) => c.path === "/v1/payments").at(-1)!.body as Record<string, unknown>;
    expect(created).toMatchObject({ allow_transparent: true, allow_recurring: true, amount: 30000, order_id: `SUB-${b.subId}-202612-CARD1` });
    await confirmCheckout(b.deps, { ref: co.ref, cardToken: "ok", brand: "mastercard", ...HOLDER });

    const sub = (await b.repo.getSubscription(b.subId))!;
    expect(sub).toMatchObject({ status: "active", periodStart: "2026-12-20", periodEnd: "2027-01-20", failedAttempts: 0, pastDueSince: null, cardBrand: "mastercard" });
    expect(decryptSecret(sub.cardTokenEnc!)).toBe(co.checkoutToken);
    expect(co.checkoutToken).not.toBe(b.firstToken);
    expect(b.log.access.at(-1)).toEqual({ accountId: b.accountId, enabled: true, reason: null });
    expect(b.log.reactivated).toEqual([b.subId]);

    // El próximo cobro usa la tarjeta nueva.
    b.dlocal.failRecurring = null;
    b.clock.today = "2027-01-20";
    await runBillingCycle(b.deps);
    expect(recurringCalls(b).at(-1)!.path).toBe(`/v1/payments/recurring/${encodeURIComponent(co.checkoutToken)}`);
  });

  it("reintento manual del superadmin", async () => {
    const b = await subscribed();
    b.dlocal.failRecurring = "REJECTED_BY_BANK";
    b.clock.today = "2026-12-20";
    await runBillingCycle(b.deps);
    b.dlocal.failRecurring = null;
    expect(await retryNow(b.deps, b.subId)).toBe("charged");
    expect((await b.repo.getSubscription(b.subId))?.status).toBe("active");
  });
});

describe("tarjeta", () => {
  it("al día: pagar con otra tarjeta adelanta el próximo mes y reemplaza el token", async () => {
    const b = await subscribed();
    b.clock.today = "2026-12-01";
    const co = await startCardUpdate(b.deps, b.accountId);
    await confirmCheckout(b.deps, { ref: co.ref, cardToken: "ok", brand: "amex", ...HOLDER });
    const sub = (await b.repo.getSubscription(b.subId))!;
    expect(sub).toMatchObject({ periodStart: "2026-12-20", periodEnd: "2027-01-20", nextChargeOn: "2027-01-20", cardBrand: "amex" });
    expect(decryptSecret(sub.cardTokenEnc!)).toBe(co.checkoutToken);
  });
});

describe("cancelación", () => {
  it("se cancela al fin del período: no cobra y pausa panel y bot", async () => {
    const b = await subscribed();
    await setCancelAtPeriodEnd(b.deps, b.accountId, true);
    b.clock.today = "2026-12-19";
    await runBillingCycle(b.deps);
    expect((await b.repo.getSubscription(b.subId))?.status).toBe("active");

    b.clock.today = "2026-12-20";
    await runBillingCycle(b.deps);
    expect(recurringCalls(b)).toHaveLength(0);
    expect((await b.repo.getSubscription(b.subId))?.status).toBe("cancelled");
    expect(b.log.ended).toEqual([b.subId]);
    expect(b.log.access.at(-1)).toEqual({ accountId: b.accountId, enabled: false, reason: "subscription_ended" });
  });

  it("se puede arrepentir antes del fin del período", async () => {
    const b = await subscribed();
    await setCancelAtPeriodEnd(b.deps, b.accountId, true);
    await setCancelAtPeriodEnd(b.deps, b.accountId, false);
    b.clock.today = "2026-12-20";
    await runBillingCycle(b.deps);
    expect(recurringCalls(b)).toHaveLength(1);
  });
});

describe("cambio de plan", () => {
  it("mejora: cobra al instante la diferencia proporcional y cambia el plan", async () => {
    const b = await subscribed("premium"); // 30.000; período 20/11 -> 20/12 (30 días)
    b.clock.today = "2026-12-05"; // quedan 15 días
    const res = await changePlan(b.deps, b.accountId, "plus"); // 60.000
    expect(res).toEqual({ kind: "upgraded", charged: 15000, currency: "ARS" });
    expect(recurringCalls(b).at(-1)!.body).toMatchObject({ amount: 15000, order_id: `SUB-${b.subId}-202612-UP1` });
    const sub = (await b.repo.getSubscription(b.subId))!;
    expect(sub).toMatchObject({ planKey: "plus", amount: 60000, periodEnd: "2026-12-20" });

    b.clock.today = "2026-12-20";
    await runBillingCycle(b.deps);
    expect(recurringCalls(b).at(-1)!.body).toMatchObject({ amount: 60000 });
  });

  it("baja: no cobra nada ahora y el plan nuevo rige desde el próximo cobro", async () => {
    const b = await subscribed("plus");
    const res = await changePlan(b.deps, b.accountId, "basico");
    expect(res).toEqual({ kind: "downgrade_scheduled", effectiveOn: "2026-12-20" });
    expect(recurringCalls(b)).toHaveLength(0);
    expect((await b.repo.getSubscription(b.subId))?.planKey).toBe("plus");

    b.clock.today = "2026-12-20";
    await runBillingCycle(b.deps);
    expect(recurringCalls(b).at(-1)!.body).toMatchObject({ amount: 15000 });
    expect(await b.repo.getSubscription(b.subId)).toMatchObject({ planKey: "basico", amount: 15000, pendingPlanKey: null });
  });

  it("volver al plan actual anula la baja pendiente", async () => {
    const b = await subscribed("plus");
    await changePlan(b.deps, b.accountId, "basico");
    expect(await changePlan(b.deps, b.accountId, "plus")).toEqual({ kind: "downgrade_cancelled" });
    expect((await b.repo.getSubscription(b.subId))?.pendingPlanKey).toBeNull();
  });

  it("mejora rechazada: no cambia el plan", async () => {
    const b = await subscribed("basico");
    b.dlocal.failRecurring = "INSUFFICIENT_FUNDS";
    await expect(changePlan(b.deps, b.accountId, "plus")).rejects.toThrow(/fondos/);
    expect((await b.repo.getSubscription(b.subId))?.planKey).toBe("basico");
  });

  it("prorrateo redondeado según la moneda", () => {
    const sub = { periodStart: "2026-11-20", periodEnd: "2026-12-20", amount: 100, currency: "PYG" };
    expect(prorate({ ...sub, amount: 100000 }, 200000, "2026-12-10")).toBe(33333);
    expect(prorate({ ...sub, currency: "MXN", amount: 300 }, 600, "2026-12-10")).toBe(100);
  });
});
