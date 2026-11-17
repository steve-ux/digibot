import { NextRequest, NextResponse } from "next/server";
import { connectErrorResponse } from "@/lib/channels/api";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";
import { isDbConfigured } from "@/lib/db";
import { pollSignup } from "@/lib/whatsapp-accounts/onboarding";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accountId: string; sessionId: string }> };

// Progreso de la conexión (lo consulta la pantalla cada pocos segundos).
export async function GET(_req: NextRequest, { params }: Params) {
  const { accountId, sessionId } = await params;
  const auth = await requireAccountApi(accountId, "channels");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  try {
    return NextResponse.json(await pollSignup({ accountId: auth.accountId, userId: auth.user.id }, sessionId));
  } catch (err) {
    return connectErrorResponse(err, "No se pudo leer el estado de la conexión.");
  }
}
