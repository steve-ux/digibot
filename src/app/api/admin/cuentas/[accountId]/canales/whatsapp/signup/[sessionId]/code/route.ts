import { NextRequest, NextResponse } from "next/server";
import { channelsChanged, connectErrorResponse } from "@/lib/channels/api";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";
import { isDbConfigured } from "@/lib/db";
import { submitSignupCode } from "@/lib/whatsapp-accounts/onboarding";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accountId: string; sessionId: string }> };

// Code del callback de FB.login: { code }. Vence a los 30 s, se canjea en el acto.
export async function POST(req: NextRequest, { params }: Params) {
  const { accountId, sessionId } = await params;
  const auth = await requireAccountApi(accountId, "channels");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  try {
    const progress = await submitSignupCode({ accountId: auth.accountId, userId: auth.user.id }, sessionId, body?.code);
    channelsChanged();
    return NextResponse.json(progress);
  } catch (err) {
    return connectErrorResponse(err, "No se pudo completar la conexión de WhatsApp.");
  }
}
