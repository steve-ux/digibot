import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addMonthsAnchored } from "@/lib/billing/config";
import { verifyNotificationSignature } from "@/lib/billing/dlocalgo";
import { decryptSecret } from "@/lib/crypto";
import {
  confirmCheckout,
  getCheckoutResult,
  handleNotification,
  startCheckout,
} from "@/lib/billing/service";
import { HOLDER, TEST_KEY, makeBilling } from "./helpers/billing";
import { TEST_CONFIG } from "./helpers/dlocal-fake";

const noEmail = async () => false;

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function existingAccount(b: ReturnType<typeof makeBilling>) {
  return b.accounts.create("Panadería Lola");
}

describe("alta con checkout transparente", () => {
  it("sin 3DS: confirma, activa la suscripción, guarda el token cifrado y calcula el próximo cobro", async () => {
    const b = makeBilling({ today: "2026-11-20" });
    const accountId = await existingAccount(b);
    const start = await startCheckout(b.deps, { accountId }, { planKey: "premium", country: "AR" }, noEmail);

    expect(start.amount).toBe(30000);
    expect(start.smartFieldsKey).toBe("sf-test-key");
    const created = b.dlocal.calls.find((c) => c.path === "/v1/payments")!.body as Record<string, unknown>;
    expect(created).toMatchObject({ allow_transparent: true, allow_recurring: true, currency: "ARS", country: "AR", order_id: "SUB-1-202611-1" });
    expect(String(created.success_url)).toContain(`/suscripcion/resultado?ref=${start.ref}`);

    const out = await confirmCheckout(b.deps, { ref: start.ref, cardToken: "ok", brand: "visa", ...HOLDER });
    expect(out.status).toBe("paid");

    // El confirm manda el documento sin puntos y nunca datos de tarjeta.
    const confirm = b.dlocal.calls.find((c) => c.path.startsWith("/v1/payments/confirm/"))!.body as Record<string, unknown>;
    expect(confirm).toEqual({
      cardToken: "ok",
      clientFirstName: "Juan",
      clientLastName: "Pérez",
      clientDocumentType: "DNI",
      clientDocument: "30123456",
      clientEmail: "juan@example.com",
    });

    const sub = (await b.repo.getCurrentForAccount(accountId))!;
    expect(sub).toMatchObject({
      status: "active",
      anchorDay: 20,
      periodStart: "2026-11-20",
      periodEnd: "2026-12-20",
      nextChargeOn: "2026-12-20",
      cardBrand: "visa",
      cardLast4: "1111",
    });
    expect(sub.cardTokenEnc).not.toContain("tok-");
    expect(decryptSecret(sub.cardTokenEnc!)).toBe(start.checkoutToken);
    expect(b.repo.events).toHaveLength(1);
    expect(b.repo.events[0].type).toBe("PaymentApproved");
    expect(b.log.approved).toHaveLength(1);
    expect(b.log.changed.at(-1)?.status).toBe("active");
  });

  it("con 3DS: devuelve el redirect_url y activa recién cuando dLocal confirma el pago", async () => {
    const b = makeBilling();
    const accountId = await existingAccount(b);
    const start = await startCheckout(b.deps, { accountId }, { planKey: "basico", country: "AR" }, noEmail);

    const out = await confirmCheckout(b.deps, { ref: start.ref, cardToken: "3ds", ...HOLDER });
    expect(out).toEqual({ status: "redirect", ref: start.ref, redirectUrl: "https://bank.example/3ds/challenge" });
    expect(await b.repo.getCurrentForAccount(accountId)).toBeNull();

    // Vuelve a success_url antes de que el banco termine: sigue pendiente.
    expect((await getCheckoutResult(b.deps, start.ref))?.status).toBe("pending");

    const dlocalId = [...b.dlocal.payments.keys()][0];
    b.dlocal.approve(dlocalId);
    const result = await getCheckoutResult(b.deps, start.ref);
    expect(result?.status).toBe("paid");
    expect((await b.repo.getCurrentForAccount(accountId))?.status).toBe("active");
  });

  it("tarjeta rechazada: mensaje en castellano y se puede reintentar con otra tarjeta", async () => {
    const b = makeBilling();
    const accountId = await existingAccount(b);
    const start = await startCheckout(b.deps, { accountId }, { planKey: "basico", country: "AR" }, noEmail);

    await expect(confirmCheckout(b.deps, { ref: start.ref, cardToken: "reject", ...HOLDER })).rejects.toThrow(/No pudimos cobrar con esa tarjeta/);
    expect((await b.repo.getPaymentByRef(start.ref))?.status).toBe("pending");

    const out = await confirmCheckout(b.deps, { ref: start.ref, cardToken: "ok", ...HOLDER });
    expect(out.status).toBe("paid");
  });

  it("valida el documento según el país y el plan sin precio en ese país", async () => {
    const b = makeBilling();
    const accountId = await existingAccount(b);
    await expect(startCheckout(b.deps, { accountId }, { planKey: "basico", country: "MX" }, noEmail)).rejects.toThrow(/no está disponible en México/);
    await expect(startCheckout(b.deps, { accountId }, { planKey: "basico", country: "SV" }, noEmail)).rejects.toThrow(/Elegí un país/);

    const start = await startCheckout(b.deps, { accountId }, { planKey: "premium", country: "MX" }, noEmail);
    await expect(confirmCheckout(b.deps, { ref: start.ref, cardToken: "ok", ...HOLDER })).rejects.toThrow(/tipo de documento/);
    expect(b.dlocal.count("POST", "/v1/payments/confirm/")).toBe(0);
  });

  it("no deja contratar dos veces la misma cuenta", async () => {
    const b = makeBilling();
    const accountId = await existingAccount(b);
    const start = await startCheckout(b.deps, { accountId }, { planKey: "basico", country: "AR" }, noEmail);
    await confirmCheckout(b.deps, { ref: start.ref, cardToken: "ok", ...HOLDER });
    await expect(startCheckout(b.deps, { accountId }, { planKey: "plus", country: "AR" }, noEmail)).rejects.toThrow(/ya tiene una suscripción/);
  });

  it("cliente nuevo desde la web: crea la cuenta al aprobarse y deja el link de invitación por 24 h", async () => {
    const b = makeBilling();
    const signup = { businessName: "Ferretería Sur", name: "Ana Gómez", email: "ana@ferreteria.com" };
    await expect(startCheckout(b.deps, { accountId: null }, { planKey: "basico", country: "AR", signup }, async () => true)).rejects.toThrow(
      /Ya hay una cuenta con ese email/
    );

    const start = await startCheckout(b.deps, { accountId: null }, { planKey: "basico", country: "AR", signup }, noEmail);
    expect(b.accounts.accounts).toHaveLength(0);
    await confirmCheckout(b.deps, { ref: start.ref, cardToken: "ok", ...HOLDER });

    expect(b.accounts.accounts.map((a) => a.name)).toEqual(["Ferretería Sur"]);
    expect(b.log.signups).toEqual([{ signup, inviteToken: "invite-1" }]);
    const result = await getCheckoutResult(b.deps, start.ref);
    expect(result).toMatchObject({ status: "paid", accountId: 1, inviteToken: "invite-1" });
  });

  it("período anclado al día del alta: del 31 pasa al último día de los meses cortos", () => {
    expect(addMonthsAnchored("2026-01-31", 1, 31)).toBe("2026-02-28");
    expect(addMonthsAnchored("2026-02-28", 1, 31)).toBe("2026-03-31");
    expect(addMonthsAnchored("2027-12-15", 1, 15)).toBe("2028-01-15");
  });
});

