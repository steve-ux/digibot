import { NextRequest } from "next/server";
import { notFound, parseId, requireAccountApi } from "@/lib/crm/api-auth";
import { inviteUrl } from "@/lib/crm/invite-url";
import { regenerateInvite, updateUser } from "@/lib/crm/team";
import { getMySqlUsersRepo } from "@/lib/crm/users-mysql";
import { isDbConfigured } from "@/lib/db";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/crm/api-errors";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accountId: string; id: string }> };

// Editar nombre, rol, canales o { status: "disabled" | "active" }.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { accountId, id: rawId } = await params;
  const auth = await requireAccountApi(accountId, "team");
  if (auth.response) return auth.response;
  const id = parseId(rawId);
  if (!id || !isDbConfigured()) return notFound("La persona no existe.");
  try {
    const user = await updateUser(getMySqlUsersRepo(), auth.user, auth.accountId, id, await req.json().catch(() => null));
    return NextResponse.json({ user });
  } catch (err) {
    return errorResponse(err, "No se pudo guardar el cambio.");
  }
}

// Genera un link de invitación nuevo (el anterior deja de servir).
export async function POST(req: NextRequest, { params }: Params) {
  const { accountId, id: rawId } = await params;
  const auth = await requireAccountApi(accountId, "team");
  if (auth.response) return auth.response;
  const id = parseId(rawId);
  if (!id || !isDbConfigured()) return notFound("La persona no existe.");
  try {
    const { inviteToken } = await regenerateInvite(getMySqlUsersRepo(), auth.user, auth.accountId, id);
    return NextResponse.json({ inviteUrl: inviteUrl(req.headers, inviteToken), emailSent: false });
  } catch (err) {
    return errorResponse(err, "No se pudo generar el link.");
  }
}
