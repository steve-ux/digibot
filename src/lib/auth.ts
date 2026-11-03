// Sesión del panel. Usa Web Crypto (disponible tanto en Node como en el runtime
// Edge del middleware) para no depender del módulo "crypto" de Node.
//
// Token: base64url(JSON {uid, role, acc, ver, exp}) + "." + HMAC-SHA256 en hex.
//   uid 0 = acceso inicial (contraseña compartida), solo mientras no haya un superadmin activo.
//   acc   = cuenta (web_clients.id) de la persona; null para el superadmin, que entra a todas.
//   ver   = session_version del usuario: si cambia (desactivado, nueva contraseña) la sesión deja de valer.
// El middleware solo verifica firma y vencimiento; las APIs además validan contra la base.

import type { CrmRole } from "./crm/permissions";

export const SESSION_COOKIE = "digibot_admin_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 horas

export interface SessionPayload {
  uid: number;
  role: CrmRole;
  acc: number | null;
  ver: number;
  exp: number;
}

export type SessionInput = Omit<SessionPayload, "exp">;

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("Falta ADMIN_SESSION_SECRET en las variables de entorno");
  }
  return secret;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

async function sign(value: string) {
  const key = await hmacKey(getSecret());
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toHex(signature);
}

function timingSafeEqualStr(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function createSessionToken(user: SessionInput) {
  const payload: SessionPayload = { ...user, exp: Date.now() + SESSION_TTL_MS };
  const encoded = toBase64Url(JSON.stringify(payload));
  return `${encoded}.${await sign(encoded)}`;
}

const ROLES: CrmRole[] = ["superadmin", "admin", "supervisor", "agent"];

// El superadmin no tiene cuenta; el resto, siempre una.
function validAccount(role: CrmRole, acc: unknown) {
  if (role === "superadmin") return acc === null;
  return Number.isInteger(acc) && (acc as number) > 0;
}

export async function parseSessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = await sign(encoded);
  if (!timingSafeEqualStr(signature, expected)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(encoded)) as SessionPayload;
    if (
      !Number.isInteger(payload.uid) ||
      payload.uid < 0 ||
      !ROLES.includes(payload.role) ||
      !validAccount(payload.role, payload.acc) ||
      !Number.isInteger(payload.ver) ||
      !Number.isFinite(payload.exp) ||
      Date.now() > payload.exp
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function isValidSessionToken(token: string | undefined | null): Promise<boolean> {
  return (await parseSessionToken(token)) !== null;
}

export function checkAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PANEL_PASSWORD;
  if (!expected) return false;
  return timingSafeEqualStr(password, expected) && password.length === expected.length;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
};
