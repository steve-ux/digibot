import { NextRequest, NextResponse } from "next/server";
import { channelsChanged, channelsRepo, connectErrorResponse } from "@/lib/channels/api";
import { connectWhatsApp } from "@/lib/channels/service";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";

export const dynamic = "force-dynamic";

// Fin del Embedded Signup: { code, wabaId, phoneNumberId } (los manda el SDK de Facebook).
export async function POST(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "channels");
  if (auth.response) return auth.response;
  const repo = channelsRepo();
  if (!repo) return notConfigured();
  try {
    const account = await connectWhatsApp(
      repo,
      { accountId: auth.accountId, userId: auth.user.id },
      await req.json().catch(() => null)
    );
    channelsChanged();
    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    return connectErrorResponse(err, "No se pudo conectar WhatsApp.");
  }
}
