// Cliente de TikTok API for Business v1.3 ("TikTok accounts" / Accounts API). Server-only.
//
// Docs: business-api.tiktok.com/portal/docs (Accounts API > Guides / API reference)
//   Tokens:      POST /tt_user/oauth2/token/ · /tt_user/oauth2/refresh_token/ · /tt_user/oauth2/revoke/
//                access token 1 día · refresh token 1 año · business_id = open_id
//   Perfil:      GET  /business/get/
//   Videos:      GET  /business/video/list/
//   Comentarios: GET  /business/comment/list/ · POST /business/comment/reply/create/
//   Webhook:     POST /business/webhook/update/ (event_type COMMENT, a nivel de app)
// Respuestas: { code, message, request_id, data }; code 0 = OK. El token va en el header Access-Token.
//
// Los ids (videos, comentarios) son enteros de 19 dígitos: con JSON.parse se redondean.
// parseJsonSafe los deja como string.

const BASE = "https://business-api.tiktok.com/open_api/v1.3";
const TIMEOUT_MS = 15_000;

export class TikTokApiError extends Error {
  constructor(
    message: string,
    public readonly code: number | null,
    public readonly requestId: string | null = null,
    public readonly httpStatus: number | null = null
  ) {
    super(message);
  }
}

export interface TikTokApp {
  appId: string;
  appSecret: string;
}

// Enteros de 16+ dígitos fuera de strings -> strings (no toca el texto de los comentarios).
export function parseJsonSafe<T = unknown>(text: string): T {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i;
      while (j < text.length && /[-+0-9.eE]/.test(text[j])) j++;
      const token = text.slice(i, j);
      out += /^-?\d{16,}$/.test(token) ? `"${token}"` : token;
      i = j - 1;
      continue;
    }
    out += ch;
  }
  return JSON.parse(out) as T;
}

interface Envelope<T> {
  code?: number;
  message?: string;
  request_id?: string;
  data?: T;
}

async function call<T>(path: string, init: { method: "GET" | "POST"; token?: string; query?: Record<string, unknown>; body?: unknown }) {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.token) headers["Access-Token"] = init.token;

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new TikTokApiError(`No se pudo conectar con TikTok (${(err as Error).message}).`, null);
  }
  const text = await res.text();
  let envelope: Envelope<T>;
  try {
    envelope = parseJsonSafe<Envelope<T>>(text);
  } catch {
    throw new TikTokApiError(`TikTok respondió algo inesperado (HTTP ${res.status}).`, null, null, res.status);
  }
  if (!res.ok || (envelope.code ?? 0) !== 0) {
    throw new TikTokApiError(
      envelope.message || `TikTok respondió HTTP ${res.status}.`,
      envelope.code ?? null,
      envelope.request_id ?? null,
      res.status
    );
  }
  return (envelope.data ?? {}) as T;
}

const str = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : 0) || 0;

// ---------- Tokens ----------

export interface TikTokTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
  openId: string;
  scope: string[];
}

interface TokenData {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  open_id?: string;
  scope?: string;
}

