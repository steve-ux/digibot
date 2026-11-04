import { NextRequest, NextResponse } from "next/server";
import { channelsRepo, connectErrorResponse } from "@/lib/channels/api";
import { channelsOverview } from "@/lib/channels/overview";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";

export const dynamic = "force-dynamic";

// Canales conectados de la cuenta y qué se puede conectar.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "channels");
  if (auth.response) return auth.response;
  const repo = channelsRepo();
  if (!repo) return notConfigured();
  try {
    return NextResponse.json(await channelsOverview(repo, auth.accountId));
  } catch (err) {
    return connectErrorResponse(err, "No se pudieron cargar los canales.");
  }
}
