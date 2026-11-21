// Tanda 4: lo que protege la plata. Entorno (nunca cobrar de verdad por un olvido),
// recuperación de pagos aplicados a medias, endpoint de notificaciones y horario del job.

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDlocalConfig } from "@/lib/billing/dlocalgo";
import { runBillingCycle, startCardUpdate } from "@/lib/billing/engine";
import { confirmCheckout, handleNotification, startCheckout } from "@/lib/billing/service";
import { TEST_CONFIG } from "./helpers/dlocal-fake";
import { HOLDER, TEST_KEY, makeBilling } from "./helpers/billing";

// El endpoint y el job leen las dependencias reales de runtime.ts: acá se reemplazan por las de memoria.
const runtime = vi.hoisted(() => ({ deps: null as ReturnType<typeof makeBilling>["deps"] | null }));
vi.mock("@/lib/billing/runtime", () => ({ getBillingDeps: () => runtime.deps }));

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
  runtime.deps = null;
});

function stubSandboxKeys() {
  vi.stubEnv("DLOCALGO_API_KEY_SANDBOX", TEST_CONFIG.apiKey);
  vi.stubEnv("DLOCALGO_API_SECRET_SANDBOX", TEST_CONFIG.apiSecret);
  vi.stubEnv("DLOCALGO_SMARTFIELDS_KEY_SANDBOX", TEST_CONFIG.smartFieldsKey);
}

async function subscribed() {
  const b = makeBilling({ today: "2026-11-20" });
  const accountId = await b.accounts.create("Panadería Lola");
  const start = await startCheckout(b.deps, { accountId }, { planKey: "premium", country: "AR" }, async () => false);
  await confirmCheckout(b.deps, { ref: start.ref, cardToken: "ok", brand: "visa", ...HOLDER });
  const sub = (await b.repo.getCurrentForAccount(accountId))!;
  b.log.approved.length = 0;
  return { ...b, accountId, subId: sub.id };
}

// Hace fallar la próxima escritura de la suscripción (el proceso "se cae" a mitad de camino).
function crashNextSubscriptionWrite(b: ReturnType<typeof makeBilling>) {
  const original = b.repo.updateSubscription.bind(b.repo);
  vi.spyOn(b.repo, "updateSubscription").mockImplementationOnce(async () => {
    throw new Error("se cortó la conexión con la base");
  });
  return original;
}

const approvedEvents = (b: ReturnType<typeof makeBilling>) => b.repo.events.filter((e) => e.type === "PaymentApproved");

describe("entorno de dLocal Go", () => {
  it("por defecto es sandbox y usa solo las variables *_SANDBOX", () => {
    stubSandboxKeys();
    vi.stubEnv("DLOCALGO_API_KEY", "clave-de-produccion");
    vi.stubEnv("DLOCALGO_API_SECRET", "secreto-de-produccion");
    vi.stubEnv("DLOCALGO_SMARTFIELDS_KEY", "sf-produccion");
    const config = getDlocalConfig();
    expect(config).toMatchObject({ env: "sandbox", apiUrl: "https://api-sbx.dlocalgo.com", apiKey: TEST_CONFIG.apiKey });
    expect(config?.sdkUrl).toContain("checkout-sbx.");
  });

  it("production usa las variables sin sufijo y la API productiva", () => {
    vi.stubEnv("DLOCALGO_ENV", "production");
    vi.stubEnv("DLOCALGO_API_KEY", "k");
    vi.stubEnv("DLOCALGO_API_SECRET", "s");
    vi.stubEnv("DLOCALGO_SMARTFIELDS_KEY", "sf");
    stubSandboxKeys();
    expect(getDlocalConfig()).toMatchObject({ env: "production", apiUrl: "https://api.dlocalgo.com", apiKey: "k" });
  });

  it("candado: si el entorno no coincide con la URL, o faltan claves, el cobro queda apagado", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubSandboxKeys();
    vi.stubEnv("DLOCALGO_API_URL_SANDBOX", "https://api.dlocalgo.com");
    expect(getDlocalConfig()).toBeNull();

    vi.stubEnv("DLOCALGO_ENV", "production");
    vi.stubEnv("DLOCALGO_API_KEY", "k");
    vi.stubEnv("DLOCALGO_API_SECRET", "s");
    vi.stubEnv("DLOCALGO_SMARTFIELDS_KEY", "sf");
    vi.stubEnv("DLOCALGO_API_URL", "https://api-sbx.dlocalgo.com");
    expect(getDlocalConfig()).toBeNull();

    vi.unstubAllEnvs();
    vi.stubEnv("DLOCALGO_API_KEY_SANDBOX", "k"); // falta el secret y la clave de SmartFields
    expect(getDlocalConfig()).toBeNull();
  });
});

