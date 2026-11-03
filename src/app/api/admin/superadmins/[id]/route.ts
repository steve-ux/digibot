import { NextRequest, NextResponse } from "next/server";
import { notConfigured, notFound, parseId, requireApiUser } from "@/lib/crm/api-auth";
import { errorResponse } from "@/lib/crm/api-errors";
import { inviteUrl } from "@/lib/crm/invite-url";
import { regenerateSuperadminInvite, updateSuperadmin } from "@/lib/crm/team";
import { getMySqlUsersRepo } from "@/lib/crm/users-mysql";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// { name?, status?: "active" | "disabled" }
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireApiUser("accounts");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const id = parseId((await params).id);
  if (!id) return notFound("La persona no existe.");
  try {
    const user = await updateSuperadmin(getMySqlUsersRepo(), auth.user, id, await req.json().catch(() => null));
    return NextResponse.json({ user });
  } catch (err) {
    return errorResponse(err, "No se pudo guardar el cambio.");
  }
}

// Link nuevo (invitación pendiente o nueva contraseña).
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireApiUser("accounts");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const id = parseId((await params).id);
  if (!id) return notFound("La persona no existe.");
  try {
    const { inviteToken } = await regenerateSuperadminInvite(getMySqlUsersRepo(), id);
    return NextResponse.json({ inviteUrl: inviteUrl(req.headers, inviteToken) });
  } catch (err) {
    return errorResponse(err, "No se pudo generar el link.");
  }
}
