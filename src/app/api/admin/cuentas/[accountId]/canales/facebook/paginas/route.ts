import { NextRequest, NextResponse } from "next/server";
import { planDenied } from "@/lib/billing/account-plan";
import { channelsRepo, connectErrorResponse } from "@/lib/channels/api";
import { listFacebookPages } from "@/lib/channels/service";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";

export const dynamic = "force-dynamic";

// Paso 1 de Facebook: { code } del login -> páginas para elegir + selección sellada.
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
    return NextResponse.json(
      await listFacebookPages(repo, { accountId: auth.accountId, userId: auth.user.id }, body?.code)
    );
  } catch (err) {
    return connectErrorResponse(err, "No se pudieron leer las páginas.");
  }
}
