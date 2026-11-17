import { NextRequest, NextResponse } from "next/server";
import { channelsChanged, connectErrorResponse } from "@/lib/channels/api";
import { notConfigured, notFound, parseId } from "@/lib/crm/api-auth";
import { requireSuperadmin } from "@/lib/crm/superadmin-api";
import { isDbConfigured } from "@/lib/db";
import { runPanelAction } from "@/lib/whatsapp-accounts/panel";

export const dynamic = "force-dynamic";

// { action: "subscribe" | "register" | "sync_state" | "sync_history" | "verify" }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperadmin();
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const id = parseId((await params).id);
  if (!id) return notFound("La conexión no existe.");
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  try {
    const result = await runPanelAction(id, body?.action);
    channelsChanged();
    return NextResponse.json(result);
  } catch (err) {
    return connectErrorResponse(err, "No se pudo completar la acción.");
  }
}
