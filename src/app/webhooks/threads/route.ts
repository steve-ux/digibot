// Webhook público de Threads (respuestas y menciones en los hilos de la cuenta).
// En Meta: App > Threads > Webhooks -> https://<dominio>/webhooks/threads
// La firma usa THREADS_APP_SECRET si la app de Threads tiene un secreto propio;
// si no, META_APP_SECRET.

import { processThreadsWebhook } from "@/lib/meta-social/webhook";
import { isValidSignature, isValidVerifyToken } from "@/lib/wa-inbox/webhook";

export const dynamic = "force-dynamic";

const verifyToken = () =>
  process.env.THREADS_WEBHOOK_VERIFY_TOKEN ||
  process.env.META_WEBHOOK_VERIFY_TOKEN ||
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const appSecret = () => process.env.THREADS_APP_SECRET || process.env.META_APP_SECRET;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const challenge = params.get("hub.challenge");
  if (
    params.get("hub.mode") === "subscribe" &&
    challenge &&
    isValidVerifyToken(params.get("hub.verify_token"), verifyToken())
  ) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!appSecret()) console.error("[threads-webhook] Falta THREADS_APP_SECRET / META_APP_SECRET.");
  if (!isValidSignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret())) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("OK", { status: 200 });
  }

  try {
    await processThreadsWebhook(payload);
  } catch (err) {
    console.error("[threads-webhook] Error procesando el webhook:", err);
    return new Response("Error", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
