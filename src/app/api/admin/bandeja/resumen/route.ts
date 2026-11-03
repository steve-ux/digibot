import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { getInboxStore } from "@/lib/wa-inbox/store";

export const dynamic = "force-dynamic";

// Resumen liviano para el badge del menú cuando no se está en la bandeja.
export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ unread: 0, open: 0 });
  try {
    const store = await getInboxStore();
    const conversations = await store.listConversations(500);
    const unread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
    return NextResponse.json({ unread, open: conversations.length });
  } catch (err) {
    console.error("[crm] No se pudo calcular el resumen:", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
