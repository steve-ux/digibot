import { NextRequest, NextResponse } from "next/server";
import { notConfigured, notFound, parseId, requireApiUser } from "@/lib/crm/api-auth";
import { errorResponse } from "@/lib/crm/api-errors";
import { updateAccount } from "@/lib/crm/accounts";
import { getMySqlAccountsRepo } from "@/lib/crm/accounts-mysql";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

// { name?, status? } — renombrar o suspender una cuenta (solo superadmin).
// Suspendida: nadie de esa cuenta puede entrar; los superadmins sí.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireApiUser("accounts");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const id = parseId((await params).accountId);
  if (!id) return notFound("La cuenta no existe.");
  try {
    const account = await updateAccount(getMySqlAccountsRepo(), id, await req.json().catch(() => null));
    return NextResponse.json({ account });
  } catch (err) {
    return errorResponse(err, "No se pudo guardar la cuenta.");
  }
}
