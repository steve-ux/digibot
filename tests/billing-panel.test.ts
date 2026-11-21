import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAdminOverview } from "@/lib/billing/admin";
import { changePlan, runBillingCycle, startCardUpdate } from "@/lib/billing/engine";
import { featuresLost, providerAllowed, providerLockReason } from "@/lib/billing/entitlements";
import { buildOverview } from "@/lib/billing/overview";
import { getReceipt, renderReceiptPdf } from "@/lib/billing/receipt";
import { confirmCheckout, startCheckout } from "@/lib/billing/service";
import { HOLDER, TEST_KEY, makeBilling } from "./helpers/billing";

const PLANS = [
  { planKey: "basico", name: "Básico", tagline: "", features: ["Hasta 1.000 mensajes/mes", "WhatsApp Business"] },
  { planKey: "premium", name: "Premium", tagline: "", features: ["Hasta 5.000 mensajes/mes", "WhatsApp Business", "Universo META", "Integración con CRM"] },
  { planKey: "plus", name: "Plus+", tagline: "", features: ["Mensajes ilimitados", "WhatsApp Business", "Universo META", "Integración con Google Sheets"] },
];

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function subscribe(b: ReturnType<typeof makeBilling>, name: string, planKey: string) {
  const accountId = await b.accounts.create(name);
  const start = await startCheckout(b.deps, { accountId }, { planKey, country: "AR" }, async () => false);
  await confirmCheckout(b.deps, { ref: start.ref, cardToken: "ok", brand: "visa", ...HOLDER });
  return accountId;
}

describe("historial de pagos (Configuración → Suscripción)", () => {
  it("aislamiento: una cuenta nunca ve los pagos de otra", async () => {
    const b = makeBilling({ today: "2026-11-20" });
    const lola = await subscribe(b, "Panadería Lola", "premium");
    const sur = await subscribe(b, "Ferretería Sur", "plus");
    b.clock.today = "2026-12-20";
    await runBillingCycle(b.deps);

    const mine = await buildOverview(b.repo, lola, PLANS, b.clock.today);
    const theirs = await buildOverview(b.repo, sur, PLANS, b.clock.today);
    const mySubIds = new Set(b.repo.subscriptions.filter((s) => s.accountId === lola).map((s) => s.id));
    const myPaymentIds = new Set(b.repo.payments.filter((p) => mySubIds.has(p.subscriptionId)).map((p) => p.id));

    expect(mine.payments.length).toBe(2);
    expect(mine.payments.every((p) => myPaymentIds.has(p.id))).toBe(true);
    expect(theirs.payments.some((p) => myPaymentIds.has(p.id))).toBe(false);
    expect(mine.subscription?.planKey).toBe("premium");
    expect(theirs.subscription?.planKey).toBe("plus");
    // Una cuenta sin suscripción no ve nada de nadie.
    const nobody = await b.accounts.create("Sin plan");
    expect((await buildOverview(b.repo, nobody, PLANS, b.clock.today)).payments).toEqual([]);
  });

  it("de la última a la primera, sin checkouts abandonados, con los rechazos explicados", async () => {
    const b = makeBilling({ today: "2026-11-20" });
    const acc = await subscribe(b, "Panadería Lola", "premium");
    // Abrió "pagar con otra tarjeta" hace 2 horas y no lo terminó: no es un pago (y ya no frena el cobro automático).
    await startCardUpdate(b.deps, acc);
    b.repo.payments.at(-1)!.createdAt -= 2 * 3600;
    b.clock.today = "2026-12-20";
    b.dlocal.failRecurring = "INSUFFICIENT_FUNDS";
    await runBillingCycle(b.deps);

    const { payments } = await buildOverview(b.repo, acc, PLANS, b.clock.today);
    expect(payments.map((p) => [p.concept, p.status])).toEqual([
      ["Plan Premium · diciembre 2026", "rejected"],
      ["Alta del plan Premium", "paid"],
    ]);
    expect(payments[0].detail).toMatch(/fondos/);
  });

  it("opciones de cambio de plan: mejora con el cobro de hoy y baja con lo que se pierde", async () => {
    const b = makeBilling({ today: "2026-11-20" });
    const acc = await subscribe(b, "Panadería Lola", "premium");
    const { plans, subscription } = await buildOverview(b.repo, acc, PLANS, "2026-12-05");
    const byKey = Object.fromEntries(plans.map((p) => [p.planKey, p.change]));
    expect(byKey.premium).toEqual({ kind: "current" });
    expect(byKey.plus).toEqual({ kind: "upgrade", chargeToday: 15000 });
    expect(byKey.basico).toEqual({ kind: "downgrade", lost: ["Hasta 5.000 mensajes/mes", "Universo META", "Integración con CRM"], effectiveOn: "2026-12-20" });
    expect(subscription).toMatchObject({ card: { brand: "visa", last4: "1111" }, payWithNewCard: { amount: 30000, covers: "2026-12-20" } });

    await changePlan(b.deps, acc, "basico");
    const after = await buildOverview(b.repo, acc, PLANS, "2026-12-05");
    expect(after.plans.find((p) => p.planKey === "basico")?.change.kind).toBe("pending_downgrade");
    expect(after.subscription?.pendingPlan).toMatchObject({ planKey: "basico", amount: 15000 });
  });
});

