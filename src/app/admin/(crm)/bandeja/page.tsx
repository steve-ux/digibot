import { cookies } from "next/headers";
import BandejaView, { type BandejaFilters, type BandejaLoadState } from "@/components/admin/bandeja/BandejaView";
import type { ChannelFilter, StatusFilter } from "@/components/admin/bandeja/ConversationList";
import { DEMO_COOKIE } from "@/lib/crm/demo-cookie";
import { CHANNEL_IDS, type ChannelId } from "@/lib/crm/channels";
import { getCurrentUser, getTeam } from "@/lib/crm/session";
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
    return { kind: "ready", conversations: await store.listConversations(500) };
  } catch (err) {
    console.error("[crm] No se pudieron listar las conversaciones:", err);
    return { kind: "error", message: "No se pudieron cargar las conversaciones." };
  }
}

const STATUSES: StatusFilter[] = ["open", "pending", "mine", "resolved"];

// /admin/bandeja?estado=pending&canal=wa&c=12 (lo usan los links de Métricas).
function parseFilters(params: Record<string, string | string[] | undefined>): BandejaFilters {
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const status = one("estado") as StatusFilter | undefined;
  const channel = one("canal") as ChannelId | undefined;
  const selected = Number(one("c"));
  return {
    status: status && STATUSES.includes(status) ? status : "open",
    channel: (channel && CHANNEL_IDS.includes(channel) ? channel : "all") as ChannelFilter,
    selectedId: Number.isInteger(selected) && selected > 0 ? selected : null,
  };
}

export default async function BandejaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = (await cookies()).get(DEMO_COOKIE)?.value === "1";
  const [params, me, team] = await Promise.all([searchParams, getCurrentUser(), getTeam()]);
  const initialState: BandejaLoadState = demo ? { kind: "loading" } : await loadInitialState();

  return (
    <BandejaView
      initialState={initialState}
      me={{ id: me.id, name: me.name }}
      team={team.map((u) => ({ id: u.id, name: u.name }))}
      initialFilters={parseFilters(params)}
    />
  );
}
