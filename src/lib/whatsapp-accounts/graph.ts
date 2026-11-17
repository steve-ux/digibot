// Cliente HTTP de la Graph API para todo lo que se hace con el token de un cliente
// de WhatsApp (onboarding, suscripción, registro, sincronización). Server-only.
//
// Centraliza la detección de desconexión: si Meta responde 190 (token inválido o
// revocado) o 200 / 10 (sin permiso sobre la cuenta) en una llamada hecha con el
// token de una conexión guardada, se avisa a health.ts. El envío de mensajes y las
// plantillas (meta-whatsapp.ts) usan el mismo aviso.
//
// La versión sale de META_GRAPH_API_VERSION. Nunca se loguean tokens ni query strings.

import { graphVersion } from "../channels/config";
import { reportTokenError } from "./health";

export class GraphError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly code: number | null,
    public readonly subcode: number | null = null,
    // Texto que Meta pensó para la persona (error_user_msg), si vino
    public readonly userMessage: string | null = null
  ) {
    super(message);
  }
}

type Query = Record<string, string | undefined>;

export interface GraphOptions {
  method?: "GET" | "POST" | "DELETE";
  token?: string;
  query?: Query;
  json?: unknown;
  // Conexión dueña del token: habilita la detección de desconexión
  connectionId?: number | null;
}

export const graphBase = () => `https://graph.facebook.com/${graphVersion()}`;

export async function waGraph<T = Record<string, unknown>>(path: string, opts: GraphOptions = {}): Promise<T> {
  const url = new URL(`${graphBase()}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  const method = opts.method ?? "GET";

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, cache: "no-store" });
  } catch (err) {
    throw new GraphError(`No se pudo conectar con Meta: ${(err as Error).message}`, 502, null);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string };
  };
  if (!res.ok || data?.error) {
    const e = data?.error ?? {};
    const code = typeof e.code === "number" ? e.code : null;
    const error = new GraphError(
      e.message || `HTTP ${res.status}`,
      res.status,
      code,
      typeof e.error_subcode === "number" ? e.error_subcode : null,
      e.error_user_msg ?? null
    );
    console.error(`[wa-graph] ${method} ${path}: (#${code ?? "-"}) ${error.message}`);
    if (opts.connectionId) await reportTokenError(opts.connectionId, code, error.message);
    throw error;
  }
  return data as T;
}

// ---------- Llamadas usadas por el onboarding y el panel ----------

const appToken = (app: { appId: string; appSecret: string }) => `${app.appId}|${app.appSecret}`;

export function exchangeCode(code: string, app: { appId: string; appSecret: string }) {
  return waGraph<{ access_token?: string }>("/oauth/access_token", {
    query: { client_id: app.appId, client_secret: app.appSecret, code },
  });
}

export interface DebugTokenData {
  is_valid?: boolean;
  scopes?: string[];
  granular_scopes?: { scope: string; target_ids?: string[] }[];
  expires_at?: number;
  error?: { message?: string; code?: number };
}

// Se pide con el token de la app (no con el del cliente): no dispara la detección.
export async function debugToken(inputToken: string, app: { appId: string; appSecret: string }) {
  const res = await waGraph<{ data?: DebugTokenData }>("/debug_token", {
    query: { input_token: inputToken, access_token: appToken(app) },
  });
  return res.data ?? {};
}

export interface PhoneNumberInfo {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  is_on_biz_app?: boolean;
}

export async function listPhoneNumbers(token: string, wabaId: string): Promise<PhoneNumberInfo[]> {
  try {
    const res = await waGraph<{ data?: PhoneNumberInfo[] }>(`/${wabaId}/phone_numbers`, {
      token,
      query: { fields: "id,display_phone_number,verified_name,is_on_biz_app" },
    });
    return res.data ?? [];
  } catch (err) {
    // Si la versión no conoce is_on_biz_app (#100), se pide sin ese campo.
    if (!(err instanceof GraphError) || err.code !== 100) throw err;
    const res = await waGraph<{ data?: PhoneNumberInfo[] }>(`/${wabaId}/phone_numbers`, {
      token,
      query: { fields: "id,display_phone_number,verified_name" },
    });
    return res.data ?? [];
  }
}

export function subscribeApp(token: string, wabaId: string, connectionId: number) {
  return waGraph(`/${wabaId}/subscribed_apps`, { method: "POST", token, connectionId });
}

export function unsubscribeApp(token: string, wabaId: string, connectionId: number) {
  return waGraph(`/${wabaId}/subscribed_apps`, { method: "DELETE", token, connectionId });
}

export function registerNumber(token: string, phoneNumberId: string, pin: string, connectionId: number) {
  return waGraph(`/${phoneNumberId}/register`, {
    method: "POST",
    token,
    connectionId,
    json: { messaging_product: "whatsapp", pin },
  });
}

export type SmbSyncType = "smb_app_state_sync" | "history";

export function requestSmbSync(token: string, phoneNumberId: string, syncType: SmbSyncType, connectionId: number) {
  return waGraph<{ request_id?: string }>(`/${phoneNumberId}/smb_app_data`, {
    method: "POST",
    token,
    connectionId,
    json: { messaging_product: "whatsapp", sync_type: syncType },
  });
}

export function fetchPhoneNumber(token: string, phoneNumberId: string, connectionId: number) {
  return waGraph<PhoneNumberInfo>(`/${phoneNumberId}`, {
    token,
    connectionId,
    query: { fields: "display_phone_number,verified_name" },
  });
}
