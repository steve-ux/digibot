"use client";

import { CHANNEL_IDS, CHANNELS, type ChannelId } from "@/lib/crm/channels";
import Icon from "@/components/crm/Icon";
import type { InboxConversation } from "@/lib/wa-inbox/types";
import Avatar from "./Avatar";
import { displayName, formatListTime, previewText, type TeamMember } from "./utils";

export type ChannelFilter = "all" | ChannelId;
export type StatusFilter = "open" | "pending" | "mine" | "resolved";

export const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "open", label: "Abiertas" },
  { id: "pending", label: "Sin responder" },
  { id: "mine", label: "Mías" },
  { id: "resolved", label: "Resueltas" },
];

export function matchesFilters(
  c: InboxConversation,
  channel: ChannelFilter,
  status: StatusFilter,
  search: string,
  meId: number
) {
  if (channel !== "all" && c.channel !== channel) return false;
  const q = search.trim().toLowerCase();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const haystack = `${c.contactName ?? ""} ${c.handle ?? ""}`.toLowerCase();
    const byText = haystack.includes(q);
    const byNumber = digits.length >= 3 && c.channel === "wa" && c.waId.includes(digits);
    if (!byText && !byNumber) return false;
  }
  const open = c.status !== "resolved";
  switch (status) {
    case "open":
      return open;
    case "pending":
      return open && c.lastMessageAuthor === "customer";
    case "mine":
      return open && c.assigneeId === meId;
    case "resolved":
      return !open;
  }
}

function Pill({ tone, children }: { tone: "tint" | "neutral" | "warn"; children: React.ReactNode }) {
  const cls = {
    tint: "border border-crm-tint-border bg-crm-tint text-crm-primary font-bold",
    neutral: "border border-crm-border bg-crm-surf text-crm-nav font-semibold",
    warn: "bg-crm-warn-bg text-crm-warn-ink font-semibold",
  }[tone];
  return <span className={`flex items-center gap-[5px] rounded-pill px-2 py-[3px] text-[11px] ${cls}`}>{children}</span>;
}

function Row({
  c,
  selected,
  meId,
  team,
  onOpen,
}: {
  c: InboxConversation;
  selected: boolean;
  meId: number;
  team: TeamMember[];
  onOpen: () => void;
}) {
  const open = c.status !== "resolved";
  const unread = c.unreadCount > 0 && !selected;
  const bot = c.botActive && open;
  const assignee = c.assigneeId ? team.find((m) => m.id === c.assigneeId) : null;
  const assigneeShort = assignee && !c.botActive ? (assignee.id === meId ? "Vos" : assignee.name.split(" ")[0]) : null;
  const closedWindow = c.channel === "wa" && c.windowSecondsLeft <= 0 && open && !c.botActive;
  const name = displayName(c);

  return (
    <button
      onClick={onOpen}
      aria-current={selected ? "true" : undefined}
      aria-label={`${name}, ${CHANNELS[c.channel].name}${unread ? `, ${c.unreadCount} sin leer` : ""}`}
      className={`mb-0.5 flex w-full items-start gap-3 rounded-[14px] p-3 text-left transition-colors ${
        selected ? "bg-crm-tint" : "hover:bg-crm-surf"
      }`}
    >
      <Avatar conversation={c} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[15px] text-crm-ink ${unread ? "font-bold" : "font-semibold"}`}>
            {name}
          </span>
          <span
            suppressHydrationWarning
            className={`shrink-0 text-xs font-semibold ${unread ? "text-crm-primary" : "text-crm-muted"}`}
          >
            {formatListTime(c.lastMessageAt)}
          </span>
        </div>
        <div className="mt-[3px] flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-sm ${unread ? "text-crm-ink" : "text-crm-muted"}`}>
            {previewText(c) || "—"}
          </span>
          {unread && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-crm-primary px-1.5 text-[11px] font-bold text-white">
              {c.unreadCount > 99 ? "99+" : c.unreadCount}
            </span>
          )}
        </div>
        {(bot || assigneeShort || closedWindow) && (
          <div className="mt-[7px] flex flex-wrap items-center gap-1.5">
            {bot && (
              <Pill tone="tint">
                <span className="h-1.5 w-1.5 rounded-full bg-crm-accent shadow-[0_0_0_1.5px_rgba(22,163,74,.2)]" />
                IA respondiendo
              </Pill>
            )}
            {assigneeShort && <Pill tone="neutral">{assigneeShort}</Pill>}
            {closedWindow && <Pill tone="warn">Ventana cerrada</Pill>}
          </div>
        )}
      </div>
    </button>
  );
}

