import PlantillasView, { type PlantillasLoadState } from "@/components/admin/PlantillasView";
import { isMetaConfigured, listTemplates } from "@/lib/meta-whatsapp";

export const dynamic = "force-dynamic";

// Se carga en el server (sin el salto extra a /api/templates) para que la tabla
// llegue ya pintada. listTemplates() sirve desde cache y revalida en segundo plano.
async function loadInitialState(): Promise<PlantillasLoadState> {
  if (!(await isMetaConfigured())) {
    return { kind: "not_configured", message: "Faltan las credenciales de WhatsApp Business en el servidor." };
  }
  try {
    return { kind: "ready", templates: await listTemplates() };
  } catch (err) {
    return { kind: "error", message: (err as Error).message };
  }
}

export default async function PlantillasPage() {
  return <PlantillasView initialState={await loadInitialState()} />;
}
