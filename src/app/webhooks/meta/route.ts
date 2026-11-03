// Webhook público de Messenger e Instagram (DMs y comentarios). Queda fuera del
// matcher del middleware; la autenticidad se valida con X-Hub-Signature-256.
// En Meta: App > Messenger / Instagram > Webhooks -> https://<dominio>/webhooks/meta
// (WhatsApp sigue usando /webhooks/whatsapp).

import { processSocialWebhook } from "@/lib/meta-social/webhook";
import { isValidSignature, isValidVerifyToken } from "@/lib/wa-inbox/webhook";

export const dynamic = "force-dynamic";

const verifyToken = () => process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

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
  if (!process.env.META_APP_SECRET) {
    console.error("[meta-webhook] Falta META_APP_SECRET: no se puede validar la firma.");
  }
  if (!isValidSignature(rawBody, req.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("[meta-webhook] Body firmado pero no es JSON válido.");
    return new Response("OK", { status: 200 });
  }

  // Si falla se devuelve 500 para que Meta reintente; la idempotencia por mid evita duplicados.
  try {
    await processSocialWebhook(payload);
  } catch (err) {
    console.error("[meta-webhook] Error procesando el webhook:", err);
    return new Response("Error", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