describe("comprobante de pago (PDF)", () => {
  it("solo de pagos aprobados de la propia cuenta, y arma un PDF válido", async () => {
    const b = makeBilling({ today: "2026-11-20" });
    const lola = await subscribe(b, "Panadería Lola", "premium");
    const sur = await subscribe(b, "Ferretería Sur", "plus");
    // El alta guarda al titular (como lo devuelve GET /v1/payments).
    const initial = b.repo.payments.find((p) => p.kind === "initial" && b.repo.subscriptions.find((s) => s.id === p.subscriptionId)?.accountId === lola)!;
    initial.raw = { ...(initial.raw as object), payer: { first_name: "Juan", last_name: "Pérez", document_type: "DNI", document: "30123456", email: "juan@example.com" } };
    b.clock.today = "2026-12-20";
    await runBillingCycle(b.deps);
    const renewal = b.repo.payments.find((p) => p.kind === "renewal" && p.subscriptionId === initial.subscriptionId)!;
    const name = (k: string) => PLANS.find((p) => p.planKey === k)!.name;

    const receipt = await getReceipt(b.repo, lola, renewal.id, "Panadería Lola", name);
    expect(receipt).toMatchObject({
      number: `SUB-${initial.subscriptionId}-202612-1`,
      concept: "Suscripción DigiBot - Plan Premium (mensual)",
      period: { start: "2026-12-20", end: "2027-01-20" },
      amount: 30000,
      currency: "ARS",
      card: "Visa terminada en 1111",
      // La renovación no trae titular: se toma el del alta.
      holder: { name: "Juan Pérez", document: "DNI 30123456", email: "juan@example.com" },
    });

    // Otra cuenta no puede bajarlo.
    expect(await getReceipt(b.repo, sur, renewal.id, "Ferretería Sur", name)).toBeNull();
    // Un pago no aprobado no tiene comprobante.
    b.dlocal.failRecurring = "INSUFFICIENT_FUNDS";
    b.clock.today = "2027-01-20";
    await runBillingCycle(b.deps);
    const rejected = b.repo.payments.find((p) => p.status === "rejected")!;
    expect(await getReceipt(b.repo, lola, rejected.id, "Panadería Lola", name)).toBeNull();

    const pdf = await renderReceiptPdf(receipt!);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1500);
  });
});

describe("panel de cobros del superadmin", () => {
  it("MRR por moneda (activas y en mora), conteos y pagos fallidos", async () => {
    const b = makeBilling({ today: "2026-11-20" });
    const lola = await subscribe(b, "Panadería Lola", "premium");
    await subscribe(b, "Ferretería Sur", "plus");
    b.clock.today = "2026-12-20";
    b.dlocal.failRecurring = "CARD_EXPIRED";
    await runBillingCycle(b.deps);

    const names = new Map(b.accounts.accounts.map((a) => [a.id, a.name]));
    const admin = await buildAdminOverview(b.repo, names);
    expect(admin.mrr).toEqual([{ currency: "ARS", amount: 90000, subscriptions: 2 }]);
    expect(admin.counts.past_due).toBe(2);
    expect(admin.failedPayments).toHaveLength(2);
    expect(admin.failedPayments.find((p) => p.accountId === lola)).toMatchObject({ accountName: "Panadería Lola", reason: "La tarjeta está vencida." });
  });
});

describe("límites por plan", () => {
  it("cada plan habilita sus canales; sin suscripción no hay límites", () => {
    expect(providerAllowed("basico", "whatsapp")).toBe(true);
    expect(providerAllowed("basico", "instagram")).toBe(false);
    expect(providerLockReason("basico", "threads")).toBe("Disponible desde el plan Premium.");
    expect(providerAllowed("premium", "facebook")).toBe(true);
    expect(providerLockReason("premium", "tiktok")).toBe("Disponible desde el plan Plus+.");
    expect(providerAllowed("plus", "tiktok")).toBe(true);
    expect(providerAllowed(null, "instagram")).toBe(true);
  });

  it("lo que se pierde al bajar de plan", () => {
    expect(featuresLost(["A", "B", "C"], ["a", "C"])).toEqual(["B"]);
  });
});
