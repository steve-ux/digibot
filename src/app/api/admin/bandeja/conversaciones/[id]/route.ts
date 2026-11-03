import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";
import {
  ConversationActionError,
  applyConversationAction,
  parseConversationAction,
} from "@/lib/crm/conversation-actions";
import { getCurrentUser, getTeam } from "@/lib/crm/session";
import { getInboxStore } from "@/lib/wa-inbox/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Acciones del panel: { action: "resolve" | "reopen" | "take" | "release" }
// { action: "assign", assigneeId } · { action: "tags", tags } · { action: "note", note }
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "not_configured", message: "Faltan las variables de conexión a la base de datos." },
      { status: 503 }
    );
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "not_found", message: "Conversación inválida." }, { status: 404 });
  }

  const input = parseConversationAction(await req.json().catch(() => null));
  if (!input) {
    return NextResponse.json({ error: "invalid_body", message: "Acción inválida." }, { status: 400 });
  }

  try {
    const [store, actor, team] = await Promise.all([getInboxStore(), getCurrentUser(), getTeam()]);
    const result = await applyConversationAction(store, id, input, actor, team);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ConversationActionError) {
      return NextResponse.json({ error: "invalid_action", message: err.message }, { status: err.httpStatus });
    }
    console.error("[crm] No se pudo actualizar la conversación:", err);
    return NextResponse.json(
      { error: "db_error", message: "No se pudo guardar el cambio. Probá de nuevo." },
      { status: 500 }
    );
  }
}
