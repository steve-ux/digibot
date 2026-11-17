import { NextRequest, NextResponse } from "next/server";
import { channelsChanged, connectErrorResponse } from "@/lib/channels/api";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";
import { isDbConfigured } from "@/lib/db";
import { submitSignupEvent } from "@/lib/whatsapp-accounts/onboarding";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accountId: string; sessionId: string }> };

// Evento WA_EMBEDDED_SIGNUP que el popup de Meta mandó por postMessage: { event }.
export async function POST(req: NextRequest, { params }: Params) {
  const { accountId, sessionId } = await params;
  const auth = await requireAccountApi(accountId, "channels");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const text = await req.text();
  if (text.length > 20_000) return NextResponse.json({ error: "too_large", message: "Evento demasiado grande." }, { status: 413 });
  let body: { event?: unknown } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    // body inválido: se trata como evento vacío
  }
  try {
    const progress = await submitSignupEvent({ accountId: auth.accountId, userId: auth.user.id }, sessionId, body?.event);
    channelsChanged();
    return NextResponse.json(progress);
  } catch (err) {
    return connectErrorResponse(err, "No se pudo registrar el paso de la conexión.");
  }
}