describe("pago aprobado que quedó aplicado a medias", () => {
  it("alta: la notificación termina de activar la suscripción, una sola vez", async () => {
    const b = makeBilling({ today: "2026-11-20" });
    const accountId = await b.accounts.create("Panadería Lola");
    const start = await startCheckout(b.deps, { accountId }, { planKey: "premium", country: "AR" }, async () => false);
    crashNextSubscriptionWrite(b);
    await expect(confirmCheckout(b.deps, { ref: start.ref, cardToken: "ok", brand: "visa", ...HOLDER })).rejects.toThrow();

    const payment = b.repo.payments.find((p) => p.publicRef === start.ref)!;
    expect(payment.status).toBe("paid"); // dLocal cobró…
    expect((await b.repo.getSubscription(payment.subscriptionId))?.status).toBe("incomplete"); // …pero no se activó
    expect(approvedEvents(b)).toHaveLength(0);

    const body = JSON.stringify({ payment_id: payment.dlocalPaymentId });
    await handleNotification(b.deps, body);
    await handleNotification(b.deps, body); // dLocal reintenta: no repite nada

    expect((await b.repo.getSubscription(payment.subscriptionId))?.status).toBe("active");
    expect(approvedEvents(b)).toHaveLength(1);
    expect(b.log.approved).toHaveLength(1);
    expect(b.dlocal.count("POST", "/v1/payments/confirm/")).toBe(1);
  });

  it("renovación: el ciclo siguiente lo termina de aplicar sin volver a cobrar", async () => {
    const b = await subscribed();
    b.clock.today = "2026-12-20";
    crashNextSubscriptionWrite(b);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await runBillingCycle(b.deps).catch(() => undefined);

    const renewal = b.repo.payments.find((p) => p.kind === "renewal")!;
    expect(renewal.status).toBe("paid");
    expect((await b.repo.getSubscription(b.subId))?.periodEnd).toBe("2026-12-20"); // sin aplicar

    await runBillingCycle(b.deps);
    await runBillingCycle(b.deps);

    const sub = (await b.repo.getSubscription(b.subId))!;
    expect(sub.periodEnd).toBe("2027-01-20");
    expect(b.dlocal.count("POST", "/v1/payments/recurring/")).toBe(1);
    expect(b.repo.payments.filter((p) => p.kind === "renewal")).toHaveLength(1);
    expect(approvedEvents(b).filter((e) => e.paymentId === renewal.id)).toHaveLength(1);
  });
});

describe("cobro automático y tarjeta nueva en curso", () => {
  it("si el cliente está pagando con otra tarjeta (hace menos de 1 hora), no cobra en paralelo con la vieja", async () => {
    const b = await subscribed();
    b.clock.today = "2026-12-20";
    await startCardUpdate(b.deps, b.accountId);
    await runBillingCycle(b.deps);
    expect(b.dlocal.count("POST", "/v1/payments/recurring/")).toBe(0);

    // Lo abandonó: pasada la hora, el cobro automático sigue normal.
    b.repo.payments.find((p) => p.kind === "card_update")!.createdAt -= 2 * 3600;
    await runBillingCycle(b.deps);
    expect(b.dlocal.count("POST", "/v1/payments/recurring/")).toBe(1);
    expect((await b.repo.getSubscription(b.subId))?.periodEnd).toBe("2027-01-20");
  });
});

