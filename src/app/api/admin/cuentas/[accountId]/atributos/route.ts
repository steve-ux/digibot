import { NextRequest, NextResponse } from "next/server";
import { forbidden, notConfigured, requireAccountApi } from "@/lib/crm/api-auth";
import { errorResponse } from "@/lib/crm/api-errors";
import { canAccess } from "@/lib/crm/permissions";
import { createAttribute } from "@/lib/crm/settings";
import { getMySqlSettingsRepo } from "@/lib/crm/settings-mysql";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accountId: string }> };

// Atributos propios de la cuenta. Los lee cualquiera que use la bandeja; los crea un administrador.
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAccountApi((await params).accountId, "inbox");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  try {
    return NextResponse.json({ attributes: await getMySqlSettingsRepo().listAttributes(auth.accountId) });
  } catch (err) {
    return errorResponse(err, "No se pudieron cargar los atributos.");
  }
}

// { label, key?, type, options?, description? } (key sale del nombre si no viene)
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAccountApi((await params).accountId, "inbox");
  if (auth.response) return auth.response;
  if (!canAccess(auth.user.role, "settings")) return forbidden();
  if (!isDbConfigured()) return notConfigured();
  try {
    const attribute = await createAttribute({ repo: getMySqlSettingsRepo() }, auth.accountId, await req.json().catch(() => null));
    return NextResponse.json({ attribute }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "No se pudo crear el atributo.");
  }
}
