// Sobres cifrados y con vencimiento (AES-256-GCM, ver src/lib/crypto.ts). Server-only.
//
// Sirven para dos cosas sin tener que guardar nada en la base:
//   - el "state" de OAuth (Threads): ata el login a la cuenta y a la persona y evita CSRF
//   - las páginas para elegir después del login de Facebook: los tokens viajan
//     cifrados por el navegador y solo el servidor los puede abrir
// GCM ya autentica: si alguien toca el sobre, no se abre.

import { decryptSecret, encryptSecret } from "../crypto";

interface Envelope<T> {
  p: string; // propósito
  a: number; // cuenta
  u: number; // persona
  e: number; // vence (unix)
  d: T;
}

export function seal<T>(purpose: string, accountId: number, userId: number, data: T, ttlSeconds: number) {
  const envelope: Envelope<T> = {
    p: purpose,
    a: accountId,
    u: userId,
    e: Math.floor(Date.now() / 1000) + ttlSeconds,
    d: data,
  };
  return Buffer.from(encryptSecret(JSON.stringify(envelope))).toString("base64url");
}

// Devuelve los datos solo si el sobre es para este propósito, cuenta y persona, y no venció.
export function unseal<T>(
  token: unknown,
  purpose: string,
  expected: { accountId?: number; userId: number }
): { accountId: number; data: T } | null {
  if (typeof token !== "string" || !token || token.length > 200_000) return null;
  try {
    const envelope = JSON.parse(decryptSecret(Buffer.from(token, "base64url").toString("utf8"))) as Envelope<T>;
    if (envelope.p !== purpose || envelope.u !== expected.userId) return null;
    if (expected.accountId !== undefined && envelope.a !== expected.accountId) return null;
    if (envelope.e < Math.floor(Date.now() / 1000)) return null;
    return { accountId: envelope.a, data: envelope.d };
  } catch {
    return null;
  }
}
