import { NextRequest, NextResponse } from "next/server";
import { connectErrorResponse } from "@/lib/channels/api";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";
import { isDbConfigured } from "@/lib/db";
import { createSignupSession } from "@/lib/whatsapp-accounts/onboarding";

export const dynamic = "force-dynamic";

// Nueva sesión de Embedded Signup: { reconnectId? } -> { sessionId }.
// (La página de Canales ya trae una; esta sirve para el siguiente intento o para "Reconectar".)
export async function POST(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "channels");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const body = (await req.json().catch(() => null)) as { reconnectId?: unknown } | null;
  try {
    const session = await createSignupSession({ accountId: auth.accountId, userId: auth.user.id }, { reconnectId: body?.reconnectId });
    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    return connectErrorResponse(err, "No se pudo iniciar la conexión de WhatsApp.");
  }
}