export default function ConversationList({
  conversations,
  allConversations,
  selectedId,
  meId,
  team,
  channel,
  status,
  search,
  onChannel,
  onStatus,
  onSearch,
  onOpen,
  banner,
  empty,
  channels = CHANNEL_IDS,
}: {
  conversations: InboxConversation[];
  allConversations: InboxConversation[];
  selectedId: number | null;
  meId: number;
  team: TeamMember[];
  channel: ChannelFilter;
  status: StatusFilter;
  search: string;
  onChannel: (c: ChannelFilter) => void;
  onStatus: (s: StatusFilter) => void;
  onSearch: (q: string) => void;
  onOpen: (c: InboxConversation) => void;
  banner?: React.ReactNode;
  empty?: React.ReactNode;
  // Canales visibles para esta persona (chips de filtro)
  channels?: ChannelId[];
}) {
  const openCount = (ch: ChannelFilter) =>
    allConversations.filter((c) => c.status !== "resolved" && (ch === "all" || c.channel === ch)).length;

  const chips: { id: ChannelFilter; label: string; icon?: string }[] = [
    { id: "all", label: "Todos" },
    ...channels.map((id) => ({ id, label: CHANNELS[id].name, icon: CHANNELS[id].icon })),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3.5 px-4 pb-3.5 pt-5 md:px-5 md:pt-[22px]">
        {banner}
        <div className="flex items-baseline gap-2.5">
          <h1 className="m-0 font-poppins text-2xl font-bold tracking-[-.6px] text-crm-ink">Bandeja</h1>
          <span className="text-sm text-crm-muted">
            {openCount("all")} {openCount("all") === 1 ? "abierta" : "abiertas"}
          </span>
        </div>

        <label className="flex h-11 items-center gap-2.5 rounded-pill border border-crm-border bg-crm-surf px-4 text-crm-muted focus-within:border-crm-primary">
          <Icon name="search" size={18} />
          <span className="sr-only">Buscar conversaciones</span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar nombre, número o @usuario"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-crm-ink outline-none placeholder:text-crm-subtle"
          />
        </label>

        <div
          role="group"
          aria-label="Filtrar por canal"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:-mx-5 md:px-5 lg:mx-0 lg:flex-wrap lg:px-0"
        >
          {chips.map((chip) => {
            const on = channel === chip.id;
            const count = openCount(chip.id);
            return (
              <button
                key={chip.id}
                onClick={() => onChannel(chip.id)}
                aria-pressed={on}
                title={chip.label}
                className={`flex h-9 shrink-0 items-center gap-[7px] rounded-pill border px-[13px] text-[13px] font-semibold transition-colors ${
                  on
                    ? "border-crm-primary bg-crm-primary text-white"
                    : "border-crm-border bg-crm-chip text-crm-ink-2 hover:border-crm-primary"
                }`}
              >
                {chip.icon && (
                  <img src={chip.icon} alt="" width={18} height={18} className="block" />
                )}
                <span>{chip.label}</span>
                {count > 0 && <span className="text-xs opacity-75">{count}</span>}
              </button>
            );
          })}
        </div>

        <div role="tablist" aria-label="Filtrar por estado" className="flex gap-0.5 rounded-field bg-crm-surf p-1">
          {STATUS_TABS.map((tab) => {
            const on = status === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={on}
                onClick={() => onStatus(tab.id)}
                className={`h-[34px] min-w-0 flex-auto whitespace-nowrap rounded-[9px] px-1.5 text-[12px] font-semibold transition-colors sm:text-[13px] ${
                  on ? "bg-crm-seg-on text-crm-ink shadow-[0_1px_3px_rgba(0,0,0,.1)]" : "text-crm-muted hover:text-crm-ink"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="crm-scroll min-h-0 flex-1 overflow-y-auto px-2.5 pb-3.5">
        {conversations.map((c) => (
          <Row key={c.id} c={c} selected={c.id === selectedId} meId={meId} team={team} onOpen={() => onOpen(c)} />
        ))}
        {conversations.length === 0 &&
          (empty ?? (
            <div className="px-5 py-12 text-center">
              <div className="font-poppins text-base font-semibold text-crm-ink">Todo al día</div>
              <div className="mt-1.5 text-sm text-crm-muted">No hay conversaciones en esta vista.</div>
            </div>
          ))}
      </div>
    </div>
  );
}
