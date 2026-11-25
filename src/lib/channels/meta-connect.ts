// Llamadas a Meta para conectar y desconectar canales. Server-only.
// Los errores de Meta se traducen a ConnectError con un mensaje para la persona;
// el detalle técnico queda en el log.

import { graphVersion, threadsVersion } from "./config";

export class ConnectError extends Error {
  constructor(
    message: string,
    public readonly httpStatus = 400,
    public readonly detail: string | null = null,
    // Código de error de Meta, si vino
    public readonly metaCode: number | null = null
  ) {
    super(message);
  }
}

// Límites de llamadas de Meta (por app, por usuario o por cuenta de Instagram/página).
export const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80006]);
const RATE_LIMITED =
  "Meta limitó por un rato las consultas a esta cuenta (demasiadas llamadas). Esperá unos minutos y probá de nuevo.";

type Query = Record<string, string | undefined>;

async function call(
  base: string,
  path: string,
  { method = "GET", token, query, form, json }: { method?: string; token?: string; query?: Query; form?: Query; json?: unknown } = {},
  humanError: string
) {
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: string | undefined;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(Object.entries(form).filter(([, v]) => v !== undefined) as [string, string][]).toString();
  } else if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  let res: Response;
  try {
    // Con límite: si Meta no contesta, mejor un error claro que un 504 del proxy sin mensaje.
    res = await fetch(url, { method, headers, body, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    console.error(`[canales] ${method} ${path}: ${(err as Error).message}`);
    throw new ConnectError("No pudimos comunicarnos con Meta. Probá de nuevo en un rato.", 502, (err as Error).message);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const detail = data?.error?.message ?? `HTTP ${res.status}`;
    const code = typeof data?.error?.code === "number" ? data.error.code : null;
    console.error(`[canales] ${method} ${path}: (#${code ?? res.status}) ${detail}`);
    if (code !== null && RATE_LIMIT_CODES.has(code)) throw new ConnectError(RATE_LIMITED, 429, detail, code);
    throw new ConnectError(humanError, 502, detail, code);
  }
  return data;
}

const graph = () => `https://graph.facebook.com/${graphVersion()}`;
const threadsGraph = () => "https://graph.threads.net";

// ---------- Facebook (Embedded Signup y Login for Business) ----------

// Cambia el código que devuelve el SDK de Facebook por un token.
export async function exchangeFacebookCode(code: string, app: { appId: string; appSecret: string }) {
  const data = await call(
    graph(),
    "/oauth/access_token",
    { query: { client_id: app.appId, client_secret: app.appSecret, code } },
    "Meta no aceptó la autorización. Probá conectar de nuevo."
  );
  if (typeof data.access_token !== "string") throw new ConnectError("Meta no devolvió el permiso. Probá de nuevo.");
  return data.access_token as string;
}

// Token de larga duración, solo si la configuración de login devolvió un token de
// usuario común (con uno de usuario del sistema no hace falta: no vence).
export async function longLivedFacebookToken(token: string, app: { appId: string; appSecret: string }) {
  try {
    const data = await call(
      graph(),
      "/oauth/access_token",
      { query: { grant_type: "fb_exchange_token", client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: token } },
      "No se pudo extender el permiso."
    );
    return typeof data.access_token === "string" ? (data.access_token as string) : token;
  } catch {
    return token;
  }
}

// Valida el token recién canjeado con debug_token (se pide con el token de la app).
// Tiene que ser válido y de esta app; si falta alguno de los permisos pedidos, se avisa.
export interface TokenInfo {
  type: string | null;
  scopes: string[];
  expiresAt: number | null;
}

export async function inspectToken(
  token: string,
  app: { appId: string; appSecret: string },
  requiredScopes: string[] = []
): Promise<TokenInfo> {
  const res = await call(
    graph(),
    "/debug_token",
    { query: { input_token: token, access_token: `${app.appId}|${app.appSecret}` } },
    "No pudimos validar la autorización de Meta. Probá conectar de nuevo."
  );
  const data = (res.data ?? {}) as {
    is_valid?: boolean;
    app_id?: string;
    type?: string;
    scopes?: string[];
    expires_at?: number;
  };
  if (!data.is_valid) throw new ConnectError("Meta devolvió una autorización inválida. Probá conectar de nuevo.");
  if (data.app_id && String(data.app_id) !== app.appId) {
    throw new ConnectError("La autorización no es de la app de DigiBot. Probá conectar de nuevo.", 400, `app_id ${data.app_id}`);
  }
  const scopes = Array.isArray(data.scopes) ? data.scopes : [];
  const missing = requiredScopes.filter((s) => !scopes.includes(s));
  if (missing.length > 0) {
    throw new ConnectError(
      "Faltan permisos. Volvé a conectar y aceptá todos los permisos que pide DigiBot.",
      400,
      `faltan: ${missing.join(",")}`
    );
  }
  // expires_at 0 = no vence (token de usuario del sistema)
  return { type: data.type ?? null, scopes, expiresAt: data.expires_at ? Number(data.expires_at) : null };
}

// ---------- Páginas e Instagram ----------

export interface MetaPage {
  id: string;
  name: string;
  accessToken: string;
  pictureUrl: string | null;
}

export async function fetchPages(userToken: string): Promise<MetaPage[]> {
  const data = await call(
    graph(),
    "/me/accounts",
    {
      token: userToken,
      query: {
        fields: "id,name,access_token,picture{url}",
        limit: "100",
      },
    },
    "No pudimos leer tus páginas de Facebook."
  );
  const pages: MetaPage[] = [];
  for (const p of (data.data ?? []) as Record<string, unknown>[]) {
    if (typeof p.id !== "string" || typeof p.access_token !== "string") continue;
    pages.push({
      id: p.id,
      name: typeof p.name === "string" ? p.name : p.id,
      accessToken: p.access_token,
      pictureUrl: (p.picture as { data?: { url?: string } } | undefined)?.data?.url ?? null,
    });
  }
  return pages;
}

// Mensajes de Messenger y comentarios de la página llegan al webhook /webhooks/meta.
export const PAGE_FIELDS = ["messages", "messaging_postbacks", "message_reads", "message_deliveries", "feed"];

export async function subscribePage(pageToken: string, pageId: string) {
  await call(
    graph(),
    `/${pageId}/subscribed_apps`,
    { method: "POST", token: pageToken, query: { subscribed_fields: PAGE_FIELDS.join(",") } },
    "No pudimos activar los mensajes de la página."
  );
}

export async function unsubscribePage(pageToken: string, pageId: string) {
  await call(graph(), `/${pageId}/subscribed_apps`, { method: "DELETE", token: pageToken }, "No pudimos desactivar la página.");
}

// ---------- Instagram API with Unified Login ----------
//
// Docs: developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login
//   - el token es de un usuario del sistema del portfolio del cliente (/me es ese usuario, no la cuenta de IG)
//   - GET /me?fields=client_business_id
//   - GET /me/assigned_instagram_accounts?fields=id,username
//   - POST /{ig-id}/subscribed_apps en graph.facebook.com con ese mismo token

export const INSTAGRAM_SCOPES = ["instagram_basic", "instagram_manage_messages", "instagram_manage_comments"];
export const INSTAGRAM_FIELDS = ["messages", "messaging_postbacks", "messaging_seen", "comments"];

export async function fetchClientBusinessId(token: string): Promise<string | null> {
  try {
    const data = await call(graph(), "/me", { token, query: { fields: "client_business_id" } }, "No pudimos leer tu portfolio comercial.");
    return typeof data.client_business_id === "string" ? data.client_business_id : null;
  } catch {
    // No es imprescindible para conectar: se usa más adelante para administrar el token.
    return null;
  }
}

export interface MetaInstagramAccount {
  id: string;
  username: string;
  pictureUrl: string | null;
}

export async function fetchAssignedInstagramAccounts(token: string): Promise<MetaInstagramAccount[]> {
  const read = async (fields: string) => {
    const accounts: Record<string, unknown>[] = [];
    let after: string | undefined;
    for (let page = 0; page < 10; page++) {
      const data = await call(
        graph(),
        "/me/assigned_instagram_accounts",
        { token, query: { fields, limit: "100", after } },
        "No pudimos leer tus cuentas de Instagram."
      );
      accounts.push(...((data.data ?? []) as Record<string, unknown>[]));
      after = data.paging?.next ? data.paging?.cursors?.after : undefined;
      if (!after) break;
    }
    return accounts;
  };
  let raw: Record<string, unknown>[];
  try {
    raw = await read("id,username,profile_picture_url");
  } catch (err) {
    // La doc solo garantiza id y username: si la foto no se puede pedir (#100), sin foto.
    // Con cualquier otro error (ej. límite de llamadas) no se reintenta: sería otra llamada más.
    if (!(err instanceof ConnectError) || err.metaCode !== 100) throw err;
    raw = await read("id,username");
  }
  return raw
    .filter((a): a is { id: string; username?: string; profile_picture_url?: string } => typeof a.id === "string")
    .map((a) => ({ id: a.id, username: a.username ?? a.id, pictureUrl: a.profile_picture_url ?? null }));
}

export async function subscribeInstagram(token: string, igUserId: string) {
  await call(
    graph(),
    `/${igUserId}/subscribed_apps`,
    { method: "POST", token, query: { subscribed_fields: INSTAGRAM_FIELDS.join(",") } },
    "No pudimos activar los mensajes de Instagram. Revisá que la cuenta sea profesional y probá de nuevo."
  );
}

export async function unsubscribeInstagram(token: string, igUserId: string) {
  await call(graph(), `/${igUserId}/subscribed_apps`, { method: "DELETE", token }, "No pudimos desactivar Instagram.");
}

// ---------- Threads ----------

export async function exchangeThreadsCode(
  code: string,
  redirectUri: string,
  app: { appId: string; appSecret: string }
) {
  const data = await call(
    threadsGraph(),
    "/oauth/access_token",
    {
      method: "POST",
      form: {
        client_id: app.appId,
        client_secret: app.appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      },
    },
    "Threads no aceptó la autorización. Probá conectar de nuevo."
  );
  if (typeof data.access_token !== "string") throw new ConnectError("Threads no devolvió el permiso.");
  return data.access_token as string;
}

// Token de 60 días.
export async function longLivedThreadsToken(shortToken: string, appSecret: string) {
  const data = await call(
    threadsGraph(),
    "/access_token",
    { query: { grant_type: "th_exchange_token", client_secret: appSecret, access_token: shortToken } },
    "No pudimos completar la conexión con Threads."
  );
  return { token: data.access_token as string, expiresIn: Number(data.expires_in) || 60 * 24 * 3600 };
}

// Renueva un token de larga duración (tiene que tener al menos 24 h y no estar vencido).
export async function refreshThreadsToken(token: string) {
  const data = await call(
    threadsGraph(),
    "/refresh_access_token",
    { query: { grant_type: "th_refresh_token", access_token: token } },
    "No pudimos renovar el permiso de Threads."
  );
  return { token: data.access_token as string, expiresIn: Number(data.expires_in) || 60 * 24 * 3600 };
}

export async function fetchThreadsProfile(token: string) {
  const data = await call(
    `${threadsGraph()}/${threadsVersion()}`,
    "/me",
    { token, query: { fields: "id,username,threads_profile_picture_url" } },
    "No pudimos leer tu perfil de Threads."
  );
  return {
    id: String(data.id),
    username: (data.username as string | undefined) ?? String(data.id),
    pictureUrl: (data.threads_profile_picture_url as string | undefined) ?? null,
  };
}

export function threadsAuthorizeUrl(appId: string, redirectUri: string, state: string, scopes: string[]) {
  const url = new URL("https://threads.net/oauth/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}
