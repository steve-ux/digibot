import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import BandejaView, { type BandejaFilters, type BandejaLoadState } from "@/components/admin/bandeja/BandejaView";
import type { ChannelFilter, StatusFilter } from "@/components/admin/bandeja/ConversationList";
import { loadAccountPage } from "@/lib/crm/account-page";
import type { CustomAttribute } from "@/lib/crm/attributes";
import { CHANNEL_IDS, type ChannelId } from "@/lib/crm/channels";
import { DEMO_COOKIE } from "@/lib/crm/demo-cookie";
import type { Label } from "@/lib/crm/labels";
import { allowedChannels } from "@/lib/crm/permissions";
import { getTeam } from "@/lib/crm/session";
import { getMySqlSettingsRepo } from "@/lib/crm/settings-mysql";
import { isDbConfigured } from "@/lib/db";
import { getInboxStore } from "@/lib/wa-inbox/store";

export const dynamic = "force-dynamic";

// Primera carga en el server: la lista de chats llega ya pintada, sin esperar al primer polling.
async function loadInitialState(accountId: number): Promise<BandejaLoadState> {
  if (!isDbConfigured()) {
    return { kind: "not_configured", message: "Faltan las variables de conexión a la base de datos." };
  }
  try {
    const store = await getInboxStore();
    return { kind: "ready", conversations: await store.listConversations(accountId, 500) };
  } catch (err) {
    console.error("[crm] No se pudieron listar las conversaciones:", err);
    return { kind: "error", message: "No se pudieron cargar las conversaciones." };
  }
}

async function loadSettings(accountId: number): Promise<{ labels: Label[]; attributes: CustomAttribute[] }> {
  if (!isDbConfigured()) return { labels: [], attributes: [] };
  try {
    const repo = getMySqlSettingsRepo();
    const [labels, attributes] = await Promise.all([repo.listLabels(accountId), repo.listAttributes(accountId)]);
    return { labels, attributes };
  } catch (err) {
    // Sin la migración 0009: la bandeja funciona igual, sin etiquetas ni atributos propios.
    console.error("[crm] No se pudieron cargar etiquetas/atributos:", (err as Error).message);
    return { labels: [], attributes: [] };
  }
}

const STATUSES: StatusFilter[] = ["open", "pending", "mine", "resolved"];

// /admin/cuentas/7/conversaciones/12?estado=pending&canal=wa (lo usan los links de Métricas).
function parseFilters(params: Record<string, string | string[] | undefined>, conversationId: string | undefined): BandejaFilters {
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const status = one("estado") as StatusFilter | undefined;
  const channel = one("canal") as ChannelId | undefined;
  const selected = Number(conversationId);
  return {
    status: status && STATUSES.includes(status) ? status : "open",
    channel: (channel && CHANNEL_IDS.includes(channel) ? channel : "all") as ChannelFilter,
    selectedId: Number.isSafeInteger(selected) && selected > 0 ? selected : null,
  };
}

export default async function ConversacionesPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string; conversationId?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { accountId: rawAccountId, conversationId } = await params;
  // Solo /conversaciones o /conversaciones/:id
  if (conversationId && (conversationId.length > 1 || !/^\d+$/.test(conversationId[0]))) notFound();

  const { me, account } = await loadAccountPage(rawAccountId, "inbox");
  const demo = (await cookies()).get(DEMO_COOKIE)?.value === "1";
  const [query, team, settings] = await Promise.all([searchParams, getTeam(account.id, me), loadSettings(account.id)]);
  const channels = allowedChannels(me);

  let initialState: BandejaLoadState = demo ? { kind: "loading" } : await loadInitialState(account.id);
  // Los agentes solo ven sus canales (la API aplica el mismo filtro en cada polling).
  if (initialState.kind === "ready") {
    initialState = { ...initialState, conversations: initialState.conversations.filter((c) => channels.includes(c.channel)) };
  }
  const filters = parseFilters(query, conversationId?.[0]);
  if (filters.channel !== "all" && !channels.includes(filters.channel)) filters.channel = "all";

  return (
    <BandejaView
      accountId={account.id}
      initialState={initialState}
      me={{ id: me.id, name: me.name }}
      team={team}
      allowedChannels={channels}
      initialFilters={filters}
      labels={settings.labels}
      attributes={settings.attributes}
    />
  );
}
