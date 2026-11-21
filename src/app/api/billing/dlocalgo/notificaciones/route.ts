// POST /api/billing/dlocalgo/notificaciones: notification_url de los pagos.
//
// dLocal Go manda {"payment_id": "..."} firmado:
//   Authorization: V2-HMAC-SHA256, Signature: HMAC-SHA256(secret, apiKey + rawBody)
// Se verifica la firma, se lee el estado real con GET /v1/payments/{id} y se aplica
// de forma idempotente. Si devolvemos algo distinto de 200, dLocal reintenta cada
// 10 minutos durante 30 días: por eso un error transitorio responde 500 a propósito.

import { NextRequest, NextResponse } from "next/server";
import { getDlocalConfig, verifyNotificationSignature } from "@/lib/billing/dlocalgo";
import { getBillingDeps } from "@/lib/billing/runtime";
import { handleNotification } from "@/lib/billing/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const config = getDlocalConfig();
  const deps = getBillingDeps();
  if (!config || !deps) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const raw = await req.text();
  if (!verifyNotificationSignature(req.headers.get("authorization"), raw, config)) {
    console.warn("[billing] Notificación con firma inválida: descartada.");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  try {
    const result = await handleNotification(deps, raw);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[billing] No se pudo procesar la notificación:", (err as Error).message);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
}
