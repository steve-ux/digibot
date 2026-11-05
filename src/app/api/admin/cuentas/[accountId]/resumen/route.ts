import { NextResponse } from "next/server";
import { requireAccountApi } from "@/lib/crm/api-auth";
import { canUseChannel } from "@/lib/crm/permissions";
import { isDbConfigured } from "@/lib/db";
import { getInboxStore } from "@/lib/wa-inbox/store";

export const dynamic = "force-dynamic";

// Resumen liviano para el badge del menú cuando no se está en la bandeja.
export async function GET(_req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "inbox");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return NextResponse.json({ unread: 0, open: 0, lastInbound: {} });
  try {
    const store = await getInboxStore();
    const visible = (await store.listConversations(auth.accountId, 500)).filter((c) => canUseChannel(auth.user, c.channel));
    const open = visible.filter((c) => c.status !== "resolved");
    const unread = open.reduce((sum, c) => sum + c.unreadCount, 0);
    // Último mensaje del cliente por canal: el panel lo compara entre lecturas para el sonido.
    const lastInbound: Partial<Record<string, number>> = {};
    for (const c of visible) {
      if (c.lastInboundAt && c.lastInboundAt > (lastInbound[c.channel] ?? 0)) lastInbound[c.channel] = c.lastInboundAt;
    }
    return NextResponse.json({ unread, open: open.length, lastInbound });
  } catch (err) {
    console.error("[crm] No se pudo calcular el resumen:", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
