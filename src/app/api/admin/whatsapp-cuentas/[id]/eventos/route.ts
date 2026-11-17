import { NextRequest, NextResponse } from "next/server";
import { connectErrorResponse } from "@/lib/channels/api";
import { notConfigured, notFound, parseId } from "@/lib/crm/api-auth";
import { requireSuperadmin } from "@/lib/crm/superadmin-api";
import { isDbConfigured } from "@/lib/db";
import { connectionEvents } from "@/lib/whatsapp-accounts/panel";

export const dynamic = "force-dynamic";

// Eventos de la sesión de signup con la que se conectó el número.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperadmin();
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const id = parseId((await params).id);
  if (!id) return notFound("La conexión no existe.");
  try {
    return NextResponse.json({ events: await connectionEvents(id) });
  } catch (err) {
    return connectErrorResponse(err, "No se pudieron leer los eventos.");
  }
}
