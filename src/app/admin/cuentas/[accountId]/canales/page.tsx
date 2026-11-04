import CanalesView, { type ChannelsLoadState } from "@/components/crm/canales/CanalesView";
import { channelsRepo } from "@/lib/channels/api";
import { channelsOverview } from "@/lib/channels/overview";
import { loadAccountPage } from "@/lib/crm/account-page";

export const dynamic = "force-dynamic";

async function load(accountId: number): Promise<ChannelsLoadState> {
  const repo = channelsRepo();
  if (!repo) return { kind: "error", message: "La base de datos no está configurada." };
  try {
    return { kind: "ready", overview: await channelsOverview(repo, accountId) };
  } catch (err) {
    console.error("[canales] No se pudieron cargar los canales:", err);
    return {
      kind: "error",
      message: "No se pudieron cargar los canales. Si es la primera vez, falta correr la migración 0010 (npm run db:migrate).",
    };
  }
}

export default async function CanalesPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { account } = await loadAccountPage((await params).accountId, "channels");
  return <CanalesView accountId={account.id} initialState={await load(account.id)} />;
}
