import PlantillasView, { type PlantillasLoadState } from "@/components/admin/PlantillasView";
import { loadAccountPage } from "@/lib/crm/account-page";
import { accountHasWhatsApp, NO_WHATSAPP_MESSAGE } from "@/lib/crm/account-whatsapp";
import { listTemplates } from "@/lib/meta-whatsapp";

export const dynamic = "force-dynamic";

// Se carga en el server (sin el salto extra a la API) para que la tabla
// llegue ya pintada. listTemplates() sirve desde cache y revalida en segundo plano.
async function loadInitialState(accountId: number): Promise<PlantillasLoadState> {
  if (!(await accountHasWhatsApp(accountId))) return { kind: "not_configured", message: NO_WHATSAPP_MESSAGE };
  try {
    return { kind: "ready", templates: await listTemplates({ accountId }) };
  } catch (err) {
    return { kind: "error", message: (err as Error).message };
  }
}

export default async function PlantillasPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { account } = await loadAccountPage((await params).accountId, "templates");
  return <PlantillasView initialState={await loadInitialState(account.id)} />;
}
