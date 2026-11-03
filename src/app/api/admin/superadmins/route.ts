import { NextRequest, NextResponse } from "next/server";
import { notConfigured, requireApiUser } from "@/lib/crm/api-auth";
import { errorResponse } from "@/lib/crm/api-errors";
import { inviteUrl } from "@/lib/crm/invite-url";
import { createSuperadmin, toTeamUser } from "@/lib/crm/team";
import { getMySqlUsersRepo } from "@/lib/crm/users-mysql";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser("accounts");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  return NextResponse.json({ users: (await getMySqlUsersRepo().listSuperadmins()).map(toTeamUser) });
}

// { name, email } — si el email ya existe, esa persona pasa a superadmin (conserva su contraseña).
export async function POST(req: NextRequest) {
  const auth = await requireApiUser("accounts");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  try {
    const { user, inviteToken, promoted } = await createSuperadmin(getMySqlUsersRepo(), await req.json().catch(() => null));
    return NextResponse.json(
      { user, promoted, inviteUrl: inviteToken ? inviteUrl(req.headers, inviteToken) : null },
      { status: 201 }
    );
  } catch (err) {
    return errorResponse(err, "No se pudo crear el superadmin.");
  }
}