describe("notificaciones de dLocal Go", () => {
  it("verifica la firma HMAC (apiKey + body, con el secret)", () => {
    const b = makeBilling();
    const raw = '{"payment_id":"DP-283"}';
    expect(verifyNotificationSignature(b.dlocal.sign(raw), raw, TEST_CONFIG)).toBe(true);
    expect(verifyNotificationSignature(b.dlocal.sign(raw), '{"payment_id":"DP-284"}', TEST_CONFIG)).toBe(false);
    expect(verifyNotificationSignature("V2-HMAC-SHA256, Signature: " + "0".repeat(64), raw, TEST_CONFIG)).toBe(false);
    expect(verifyNotificationSignature(null, raw, TEST_CONFIG)).toBe(false);
  });

  it("una notificación duplicada no duplica nada (ni evento, ni mail, ni cuenta)", async () => {
    const b = makeBilling();
    const signup = { businessName: "Ferretería Sur", name: "Ana Gómez", email: "ana@ferreteria.com" };
    const start = await startCheckout(b.deps, { accountId: null }, { planKey: "basico", country: "AR", signup }, noEmail);
    const out = await confirmCheckout(b.deps, { ref: start.ref, cardToken: "3ds", ...HOLDER });
    expect(out.status).toBe("redirect");
    const dlocalId = [...b.dlocal.payments.keys()][0];
    b.dlocal.approve(dlocalId);

    const raw = JSON.stringify({ payment_id: dlocalId });
    const results = await Promise.all([handleNotification(b.deps, raw), handleNotification(b.deps, raw), handleNotification(b.deps, raw)]);
    expect(results.every((r) => r.ok)).toBe(true);
    await handleNotification(b.deps, raw);

    expect(b.accounts.accounts).toHaveLength(1);
    expect(b.repo.events).toHaveLength(1);
    expect(b.log.approved).toHaveLength(1);
    expect(b.log.signups).toHaveLength(1);
    expect(b.repo.subscriptions.filter((s) => s.status === "active")).toHaveLength(1);
  });

  it("confía en GET /v1/payments y no en el cuerpo: un pago pendiente no activa nada", async () => {
    const b = makeBilling();
    const accountId = await existingAccount(b);
    await startCheckout(b.deps, { accountId }, { planKey: "basico", country: "AR" }, noEmail);
    const dlocalId = [...b.dlocal.payments.keys()][0];
    await handleNotification(b.deps, JSON.stringify({ payment_id: dlocalId, status: "PAID" }));
    expect(await b.repo.getCurrentForAccount(accountId)).toBeNull();
  });

  it("un monto distinto al esperado no activa y avisa al equipo", async () => {
    const b = makeBilling();
    const accountId = await existingAccount(b);
    await startCheckout(b.deps, { accountId }, { planKey: "basico", country: "AR" }, noEmail);
    const dlocalId = [...b.dlocal.payments.keys()][0];
    b.dlocal.approve(dlocalId);
    b.dlocal.payments.get(dlocalId)!.amount = 1;
    await handleNotification(b.deps, JSON.stringify({ payment_id: dlocalId }));
    expect(await b.repo.getCurrentForAccount(accountId)).toBeNull();
    expect(b.log.alerts).toContain("Pago con monto distinto");
  });

  it("ignora pagos que no son nuestros y payment_id inválidos", async () => {
    const b = makeBilling();
    b.dlocal.payments.set("DP-999", { id: "DP-999", amount: 1, currency: "ARS", country: "AR", status: "PAID", order_id: "OTRO-1" });
    expect(await handleNotification(b.deps, '{"payment_id":"DP-999"}')).toEqual({ ok: true, handled: false });
    expect(await handleNotification(b.deps, "no-json")).toMatchObject({ ok: false, status: 400 });
  });
});
