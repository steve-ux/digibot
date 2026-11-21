import { NextRequest, NextResponse } from "next/server";
import { planDenied } from "@/lib/billing/account-plan";
import { channelsRepo, connectErrorResponse } from "@/lib/channels/api";
import { listInstagramAccounts } from "@/lib/channels/service";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";

export const dynamic = "force-dynamic";

// Paso 1 de Instagram (Unified Login): { code } del login -> cuentas para elegir + selección sellada.
export async function POST(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "channels");
  if (auth.response) return auth.response;
  // Límite del plan: este canal no está incluido.
  const denied = await planDenied(auth.accountId, "instagram");
  if (denied) return denied;
  const repo = channelsRepo();
  if (!repo) return notConfigured();
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(
      await listInstagramAccounts(repo, { accountId: auth.accountId, userId: auth.user.id }, body?.code)
    );
  } catch (err) {
    return connectErrorResponse(err, "No se pudieron leer las cuentas de Instagram.");
  }
}
