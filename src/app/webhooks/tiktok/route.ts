// Webhook público de TikTok (comment.update de las cuentas conectadas).
// Se suscribe una sola vez por app: node scripts/tiktok-webhook.mjs subscribe
//
// Firma: header TikTok-Signature "t=<unix>,s=<hex>" = HMAC-SHA256(TIKTOK_APP_SECRET, "<t>.<body>").
// Se firma el body tal cual llega, por eso se lee como texto antes de parsearlo.

import { parseJsonSafe } from "@/lib/tiktok/api";
import { processTikTokWebhook } from "@/lib/tiktok/ingest";
import { isValidTikTokSignature } from "@/lib/tiktok/signature";

export const dynamic = "force-dynamic";

// TikTok puede probar que la URL responde.
export async function GET() {
  return new Response("OK", { status: 200 });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const secret = process.env.TIKTOK_APP_SECRET;
  if (!secret) console.error("[tiktok-webhook] Falta TIKTOK_APP_SECRET.");
  if (!isValidTikTokSignature(rawBody, req.headers.get("tiktok-signature"), secret)) {
    console.warn("[tiktok-webhook] Firma inválida. x-tt-logid:", req.headers.get("x-tt-logid"));
    return new Response("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = parseJsonSafe(rawBody);
  } catch {
    return new Response("OK", { status: 200 });
  }

  try {
    await processTikTokWebhook(payload);
  } catch (err) {
    console.error("[tiktok-webhook] Error procesando el webhook:", err);
    return new Response("Error", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
