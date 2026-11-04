// Llamadas a Meta para conectar y desconectar canales. Server-only.
// Los errores de Meta se traducen a ConnectError con un mensaje para la persona;
// el detalle técnico queda en el log.

import { graphVersion, threadsVersion } from "./config";

export class ConnectError extends Error {
  constructor(
    message: string,
    public readonly httpStatus = 400,
    public readonly detail: string | null = null
  ) {
    super(message);
  }
}

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
    res = await fetch(url, { method, headers, body, cache: "no-store" });
  } catch (err) {
    throw new ConnectError("No pudimos comunicarnos con Meta. Probá de nuevo en un rato.", 502, (err as Error).message);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const detail = data?.error?.message ?? `HTTP ${res.status}`;
    console.error(`[canales] ${method} ${path}: ${detail}`);
    throw new ConnectError(humanError, 502, detail);
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

// Token de larga duración (si ya lo es, Meta devuelve uno igual de válido).
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

// ---------- WhatsApp ----------

export async function subscribeAppToWaba(token: string, wabaId: string) {
  await call(graph(), `/${wabaId}/subscribed_apps`, { method: "POST", token }, "No pudimos activar los mensajes de este número.");
}

export async function unsubscribeAppFromWaba(token: string, wabaId: string) {
  await call(graph(), `/${wabaId}/subscribed_apps`, { method: "DELETE", token }, "No pudimos desactivar los mensajes.");
}

// Registra el número en la Cloud API. Si ya estaba registrado, Meta da error y se sigue igual.
export async function registerPhoneNumber(token: string, phoneNumberId: string, pin: string) {
  try {
    await call(
      graph(),
      `/${phoneNumberId}/register`,
      { method: "POST", token, json: { messaging_product: "whatsapp", pin } },
      "No pudimos registrar el número."
    );
    return true;
  } catch (err) {
    console.warn("[canales] El registro del número no se completó (puede que ya estuviera registrado):", (err as ConnectError).detail);
    return false;
  }
}

export async function fetchPhoneNumber(token: string, phoneNumberId: string) {
  const data = await call(
    graph(),
    `/${phoneNumberId}`,
    { token, query: { fields: "display_phone_number,verified_name" } },
    "No pudimos leer los datos del número."
  );
  return {
    displayPhoneNumber: (data.display_phone_number as string | undefined) ?? null,
    verifiedName: (data.verified_name as string | undefined) ?? null,
  };
}

// ---------- Páginas e Instagram ----------

export interface MetaPage {
  id: string;
  name: string;
  accessToken: string;
  pictureUrl: string | null;
  instagram: { id: string; username: string; pictureUrl: string | null } | null;
}

export async function fetchPages(userToken: string): Promise<MetaPage[]> {
  const data = await call(
    graph(),
    "/me/accounts",
    {
      token: userToken,
      query: {
        fields: "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}",
        limit: "100",
      },
    },
    "No pudimos leer tus páginas de Facebook."
  );
  const pages: MetaPage[] = [];
  for (const p of (data.data ?? []) as Record<string, unknown>[]) {
    if (typeof p.id !== "string" || typeof p.access_token !== "string") continue;
    const ig = p.instagram_business_account as { id?: string; username?: string; profile_picture_url?: string } | undefined;
    pages.push({
      id: p.id,
      name: typeof p.name === "string" ? p.name : p.id,
      accessToken: p.access_token,
      pictureUrl: (p.picture as { data?: { url?: string } } | undefined)?.data?.url ?? null,
      instagram: ig?.id ? { id: ig.id, username: ig.username ?? ig.id, pictureUrl: ig.profile_picture_url ?? null } : null,
    });
  }
  return pages;
}

// Mensajes de Messenger e Instagram y comentarios de la página llegan al webhook /webhooks/meta.
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
