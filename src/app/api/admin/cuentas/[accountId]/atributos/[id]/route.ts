import { NextRequest, NextResponse } from "next/server";
import { forbidden, notConfigured, notFound, parseId, requireAccountApi } from "@/lib/crm/api-auth";
import { errorResponse } from "@/lib/crm/api-errors";
import { canAccess } from "@/lib/crm/permissions";
import { deleteAttribute, updateAttribute } from "@/lib/crm/settings";
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
  if (!id) return { response: notFound("El atributo no existe.") };
  return { accountId: auth.accountId, id };
}

// { label?, options?, description? } — la clave y el tipo no cambian (el bot ya puede estar usándolos).
export async function PATCH(req: NextRequest, { params }: Params) {
  const g = await guard(params);
  if (g.response) return g.response;
  try {
    const deps = { repo: getMySqlSettingsRepo(), store: await getInboxStore() };
    const attribute = await updateAttribute(deps, g.accountId, g.id, await req.json().catch(() => null));
    return NextResponse.json({ attribute });
  } catch (err) {
    return errorResponse(err, "No se pudo guardar el atributo.");
  }
}

// Borra el atributo y su valor en todas las conversaciones.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const g = await guard(params);
  if (g.response) return g.response;
  try {
    await deleteAttribute({ repo: getMySqlSettingsRepo(), store: await getInboxStore() }, g.accountId, g.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "No se pudo borrar el atributo.");
  }
}
