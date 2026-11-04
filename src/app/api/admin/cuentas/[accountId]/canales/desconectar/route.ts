import { NextRequest, NextResponse } from "next/server";
import { channelsChanged, channelsRepo, connectErrorResponse } from "@/lib/channels/api";
import { disconnectChannel } from "@/lib/channels/service";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";

export const dynamic = "force-dynamic";

// { key: "wa:12" | "social:5" } — deja de recibir y enviar por esa cuenta y borra su token.
export async function POST(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "channels");
  if (auth.response) return auth.response;
  const repo = channelsRepo();
  if (!repo) return notConfigured();
  try {
    const body = await req.json().catch(() => ({}));
    await disconnectChannel(repo, auth.accountId, body?.key);
    channelsChanged();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return connectErrorResponse(err, "No se pudo desconectar.");
  }
}
