// signed_request de Meta (callbacks de desautorización y de eliminación de datos). Server-only.
// Formato: <firma base64url>.<payload base64url>; firma = HMAC-SHA256(payload en base64url, app secret).
// https://developers.facebook.com/docs/games/gamesonfacebook/login#parsingsr

import { createHmac, timingSafeEqual } from "crypto";

export interface SignedRequest {
  algorithm: string;
  // Id de la persona para esta app (app-scoped)
  user_id: string;
  issued_at?: number;
}

const fromBase64Url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

// Devuelve el payload si la firma es válida; si no, null.
export function parseSignedRequest(signedRequest: unknown, appSecret: string | undefined): SignedRequest | null {
  if (typeof signedRequest !== "string" || !appSecret) return null;
  const [sig, payload, extra] = signedRequest.split(".");
  if (!sig || !payload || extra !== undefined) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const given = fromBase64Url(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(fromBase64Url(payload).toString("utf8")) as Partial<SignedRequest>;
    if (data.algorithm?.toUpperCase() !== "HMAC-SHA256" || !data.user_id) return null;
    return { algorithm: data.algorithm, user_id: String(data.user_id), issued_at: data.issued_at };
  } catch {
    return null;
  }
}

// El body llega como application/x-www-form-urlencoded (signed_request=...).
export async function readSignedRequestParam(req: Request) {
  const body = await req.text();
  return new URLSearchParams(body).get("signed_request");
}
