// Embedded Signup y webhooks de cuenta con la forma real que manda Meta, más un fetch
// falso que responde según "MÉTODO url" y registra cada llamada.

import { vi } from "vitest";
import type { WaNotifier } from "@/lib/whatsapp-accounts/notify";
import { MemoryWaRepo } from "@/lib/whatsapp-accounts/repo";
import type { WaDeps } from "@/lib/whatsapp-accounts/runtime";
import { CUSTOMER_WA_ID, DISPLAY_PHONE, envelope, PHONE_NUMBER_ID } from "./payloads";

export const WABA_ID = "102290129340398";
export const BUSINESS_ID = "2729063490586005";
export const META_SESSION_ID = "f34b51dab5e0498";

// postMessage del popup (v5)
export function finishEvent(event = "FINISH", data: Record<string, unknown> = {}) {
  return {
    type: "WA_EMBEDDED_SIGNUP",
    event,
    version: 3,
    data: { phone_number_id: PHONE_NUMBER_ID, waba_id: WABA_ID, business_id: BUSINESS_ID, ...data },
  };
}

export const coexistenceEvent = () =>
  finishEvent("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", { waba_id: undefined, messaging_account_ids: [WABA_ID], is_on_biz_app: true });

export const cancelEvent = (step = "PHONE_NUMBER_SETUP") => ({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { current_step: step } });

export const errorEvent = () => ({
  type: "WA_EMBEDDED_SIGNUP",
  event: "CANCEL",
  data: {
    error_message: "Your verified name violates WhatsApp guidelines. Please edit your verified name and try again.",
    error_code: "524126980791429",
    session_id: META_SESSION_ID,
    timestamp: 1731700000,
  },
});

export function accountUpdate(event: string, extra: Record<string, unknown> = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: WABA_ID,
        time: 1731700000,
        changes: [{ field: "account_update", value: { event, waba_info: { waba_id: WABA_ID, owner_business_id: BUSINESS_ID }, ...extra } }],
      },
    ],
  };
}

export function historyChunk(progress: number, messages: Record<string, unknown>[], chunkOrder = 1) {
  return envelope("history", {
    history: [{ metadata: { phase: 0, chunk_order: chunkOrder, progress }, threads: [{ id: CUSTOMER_WA_ID, messages }] }],
  });
}

export const historyDeclined = () =>
  envelope("history", { history: [{ errors: [{ code: 2593109, title: "History sync is turned off by the business" }] }] });

export function historyMessage(id: string, fromCustomer: boolean, timestamp: number, body: string) {
  return {
    from: fromCustomer ? CUSTOMER_WA_ID : DISPLAY_PHONE,
    ...(fromCustomer ? {} : { to: CUSTOMER_WA_ID }),
    id,
    timestamp: String(timestamp),
    type: "text",
    text: { body },
    history_context: { status: fromCustomer ? "READ" : "DELIVERED" },
  };
}

export function stateSync(action: "add" | "remove", fullName = "Juan Pérez") {
  return envelope("smb_app_state_sync", {
    state_sync: [
      {
        type: "contact",
        contact: { full_name: fullName, first_name: fullName.split(" ")[0], phone_number: CUSTOMER_WA_ID },
        action,
        metadata: { timestamp: "1731700000" },
      },
    ],
  });
}

export function echo(id: string, body: string) {
  return envelope("smb_message_echoes", {
    message_echoes: [{ from: DISPLAY_PHONE, to: CUSTOMER_WA_ID, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body } }],
  });
}

// ---------- Graph falso ----------

export type Route = [RegExp, unknown, number?];
export interface Call {
  method: string;
  url: string;
  body: string | null;
}

export function mockGraph(routes: Route[]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: (init?.body as string) ?? null });
      const route = routes.find(([re]) => re.test(`${method} ${url}`));
      if (!route) return new Response(JSON.stringify({ error: { message: `sin mock: ${method} ${url}`, code: 1 } }), { status: 400 });
      return new Response(JSON.stringify(route[1]), { status: route[2] ?? 200 });
    })
  );
  return calls;
}

export const tokenOk = (targets = [WABA_ID]) => ({
  data: {
    is_valid: true,
    scopes: ["whatsapp_business_management", "whatsapp_business_messaging", "whatsapp_business_manage_events"],
    granular_scopes: [
      { scope: "whatsapp_business_management", target_ids: targets },
      { scope: "whatsapp_business_messaging", target_ids: targets },
    ],
  },
});

// Lo que responde Meta en un onboarding normal.
export const ONBOARDING_ROUTES: Route[] = [
  [/GET .*\/oauth\/access_token\?/, { access_token: "tok-negocio" }],
  [/POST .*\/102290129340398\/subscribed_apps/, { success: true }],
  [/POST .*\/106540352242922\/register/, { success: true }],
  [/POST .*\/106540352242922\/smb_app_data/, { request_id: "req-123" }],
  [/GET .*\/106540352242922\?fields=/, { display_phone_number: "+54 9 261 277-1419", verified_name: "Óptica Sol", id: PHONE_NUMBER_ID }],
  [/GET .*\/debug_token\?/, tokenOk()],
  [/GET .*\/102290129340398\/phone_numbers/, { data: [{ id: PHONE_NUMBER_ID, display_phone_number: "+54 9 261 277-1419", verified_name: "Óptica Sol", is_on_biz_app: false }] }],
];

// ---------- Dependencias ----------

export function fakeDeps() {
  const repo = new MemoryWaRepo();
  const notified: { kind: "disconnected" | "needsAttention"; accountId: number; reason?: string | null }[] = [];
  const notifier: WaNotifier = {
    disconnected: async (a, info) => void notified.push({ kind: "disconnected", accountId: a.accountId, reason: info.reason }),
    needsAttention: async (a) => void notified.push({ kind: "needsAttention", accountId: a.accountId }),
  };
  const deps: WaDeps = { repo, notifier, onConnectionsChanged: vi.fn() };
  return { repo, notified, deps };
}
