import ConfiguracionView, { type SettingsLoadState } from "@/components/crm/configuracion/ConfiguracionView";
import { loadAccountPage } from "@/lib/crm/account-page";
import { getMySqlSettingsRepo } from "@/lib/crm/settings-mysql";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

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

export default async function ConfiguracionPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ accountId }, query] = await Promise.all([params, searchParams]);
  const { account } = await loadAccountPage(accountId, "settings");
  const tab = query.tab === "atributos" ? "atributos" : "etiquetas";
  return <ConfiguracionView account={{ id: account.id, name: account.name }} initialState={await load(account.id)} initialTab={tab} />;
}
