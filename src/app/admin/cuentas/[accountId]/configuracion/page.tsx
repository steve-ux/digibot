import ConfiguracionView, { type SettingsLoadState, type Tab } from "@/components/crm/configuracion/ConfiguracionView";
import { loadAccountPage } from "@/lib/crm/account-page";
import { canAccess } from "@/lib/crm/permissions";
import { getMySqlSettingsRepo } from "@/lib/crm/settings-mysql";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

const TABS: Tab[] = ["perfil", "sonidos", "etiquetas", "atributos", "soporte"];
const ADMIN_TABS: Tab[] = ["etiquetas", "atributos"];

async function load(accountId: number): Promise<SettingsLoadState> {
  if (!isDbConfigured()) return { kind: "error", message: "La base de datos no está configurada." };
  try {
    const repo = getMySqlSettingsRepo();
    const [labels, attributes] = await Promise.all([repo.listLabels(accountId), repo.listAttributes(accountId)]);
    return { kind: "ready", labels, attributes };
  } catch (err) {
    console.error("[crm] No se pudo cargar la configuración:", err);
    return {
      kind: "error",
      message: "No se pudieron cargar las etiquetas y atributos. Si es la primera vez, falta correr la migración 0009 (npm run db:migrate).",
    };
  }
}

// Configuración: lo personal (perfil, sonidos, soporte) para todos; etiquetas y atributos, para quien administra.
export default async function ConfiguracionPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ accountId }, query] = await Promise.all([params, searchParams]);
  const { me, account } = await loadAccountPage(accountId, "inbox");
  const canManage = canAccess(me.role, "settings");
  const requested = TABS.find((t) => t === query.tab);
  const tab = requested && (canManage || !ADMIN_TABS.includes(requested)) ? requested : "perfil";
  const initialState: SettingsLoadState = canManage ? await load(account.id) : { kind: "ready", labels: [], attributes: [] };
  return (
    <ConfiguracionView
      account={{ id: account.id, name: account.name }}
      initialState={initialState}
      initialTab={tab}
      canManage={canManage}
    />
  );
}
