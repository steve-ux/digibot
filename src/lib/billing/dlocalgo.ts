// Cliente de la API de dLocal Go. Server-only: usa el API secret.
//
// Entorno: DLOCALGO_ENV=sandbox|production (por defecto sandbox, para que nunca se
// cobre de verdad por un olvido). En sandbox se usan las variables *_SANDBOX:
//   DLOCALGO_API_KEY[_SANDBOX], DLOCALGO_API_SECRET[_SANDBOX], DLOCALGO_SMARTFIELDS_KEY[_SANDBOX],
//   DLOCALGO_API_URL[_SANDBOX], DLOCALGO_SDK_URL[_SANDBOX]
// Docs: https://docs.dlocalgo.com/integration-api

import { createHmac, timingSafeEqual } from "crypto";

export type DlocalEnv = "sandbox" | "production";

export interface DlocalConfig {
  env: DlocalEnv;
  apiUrl: string;
  apiKey: string;
  apiSecret: string;
  smartFieldsKey: string;
  sdkUrl: string;
}

const DEFAULT_URLS: Record<DlocalEnv, { api: string; sdk: string }> = {
  sandbox: {
    api: "https://api-sbx.dlocalgo.com",
    sdk: "https://checkout-sbx.dlocalgo.com/js/dlocalgo-smartfields-bundled.js",
  },
  production: {
    api: "https://api.dlocalgo.com",
    sdk: "https://checkout.dlocalgo.com/js/dlocalgo-smartfields-bundled.js",
  },
};

export function dlocalEnv(): DlocalEnv {
  return process.env.DLOCALGO_ENV?.toLowerCase() === "production" ? "production" : "sandbox";
}

export function getDlocalConfig(): DlocalConfig | null {
  const env = dlocalEnv();
  const v = (name: string) => process.env[env === "sandbox" ? `${name}_SANDBOX` : name]?.trim() || "";
  const config: DlocalConfig = {
    env,
    apiUrl: (v("DLOCALGO_API_URL") || DEFAULT_URLS[env].api).replace(/\/$/, ""),
    apiKey: v("DLOCALGO_API_KEY"),
    apiSecret: v("DLOCALGO_API_SECRET"),
    smartFieldsKey: v("DLOCALGO_SMARTFIELDS_KEY"),
    sdkUrl: v("DLOCALGO_SDK_URL") || DEFAULT_URLS[env].sdk,
  };
  if (!config.apiKey || !config.apiSecret || !config.smartFieldsKey) return null;
  // Candado: en sandbox nunca se pega a la API productiva (y al revés).
  const isSandboxUrl = config.apiUrl.includes("-sbx.");
  if ((env === "sandbox") !== isSandboxUrl) {
    console.error(`[billing] DLOCALGO_ENV=${env} pero la URL de la API es ${config.apiUrl}: se desactiva el cobro.`);
    return null;
  }
  return config;
}

export function isBillingConfigured() {
  return getDlocalConfig() !== null;
}

// ---------- Tipos de la API ----------

export type DlocalStatus = "PENDING" | "PAID" | "REJECTED" | "CANCELLED" | "EXPIRED";

export interface DlocalPayment {
  id: string;
  amount: number;
  currency: string;
  country: string;
  status: DlocalStatus;
  status_detail?: string | null;
  order_id?: string;
  merchant_checkout_token?: string;
  redirect_url?: string;
  approved_date?: string | null;
  rejected_reason?: string | null;
  card?: { bin?: string; issuer?: string; last_four?: string } | null;
  [key: string]: unknown;
}

export interface CreatePaymentInput {
  amount: number;
  currency: string;
  country: string;
  orderId: string;
  description: string;
  notificationUrl: string;
  successUrl: string;
  backUrl: string;
}

export interface ConfirmInput {
  cardToken: string;
  firstName: string;
  lastName: string;
  documentType: string;
  document: string;
  email: string;
}

