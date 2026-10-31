// Webhook público de la WhatsApp Cloud API. Queda fuera del matcher del middleware
// (sin sesión de admin): la autenticidad se valida con X-Hub-Signature-256.

import { isValidSignature, isValidVerifyToken, processWebhookPayload } from "@/lib/wa-inbox/webhook";

export const dynamic = "force-dynamic";

// Verificación de la suscripción (Meta > App > WhatsApp > Configuración > Webhook).
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (
    mode === "subscribe" &&
    challenge &&
    isValidVerifyToken(token, process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)
  ) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  // La firma se calcula sobre el body crudo: hay que leerlo como texto antes de parsear.
  const rawBody = await req.text();

  if (!process.env.META_APP_SECRET) {
    console.error("[wa-webhook] Falta META_APP_SECRET: no se puede validar la firma.");
  }
  if (!isValidSignature(rawBody, req.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("[wa-webhook] Body firmado pero no es JSON válido.");
    return new Response("OK", { status: 200 });
  }

  // Se procesa antes de responder (son unas pocas queries). Si falla, se devuelve
  // 500 para que Meta reintente; la idempotencia por wamid evita duplicados.
  try {
    await processWebhookPayload(payload);
  } catch (err) {
    console.error("[wa-webhook] Error procesando el webhook:", err);
    return new Response("Error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
