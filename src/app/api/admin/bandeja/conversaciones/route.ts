import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { getInboxStore } from "@/lib/wa-inbox/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "not_configured", message: "Faltan las variables de conexión a la base de datos." },
      { status: 503 }
    );
  }

  try {
    const store = await getInboxStore();
    const conversations = await store.listConversations(200);
    return NextResponse.json({ conversations });
  } catch (err) {
    console.error("[wa-inbox] No se pudo listar las conversaciones:", err);
    return NextResponse.json(
      { error: "db_error", message: "No se pudieron cargar las conversaciones." },
      { status: 500 }
    );
  }
}