export interface ConfirmResult {
  paymentId: string | null;
  redirectUrl: string | null;
  raw: unknown;
}

export class DlocalApiError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: number | null,
    message: string,
    public readonly body: unknown = null
  ) {
    super(message);
  }
  // 904: order_id repetido (dLocal ya tiene ese cobro)
  get isDuplicateOrder() {
    return this.code === 904 || this.code === 5009;
  }
}

// Error de red o timeout: no se sabe si dLocal procesó el pedido.
export class DlocalNetworkError extends Error {}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class DlocalGoClient {
  constructor(
    private readonly config: DlocalConfig,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
    private readonly timeoutMs = 30_000
  ) {}

  get smartFieldsKey() {
    return this.config.smartFieldsKey;
  }
  get sdkUrl() {
    return this.config.sdkUrl;
  }
  get env() {
    return this.config.env;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.config.apiUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}:${this.config.apiSecret}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      });
    } catch (err) {
      throw new DlocalNetworkError(`dLocal Go no respondió: ${(err as Error).message}`);
    }
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const d = (data ?? {}) as { code?: number; message?: string };
      throw new DlocalApiError(res.status, typeof d.code === "number" ? d.code : null, d.message || `HTTP ${res.status}`, data);
    }
    return data as T;
  }

  createPayment(input: CreatePaymentInput) {
    return this.request<DlocalPayment>("POST", "/v1/payments", {
      amount: input.amount,
      currency: input.currency,
      country: input.country,
      order_id: input.orderId,
      description: input.description,
      notification_url: input.notificationUrl,
      success_url: input.successUrl,
      back_url: input.backUrl,
      allow_transparent: true,
      allow_recurring: true,
    });
  }

  async confirmPayment(checkoutToken: string, input: ConfirmInput): Promise<ConfirmResult> {
    const raw = await this.request<Record<string, unknown>>("POST", `/v1/payments/confirm/${encodeURIComponent(checkoutToken)}`, {
      cardToken: input.cardToken,
      clientFirstName: input.firstName,
      clientLastName: input.lastName,
      clientDocumentType: input.documentType,
      clientDocument: input.document,
      clientEmail: input.email,
    });
    return {
      paymentId: typeof raw?.payment_id === "string" ? raw.payment_id : null,
      redirectUrl: typeof raw?.redirect_url === "string" && raw.redirect_url ? raw.redirect_url : null,
      raw,
    };
  }

  getPayment(paymentId: string) {
    return this.request<DlocalPayment>("GET", `/v1/payments/${encodeURIComponent(paymentId)}`);
  }

  chargeRecurring(merchantCheckoutToken: string, input: { amount: number; description: string; orderId: string }) {
    return this.request<DlocalPayment>("POST", `/v1/payments/recurring/${encodeURIComponent(merchantCheckoutToken)}`, {
      amount: input.amount,
      description: input.description,
      order_id: input.orderId,
    });
  }
}

export function getDlocalClient(fetchImpl?: FetchLike): DlocalGoClient | null {
  const config = getDlocalConfig();
  return config ? new DlocalGoClient(config, fetchImpl) : null;
}

// ---------- Firma de las notificaciones ----------
// Authorization: V2-HMAC-SHA256, Signature: <hex>
// Signature = HMAC-SHA256(key = secret, message = apiKey + rawBody)

export function signNotification(apiKey: string, apiSecret: string, rawBody: string) {
  return createHmac("sha256", apiSecret).update(apiKey + rawBody, "utf8").digest("hex");
}

export function verifyNotificationSignature(
  authorization: string | null,
  rawBody: string,
  config: Pick<DlocalConfig, "apiKey" | "apiSecret">
): boolean {
  if (!authorization) return false;
  const match = /Signature:\s*([0-9a-fA-F]{64})/.exec(authorization);
  if (!match) return false;
  const expected = Buffer.from(signNotification(config.apiKey, config.apiSecret, rawBody), "hex");
  const received = Buffer.from(match[1].toLowerCase(), "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
