import { NextRequest, NextResponse } from "next/server";
import { notConfigured, requireApiUser } from "@/lib/crm/api-auth";
import { errorResponse } from "@/lib/crm/api-errors";
import { createAccount } from "@/lib/crm/accounts";
import { getMySqlAccountsRepo } from "@/lib/crm/accounts-mysql";
import { inviteUrl } from "@/lib/crm/invite-url";
import { getMySqlSettingsRepo } from "@/lib/crm/settings-mysql";
import { getMySqlUsersRepo } from "@/lib/crm/users-mysql";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

// Listado de cuentas (solo superadmin).
export async function GET() {
  const auth = await requireApiUser("accounts");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  try {
    return NextResponse.json({ accounts: await getMySqlAccountsRepo().list() });
  } catch (err) {
    return errorResponse(err, "No se pudieron cargar las cuentas.");
  }
}

// { name, adminName?, adminEmail? } — crea la cuenta y, si se indica, invita a su administrador.
export async function POST(req: NextRequest) {
  const auth = await requireApiUser("accounts");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  try {
    const { account, admin, inviteToken } = await createAccount(
      { accounts: getMySqlAccountsRepo(), users: getMySqlUsersRepo(), settings: getMySqlSettingsRepo() },
      auth.user,
      await req.json().catch(() => null)
    );
    return NextResponse.json(
      { account, admin, inviteUrl: inviteToken ? inviteUrl(req.headers, inviteToken) : null },
      { status: 201 }
    );
  } catch (err) {
    return errorResponse(err, "No se pudo crear la cuenta.");
  }
}
