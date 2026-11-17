import CanalesView, { type ChannelsLoadState } from "@/components/crm/canales/CanalesView";
import { channelsRepo } from "@/lib/channels/api";
import { providerAvailability } from "@/lib/channels/config";
import { channelsOverview } from "@/lib/channels/overview";
import { loadAccountPage } from "@/lib/crm/account-page";
import { createSignupSession } from "@/lib/whatsapp-accounts/onboarding";

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
      message: "No se pudieron cargar los canales. Si es la primera vez, falta correr la migración 0015 (npm run db:migrate).",
    };
  }
}

// Sesión de Embedded Signup lista para el botón "Conectar WhatsApp" (el popup no puede esperar a crearla).
async function signupSession(accountId: number, userId: number) {
  if (!channelsRepo() || !providerAvailability().whatsapp.available) return null;
  try {
    return (await createSignupSession({ accountId, userId })).sessionId;
  } catch (err) {
    console.error("[canales] No se pudo crear la sesión de Embedded Signup:", (err as Error).message);
    return null;
  }
}

export default async function CanalesPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { me, account } = await loadAccountPage((await params).accountId, "channels");
  const [initialState, sessionId] = await Promise.all([load(account.id), signupSession(account.id, me.id)]);
  return <CanalesView accountId={account.id} initialState={initialState} initialSignupSessionId={sessionId} />;
}
