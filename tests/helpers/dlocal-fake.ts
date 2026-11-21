// dLocal Go falso para los tests: responde como la API real (formas tomadas del sandbox).
//
// cardToken del confirm:
//   "ok"     -> pago aprobado al instante
//   "3ds"    -> devuelve redirect_url (queda PENDING hasta que el test llame a approve())
//   "reject" -> 406 "Missing payment method" (como el sandbox con tarjetas de rechazo)
// Cobro recurrente: según failRecurring (motivo de rechazo) o aprobado.

import { DlocalGoClient, signNotification, type DlocalConfig, type DlocalPayment } from "@/lib/billing/dlocalgo";

export const TEST_CONFIG: DlocalConfig = {
  env: "sandbox",
  apiUrl: "https://api-sbx.dlocalgo.com",
  apiKey: "test-api-key",
  apiSecret: "test-api-secret",
  smartFieldsKey: "sf-test-key",
  sdkUrl: "https://checkout-sbx.dlocalgo.com/js/dlocalgo-smartfields-bundled.js",
};

export class FakeDlocal {
  payments = new Map<string, DlocalPayment>();
  byToken = new Map<string, string>();
  orderIds = new Set<string>();
  calls: { method: string; path: string; body: unknown }[] = [];
  failRecurring: string | null = null;
  private seq = 1000;

  client() {
    return new DlocalGoClient(TEST_CONFIG, (url, init) => this.handle(url, init));
  }

  sign(rawBody: string) {
    return `V2-HMAC-SHA256, Signature: ${signNotification(TEST_CONFIG.apiKey, TEST_CONFIG.apiSecret, rawBody)}`;
  }

  approve(id: string, lastFour = "1111") {
    const p = this.payments.get(id)!;
    Object.assign(p, { status: "PAID", status_detail: null, approved_date: "2026-11-20T00:46:42", card: { bin: "411111", last_four: lastFour } });
  }

  private json(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  private newPayment(body: Record<string, unknown>, extra: Partial<DlocalPayment> = {}): DlocalPayment | Response {
    const orderId = String(body.order_id);
    if (this.orderIds.has(orderId)) return this.json(400, { code: 904, message: "Duplicated invoice id" });
    this.orderIds.add(orderId);
    const id = `DP-${++this.seq}`;
    const token = `tok-${this.seq}-abcdefghijklmnopqrstuv`;
    const p: DlocalPayment = {
      id,
      amount: Number(body.amount),
      currency: String(body.currency ?? "ARS"),
      country: String(body.country ?? "AR"),
      status: "PENDING",
      status_detail: "CREATED",
      order_id: orderId,
      merchant_checkout_token: token,
      redirect_url: `https://checkout-sbx.dlocalgo.com/validate/${token}`,
      ...extra,
    };
    this.payments.set(id, p);
    this.byToken.set(token, id);
    return p;
  }

  async handle(url: string, init: RequestInit): Promise<Response> {
    const path = url.replace(TEST_CONFIG.apiUrl, "");
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : null;
    this.calls.push({ method, path, body });
    const auth = (init.headers as Record<string, string>).Authorization;
    if (auth !== `Bearer ${TEST_CONFIG.apiKey}:${TEST_CONFIG.apiSecret}`) return this.json(403, { code: 3001, message: "Invalid Credentials." });

    if (method === "POST" && path === "/v1/payments") {
      const p = this.newPayment(body);
      return p instanceof Response ? p : this.json(200, p);
    }
    let m = /^\/v1\/payments\/confirm\/(.+)$/.exec(path);
    if (method === "POST" && m) {
      const id = this.byToken.get(decodeURIComponent(m[1]));
      if (!id) return this.json(404, { code: 4000, message: "Payment not found." });
      if (body.cardToken === "reject") return this.json(400, { code: 406, message: "Missing payment method" });
      if (body.cardToken === "3ds") return this.json(200, { payment_id: id, redirect_url: "https://bank.example/3ds/challenge" });
      this.approve(id);
      return this.json(200, { payment_id: id, success: true, external_id: "T-1" });
    }
    m = /^\/v1\/payments\/recurring\/(.+)$/.exec(path);
    if (method === "POST" && m) {
      const original = this.byToken.get(decodeURIComponent(m[1]));
      if (!original) return this.json(404, { code: 4000, message: "Payment not found." });
      const last4 = this.payments.get(original)?.card?.last_four ?? "1111";
      const p = this.newPayment(body, { direct: false });
      if (p instanceof Response) return p;
      if (this.failRecurring) Object.assign(p, { status: "REJECTED", status_detail: "PAYMENT_FAILED", rejected_reason: this.failRecurring });
      else this.approve(p.id, last4);
      return this.json(200, p);
    }
    m = /^\/v1\/payments\/([^/]+)$/.exec(path);
    if (method === "GET" && m) {
      const p = this.payments.get(decodeURIComponent(m[1]));
      return p ? this.json(200, p) : this.json(404, { code: 4000, message: "Payment not found." });
    }
    return this.json(404, { code: 4000, message: "not found" });
  }

  count(method: string, prefix: string) {
    return this.calls.filter((c) => c.method === method && c.path.startsWith(prefix)).length;
  }
}
