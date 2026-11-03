import { NextRequest, NextResponse } from "next/server";
import { forbidden, notConfigured, requireAccountApi } from "@/lib/crm/api-auth";
import { errorResponse } from "@/lib/crm/api-errors";
import { canAccess } from "@/lib/crm/permissions";
import { createLabel } from "@/lib/crm/settings";
import { getMySqlSettingsRepo } from "@/lib/crm/settings-mysql";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accountId: string }> };

// Etiquetas de la cuenta. Las lee cualquiera que use la bandeja; las crea un administrador.
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAccountApi((await params).accountId, "inbox");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  try {
    return NextResponse.json({ labels: await getMySqlSettingsRepo().listLabels(auth.accountId) });
  } catch (err) {
    return errorResponse(err, "No se pudieron cargar las etiquetas.");
  }
}

// { name, color, description? }
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAccountApi((await params).accountId, "inbox");
  if (auth.response) return auth.response;
  if (!canAccess(auth.user.role, "settings")) return forbidden();
  if (!isDbConfigured()) return notConfigured();
  try {
    const label = await createLabel({ repo: getMySqlSettingsRepo() }, auth.accountId, await req.json().catch(() => null));
    return NextResponse.json({ label }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "No se pudo crear la etiqueta.");
  }
}
