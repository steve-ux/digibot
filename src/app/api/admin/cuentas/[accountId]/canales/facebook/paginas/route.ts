import { NextRequest, NextResponse } from "next/server";
import { channelsRepo, connectErrorResponse } from "@/lib/channels/api";
import { listFacebookPages } from "@/lib/channels/service";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";

export const dynamic = "force-dynamic";

// Paso 1 de Facebook/Instagram: { code } del login -> páginas para elegir + selección sellada.
export async function POST(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "channels");
  if (auth.response) return auth.response;
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
