import { NextRequest, NextResponse } from "next/server";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";
import { errorResponse } from "@/lib/crm/api-errors";
import { inviteUrl } from "@/lib/crm/invite-url";
import { createUser, toTeamUser } from "@/lib/crm/team";
import { getMySqlUsersRepo } from "@/lib/crm/users-mysql";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accountId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAccountApi((await params).accountId, "team");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const users = await getMySqlUsersRepo().listByAccount(auth.accountId);
  return NextResponse.json({ users: users.map(toTeamUser) });
}

// Crea a la persona como "invitada" y devuelve el link para que cree su contraseña.
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAccountApi((await params).accountId, "team");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  try {
    const { user, inviteToken } = await createUser(
      getMySqlUsersRepo(),
      auth.user,
      auth.accountId,
      await req.json().catch(() => null)
    );
    return NextResponse.json({ user, inviteUrl: inviteUrl(req.headers, inviteToken), emailSent: false }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "No se pudo crear el usuario.");
  }
}
