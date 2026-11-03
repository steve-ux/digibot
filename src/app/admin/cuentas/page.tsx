import { redirect } from "next/navigation";
import CuentasView, { type CuentasLoadState } from "@/components/crm/cuentas/CuentasView";
import { getMySqlAccountsRepo } from "@/lib/crm/accounts-mysql";
import { getCurrentUser, homePath } from "@/lib/crm/session";
import { toTeamUser } from "@/lib/crm/team";
import { getMySqlUsersRepo } from "@/lib/crm/users-mysql";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

async function load(): Promise<CuentasLoadState> {
  if (!isDbConfigured()) return { kind: "error", message: "La base de datos no está configurada." };
  try {
    const [accounts, superadmins] = await Promise.all([
      getMySqlAccountsRepo().list(),
      getMySqlUsersRepo().listSuperadmins(),
    ]);
    return { kind: "ready", accounts, superadmins: superadmins.map(toTeamUser) };
  } catch (err) {
    console.error("[crm] No se pudieron cargar las cuentas:", err);
    return {
      kind: "error",
      message: "No se pudieron cargar las cuentas. Si es la primera vez, falta correr la migración 0009 (npm run db:migrate).",
    };
  }
}

// Listado de cuentas: solo para superadmins (el resto va directo a su cuenta).
export default async function CuentasPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/admin/login?expirada=1");
  if (me.role !== "superadmin") redirect(homePath(me));
  return <CuentasView initialState={await load()} meId={me.id} bootstrap={Boolean(me.bootstrap)} />;
}
