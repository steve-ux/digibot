import BandejaView, { type BandejaLoadState } from "@/components/admin/bandeja/BandejaView";
import { isDbConfigured } from "@/lib/db";
import { getInboxStore } from "@/lib/wa-inbox/store";

export const dynamic = "force-dynamic";

// Primera carga en el server: la lista de chats llega ya pintada, sin esperar al primer polling.
async function loadInitialState(): Promise<BandejaLoadState> {
  if (!isDbConfigured()) {
    return { kind: "not_configured", message: "Faltan las variables de conexión a la base de datos." };
  }
  try {
    const store = await getInboxStore();
    return { kind: "ready", conversations: await store.listConversations(200) };
  } catch (err) {
    console.error("[wa-inbox] No se pudo listar las conversaciones:", err);
    return { kind: "error", message: "No se pudieron cargar las conversaciones." };
  }
}

export default async function BandejaPage() {
  return <BandejaView initialState={await loadInitialState()} />;
}
