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
  if (!isDbConfigured()) return NextResponse.json({ unread: 0, open: 0 });
  try {
    const store = await getInboxStore();
    const open = (await store.listConversations(auth.accountId, 500)).filter(
      (c) => c.status !== "resolved" && canUseChannel(auth.user, c.channel)
    );
    const unread = open.reduce((sum, c) => sum + c.unreadCount, 0);
    return NextResponse.json({ unread, open: open.length });
  } catch (err) {
    console.error("[crm] No se pudo calcular el resumen:", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
