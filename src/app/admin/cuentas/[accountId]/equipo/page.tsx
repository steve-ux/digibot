import EquipoView, { type EquipoLoadState } from "@/components/crm/equipo/EquipoView";
import { loadAccountPage } from "@/lib/crm/account-page";
import { assignableRoles } from "@/lib/crm/permissions";
import { toTeamUser } from "@/lib/crm/team";
import { getMySqlUsersRepo } from "@/lib/crm/users-mysql";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

async function load(accountId: number): Promise<EquipoLoadState> {
  if (!isDbConfigured()) return { kind: "error", message: "La base de datos no está configurada." };
  try {
    return { kind: "ready", users: (await getMySqlUsersRepo().listByAccount(accountId)).map(toTeamUser) };
  } catch (err) {
    console.error("[crm] No se pudo cargar el equipo:", err);
    return {
      kind: "error",
      message: "No se pudo cargar el equipo. Si es la primera vez, faltan correr las migraciones (npm run db:migrate).",
    };
  }
}

export default async function EquipoPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { me, account } = await loadAccountPage((await params).accountId, "team");
  return (
    <EquipoView
      initialState={await load(account.id)}
      meId={me.id}
      bootstrap={Boolean(me.bootstrap)}
      assignable={assignableRoles(me.role)}
    />
  );
}
