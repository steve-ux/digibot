import { NextRequest, NextResponse } from "next/server";
import { forbidden, notConfigured, notFound, parseId, requireAccountApi } from "@/lib/crm/api-auth";
import { errorResponse } from "@/lib/crm/api-errors";
import { canAccess } from "@/lib/crm/permissions";
import { deleteLabel, updateLabel } from "@/lib/crm/settings";
import { getMySqlSettingsRepo } from "@/lib/crm/settings-mysql";
import { isDbConfigured } from "@/lib/db";
import { getInboxStore } from "@/lib/wa-inbox/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accountId: string; id: string }> };

async function guard(params: Params["params"]) {
  const { accountId, id: rawId } = await params;
  const auth = await requireAccountApi(accountId, "settings");
  if (auth.response) return { response: auth.response };
  if (!canAccess(auth.user.role, "settings")) return { response: forbidden() };
  if (!isDbConfigured()) return { response: notConfigured() };
  const id = parseId(rawId);
  if (!id) return { response: notFound("La etiqueta no existe.") };
  return { accountId: auth.accountId, id };
}

// { name?, color?, description? } — renombrar actualiza las conversaciones que la tienen.
export async function PATCH(req: NextRequest, { params }: Params) {
  const g = await guard(params);
  if (g.response) return g.response;
  try {
    const deps = { repo: getMySqlSettingsRepo(), store: await getInboxStore() };
    const label = await updateLabel(deps, g.accountId, g.id, await req.json().catch(() => null));
    return NextResponse.json({ label });
  } catch (err) {
    return errorResponse(err, "No se pudo guardar la etiqueta.");
  }
}

// Borra la etiqueta y la saca de todas las conversaciones.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const g = await guard(params);
  if (g.response) return g.response;
  try {
    await deleteLabel({ repo: getMySqlSettingsRepo(), store: await getInboxStore() }, g.accountId, g.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "No se pudo borrar la etiqueta.");
  }
}