function toTokens(d: TokenData): TikTokTokens {
  if (!d.access_token || !d.open_id || !d.refresh_token) throw new TikTokApiError("TikTok no devolvió el token de la cuenta.", null);
  return {
    accessToken: d.access_token,
    expiresIn: num(d.expires_in) || 86_400,
    refreshToken: d.refresh_token,
    refreshExpiresIn: num(d.refresh_token_expires_in) || 365 * 86_400,
    openId: String(d.open_id),
    scope: (d.scope ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

export async function exchangeCode(code: string, redirectUri: string, app: TikTokApp) {
  const data = await call<TokenData>("/tt_user/oauth2/token/", {
    method: "POST",
    body: {
      client_id: app.appId,
      client_secret: app.appSecret,
      grant_type: "authorization_code",
      auth_code: code,
      redirect_uri: redirectUri,
    },
  });
  return toTokens(data);
}

export async function refreshTokens(refreshToken: string, app: TikTokApp) {
  const data = await call<TokenData>("/tt_user/oauth2/refresh_token/", {
    method: "POST",
    body: { client_id: app.appId, client_secret: app.appSecret, grant_type: "refresh_token", refresh_token: refreshToken },
  });
  return toTokens(data);
}

export async function revokeToken(accessToken: string, app: TikTokApp) {
  await call("/tt_user/oauth2/revoke/", {
    method: "POST",
    body: { client_id: app.appId, client_secret: app.appSecret, access_token: accessToken },
  });
}

// ---------- Perfil ----------

export interface TikTokProfile {
  username: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  isBusinessAccount: boolean | null;
  hasAdvancedAccess: boolean | null;
}

export async function fetchProfile(token: string, openId: string): Promise<TikTokProfile> {
  const d = await call<Record<string, unknown>>("/business/get/", {
    method: "GET",
    token,
    query: {
      business_id: openId,
      fields: ["username", "display_name", "profile_image", "is_business_account", "has_advanced_access"],
    },
  });
  return {
    username: str(d.username),
    displayName: str(d.display_name),
    pictureUrl: str(d.profile_image),
    isBusinessAccount: typeof d.is_business_account === "boolean" ? d.is_business_account : null,
    hasAdvancedAccess: typeof d.has_advanced_access === "boolean" ? d.has_advanced_access : null,
  };
}

// ---------- Videos ----------

export interface TikTokVideo {
  id: string;
  caption: string;
  thumbnailUrl: string | null;
  shareUrl: string | null;
  likes: number;
  comments: number;
  createTime: number | null;
}

const VIDEO_FIELDS = ["item_id", "caption", "thumbnail_url", "share_url", "likes", "comments", "create_time"];

function toVideo(v: Record<string, unknown>): TikTokVideo | null {
  const id = str(v.item_id);
  if (!id) return null;
  return {
    id,
    caption: str(v.caption) ?? "",
    thumbnailUrl: str(v.thumbnail_url),
    shareUrl: str(v.share_url),
    likes: num(v.likes),
    comments: num(v.comments),
    createTime: v.create_time === undefined ? null : num(v.create_time),
  };
}

export async function listVideos(token: string, openId: string, opts: { videoIds?: string[]; maxCount?: number } = {}) {
  const d = await call<{ videos?: Record<string, unknown>[] }>("/business/video/list/", {
    method: "GET",
    token,
    query: {
      business_id: openId,
      fields: VIDEO_FIELDS,
      max_count: Math.min(opts.maxCount ?? 20, 20),
      filters: opts.videoIds?.length ? { video_ids: opts.videoIds } : undefined,
    },
  });
  return (d.videos ?? []).map(toVideo).filter((v): v is TikTokVideo => v !== null);
}

// ---------- Comentarios ----------

export interface TikTokComment {
  id: string;
  videoId: string;
  parentId: string | null;
  text: string;
  createTime: number | null;
  // Quien comentó: unique_identifier (estable entre APIs) o user_id
  authorKey: string | null;
  username: string | null;
  displayName: string | null;
  // true si lo escribió la propia cuenta
  owner: boolean;
}

function toComment(c: Record<string, unknown>, videoId: string): TikTokComment | null {
  const id = str(c.comment_id);
  if (!id) return null;
  const parent = str(c.parent_comment_id);
  return {
    id,
    videoId: str(c.video_id) ?? videoId,
    parentId: parent && parent !== "0" && parent !== id ? parent : null,
    text: str(c.text) ?? "",
    createTime: c.create_time === undefined ? null : num(c.create_time),
    authorKey: str(c.unique_identifier) ?? str(c.user_id),
    username: str(c.username),
    displayName: str(c.display_name),
    owner: c.owner === true || c.is_owner === true,
  };
}

export async function listComments(
  token: string,
  openId: string,
  videoId: string,
  opts: { commentIds?: string[]; maxCount?: number } = {}
) {
  const d = await call<{ comments?: Record<string, unknown>[] }>("/business/comment/list/", {
    method: "GET",
    token,
    query: {
      business_id: openId,
      video_id: videoId,
      comment_ids: opts.commentIds?.length ? opts.commentIds : undefined,
      max_count: Math.min(opts.maxCount ?? 30, 30),
    },
  });
  return (d.comments ?? []).map((c) => toComment(c, videoId)).filter((c): c is TikTokComment => c !== null);
}

export async function replyToComment(token: string, openId: string, videoId: string, commentId: string, text: string) {
  const d = await call<Record<string, unknown>>("/business/comment/reply/create/", {
    method: "POST",
    token,
    body: { business_id: openId, video_id: videoId, comment_id: commentId, text },
  });
  return { id: str(d.comment_id) ?? str(d.reply_id) ?? null, raw: d };
}

// ---------- Webhook (a nivel de app) ----------

export async function subscribeCommentWebhook(app: TikTokApp, callbackUrl: string) {
  return call<Record<string, unknown>>("/business/webhook/update/", {
    method: "POST",
    body: { app_id: app.appId, secret: app.appSecret, event_type: "COMMENT", callback_url: callbackUrl },
  });
}
