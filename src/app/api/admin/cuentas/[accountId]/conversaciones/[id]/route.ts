import { NextRequest, NextResponse } from "next/server";
import { conversationFor, notConfigured, notFound, parseId, requireAccountApi } from "@/lib/crm/api-auth";
import {
  ConversationActionError,
  applyConversationAction,
  parseConversationAction,
} from "@/lib/crm/conversation-actions";
import { getTeam } from "@/lib/crm/session";
import { getMySqlSettingsRepo } from "@/lib/crm/settings-mysql";
import { isDbConfigured } from "@/lib/db";
import { getInboxStore } from "@/lib/wa-inbox/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accountId: string; id: string }> };

// Una conversación (para el bot o integraciones: /api/admin/cuentas/7/conversaciones/11).
export async function GET(_req: NextRequest, { params }: Params) {
  const { accountId, id: rawId } = await params;
  const auth = await requireAccountApi(accountId, "inbox");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const id = parseId(rawId);
  if (!id) return notFound("La conversación no existe.");
  try {
    const access = await conversationFor(auth.user, auth.accountId, id);
    if (access.response) return access.response;
    return NextResponse.json({ conversation: access.conversation });
  } catch (err) {
    console.error("[crm] No se pudo leer la conversación:", err);
    return NextResponse.json({ error: "db_error", message: "No se pudo cargar la conversación." }, { status: 500 });
  }
}

// Acciones del panel: { action: "resolve" | "reopen" | "take" | "release" }
// { action: "assign", assigneeId } · { action: "tags", tags } · { action: "note", note }
// { action: "attributes", values: { dni: "30111222", obra_social: null } }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { accountId, id: rawId } = await params;
  const auth = await requireAccountApi(accountId, "inbox");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();

  const id = parseId(rawId);
  if (!id) return notFound("Conversación inválida.");

  const input = parseConversationAction(await req.json().catch(() => null));
  if (!input) {
    return NextResponse.json({ error: "invalid_body", message: "Acción inválida." }, { status: 400 });
  }

  try {
    const access = await conversationFor(auth.user, auth.accountId, id);
    if (access.response) return access.response;
    const needsSettings = input.action === "tags" || input.action === "attributes";
    const settings = getMySqlSettingsRepo();
    const [store, team, labels, attributes] = await Promise.all([
      getInboxStore(),
      getTeam(auth.accountId, auth.user),
      needsSettings ? settings.listLabels(auth.accountId) : Promise.resolve(undefined),
      needsSettings ? settings.listAttributes(auth.accountId) : Promise.resolve(undefined),
    ]);
    const result = await applyConversationAction(store, id, input, auth.user, {
      team,
      labels: labels?.map((l) => l.name),
      attributes,
    });
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
