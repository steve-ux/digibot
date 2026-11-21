import { NextRequest, NextResponse } from "next/server";
import { planDenied } from "@/lib/billing/account-plan";
import { channelsChanged, channelsRepo, connectErrorResponse } from "@/lib/channels/api";
import { connectFacebookPages } from "@/lib/channels/service";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";

export const dynamic = "force-dynamic";

// Paso 2: { selection, choices: ["<page id>", ...] }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "channels");
  if (auth.response) return auth.response;
  // Límite del plan: este canal no está incluido.
  const denied = await planDenied(auth.accountId, "facebook");
  if (denied) return denied;
  const repo = channelsRepo();
  if (!repo) return notConfigured();
  try {
    const body = await req.json().catch(() => ({}));
    const accounts = await connectFacebookPages(
      repo,
      { accountId: auth.accountId, userId: auth.user.id },
      body?.selection,
      body?.choices
    );
    channelsChanged();
    return NextResponse.json({ accounts }, { status: 201 });
  } catch (err) {
    return connectErrorResponse(err, "No se pudo conectar la página.");
  }
}
