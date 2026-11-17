import { NextRequest, NextResponse } from "next/server";
import { notConfigured, parseId, requireAccountApi } from "@/lib/crm/api-auth";
import { isDbConfigured } from "@/lib/db";
import { listUnreadNotifications, markNotificationRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accountId: string }> };

// Avisos sin leer de la cuenta (ej: "WhatsApp desconectado").
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAccountApi((await params).accountId, "inbox");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return NextResponse.json({ notifications: [] });
  try {
    return NextResponse.json({ notifications: await listUnreadNotifications(auth.accountId) });
  } catch {
    // Sin la migración 0015 no hay avisos: el panel sigue igual.
    return NextResponse.json({ notifications: [] });
  }
}

// { id }: marcar como leído.
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAccountApi((await params).accountId, "inbox");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = parseId(String(body?.id ?? ""));
  if (!id) return NextResponse.json({ error: "invalid_body", message: "Aviso inválido." }, { status: 400 });
  await markNotificationRead(auth.accountId, id);
  return NextResponse.json({ ok: true });
}
