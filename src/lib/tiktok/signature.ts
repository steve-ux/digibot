// Firma de los webhooks de TikTok. Server-only.
// Header TikTok-Signature: "t=<unix>,s=<hex>" con s = HMAC-SHA256(secreto de la app, "<t>.<body crudo>").

import { createHmac, timingSafeEqual } from "node:crypto";

// Diferencia máxima aceptada entre el envío y la llegada (evita reenvíos viejos).
const MAX_AGE_SECONDS = 5 * 60;

export function isValidTikTokSignature(rawBody: string, header: string | null, secret: string | undefined, now = Date.now()) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !/^[0-9a-f]+$/i.test(parts.s ?? "")) return false;
  if (Math.abs(Math.floor(now / 1000) - t) > MAX_AGE_SECONDS) return false;
  const received = Buffer.from(parts.s, "hex");
  const matches = (body: string) => {
    const expected = createHmac("sha256", secret).update(`${parts.t}.${body}`, "utf8").digest();
    return received.length === expected.length && timingSafeEqual(received, expected);
  };
  if (matches(rawBody)) return true;
  // TikTok firma "una copia en JSON del body": por si el texto llega con otros espacios.
  // (Los ids grandes viajan dentro de content como string, así que re-serializar no los toca.)
  try {
    return matches(JSON.stringify(JSON.parse(rawBody)));
  } catch {
    return false;
  }
}

