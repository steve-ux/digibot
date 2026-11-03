// Contexto de las páginas de una cuenta (/admin/cuentas/:cuenta/...). Server-only.
// Valida sesión, acceso a la cuenta y a la sección; si no, redirige o da 404.

import { notFound, redirect } from "next/navigation";
import { isDbConfigured } from "../db";
import type { Account } from "./accounts-repo";
import { getMySqlAccountsRepo } from "./accounts-mysql";
import { accountPath, canAccess, canEnterAccount, type Section } from "./permissions";
import { getCurrentUser, homePath, type CrmUser } from "./session";

export async function getAccountOrNull(id: number): Promise<Account | null> {
  if (!isDbConfigured()) return { id, name: `Cuenta ${id}`, status: "active", createdAt: 0 };
  try {
    return await getMySqlAccountsRepo().get(id);
  } catch (err) {
    console.error("[crm] No se pudo leer la cuenta:", (err as Error).message);
    // Sin la migración 0009 igual se puede usar la cuenta 1.
    return id === 1 ? { id, name: "DigiBot", status: "active", createdAt: 0 } : null;
  }
}

export async function loadAccountPage(
  rawAccountId: string,
  section: Section
): Promise<{ me: CrmUser; account: Account }> {
  const me = await getCurrentUser();
  if (!me) redirect("/admin/login?expirada=1");
  const accountId = Number(rawAccountId);
  if (!Number.isSafeInteger(accountId) || accountId <= 0) notFound();
  if (!canEnterAccount({ role: me.role, acc: me.accountId }, accountId)) redirect(homePath(me));
  if (!canAccess(me.role, section)) redirect(accountPath(accountId));
  const account = await getAccountOrNull(accountId);
  if (!account) notFound();
  return { me, account };
}

// Cuentas para el selector del menú: el superadmin ve todas; el resto, la suya.
export async function accountsForSwitcher(me: CrmUser): Promise<Pick<Account, "id" | "name">[]> {
  if (me.role !== "superadmin") {
    if (me.accountId === null) return [];
    const own = await getAccountOrNull(me.accountId);
    return own ? [{ id: own.id, name: own.name }] : [];
  }
  if (!isDbConfigured()) return [];
  try {
    return (await getMySqlAccountsRepo().list()).map((a) => ({ id: a.id, name: a.name }));
  } catch {
    return [];
  }
}