describe("POST /api/billing/dlocalgo/notificaciones", () => {
  async function post(body: string, authorization: string | null) {
    const { POST } = await import("@/app/api/billing/dlocalgo/notificaciones/route");
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (authorization) headers.authorization = authorization;
    return POST(new NextRequest("https://digibotlatam.com/api/billing/dlocalgo/notificaciones", { method: "POST", headers, body }));
  }

  it("sin configurar responde 503 (dLocal reintenta más tarde)", async () => {
    expect((await post("{}", null)).status).toBe(503);
  });

  it("descarta firmas inválidas sin tocar nada y aplica las válidas", async () => {
    stubSandboxKeys();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const b = makeBilling({ today: "2026-11-20" });
    runtime.deps = b.deps;
    const accountId = await b.accounts.create("Panadería Lola");
    const start = await startCheckout(b.deps, { accountId }, { planKey: "premium", country: "AR" }, async () => false);
    await confirmCheckout(b.deps, { ref: start.ref, cardToken: "3ds", brand: "visa", ...HOLDER });
    const payment = b.repo.payments.find((p) => p.publicRef === start.ref)!;
    b.dlocal.approve(payment.dlocalPaymentId!);
    const body = JSON.stringify({ payment_id: payment.dlocalPaymentId });

    expect((await post(body, null)).status).toBe(401);
    expect((await post(body, `V2-HMAC-SHA256, Signature: ${"0".repeat(64)}`)).status).toBe(401);
    expect((await post(body.replace("}", ' }'), b.dlocal.sign(body))).status).toBe(401); // cuerpo alterado
    expect((await b.repo.getSubscription(payment.subscriptionId))?.status).toBe("incomplete");

    expect((await post(body, b.dlocal.sign(body))).status).toBe(200);
    expect((await b.repo.getSubscription(payment.subscriptionId))?.status).toBe("active");
  });

  it("un error transitorio responde 500 para que dLocal reintente", async () => {
    stubSandboxKeys();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const b = makeBilling();
    runtime.deps = b.deps;
    vi.spyOn(b.repo, "getPaymentByDlocalId").mockRejectedValueOnce(new Error("base caída"));
    const body = JSON.stringify({ payment_id: "DP-1" });
    b.dlocal.payments.set("DP-1", { id: "DP-1", amount: 1, currency: "ARS", country: "AR", status: "PAID" });
    expect((await post(body, b.dlocal.sign(body))).status).toBe(500);
  });
});

describe("job del cobro (scheduler cada hora)", () => {
  it("cobra recién desde BILLING_RUN_HOUR (hora de Argentina) y una sola vez por día", async () => {
    const b = await subscribed();
    runtime.deps = b.deps;
    b.clock.today = "2026-12-20";
    const { runBillingJob } = await import("@/lib/billing/job");
    vi.useFakeTimers({ toFake: ["Date"] });

    vi.setSystemTime(new Date("2026-12-20T10:30:00Z")); // 07:30 en Argentina
    expect(await runBillingJob()).toBeNull();
    expect(b.dlocal.count("POST", "/v1/payments/recurring/")).toBe(0);

    vi.setSystemTime(new Date("2026-12-20T12:05:00Z")); // 09:05
    expect(await runBillingJob()).toMatchObject({ charged: 1 });
    vi.setSystemTime(new Date("2026-12-20T13:05:00Z")); // 10:05, la corrida siguiente
    expect(await runBillingJob()).toMatchObject({ charged: 0 });
    expect(b.dlocal.count("POST", "/v1/payments/recurring/")).toBe(1);

    vi.stubEnv("BILLING_RUN_HOUR", "14");
    expect(await runBillingJob()).toBeNull();
  });
});
