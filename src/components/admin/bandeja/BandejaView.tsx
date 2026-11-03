"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCrmShell } from "@/components/crm/CrmShell";
import { Sheet } from "@/components/crm/Modal";
import { useToast } from "@/components/crm/Toast";
import type { ConversationAction } from "@/lib/crm/conversation-actions";
import type { InboxConversation, InboxMessage } from "@/lib/wa-inbox/types";
import { realApi, type InboxApi } from "./api";
import ChatPanel from "./ChatPanel";
import ContactPanel from "./ContactPanel";
import ConversationList, {
  matchesFilters,
  type ChannelFilter,
  type StatusFilter,
} from "./ConversationList";
import { demoTeam, getDemoApi } from "./demo-api";
import { POLL_INTERVAL_MS, usePolling, useMediaQuery, type TeamMember } from "./utils";

export type BandejaLoadState =
  | { kind: "loading" }
  | { kind: "not_configured"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; conversations: InboxConversation[] };

export interface BandejaFilters {
  channel: ChannelFilter;
  status: StatusFilter;
  selectedId: number | null;
}

interface Props {
  initialState: BandejaLoadState;
  me: TeamMember;
  team: TeamMember[];
  initialFilters: BandejaFilters;
}

// Tras una acción local, el polling puede traer el estado viejo por unos segundos:
// mientras tanto se respeta lo que se ve en pantalla.
const MUTE_MS = 5000;

export default function BandejaView(props: Props) {
  const { demo } = useCrmShell();
  // Cambiar de modo (real/demo) arranca la bandeja de cero.
  return <Bandeja key={demo ? "demo" : "real"} {...props} demo={demo} />;
}

function Bandeja({ initialState, me, team: realTeam, initialFilters, demo }: Props & { demo: boolean }) {
  const { reportInboxUnread, setImmersive, setDemo } = useCrmShell();
  const toast = useToast();
  const api: InboxApi = useMemo(() => (demo ? getDemoApi(me) : realApi), [demo, me]);
  const team = useMemo(() => (demo ? demoTeam(me) : realTeam), [demo, me, realTeam]);

  const [state, setState] = useState<BandejaLoadState>(demo ? { kind: "loading" } : initialState);
  const [channel, setChannel] = useState<ChannelFilter>(initialFilters.channel);
  const [status, setStatus] = useState<StatusFilter>(initialFilters.status);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(initialFilters.selectedId);
  const [contactOpen, setContactOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const isMobile = useMediaQuery("(max-width: 767px)");
  const isXl = useMediaQuery("(min-width: 1280px)");
  const mutedUntil = useRef(new Map<number, number>());
  const appendRef = useRef<((m: InboxMessage) => void) | null>(null);
  const pushedHistory = useRef(false);

  const conversations = useMemo(() => (state.kind === "ready" ? state.conversations : []), [state]);
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  // ---------- Datos ----------

  const isMuted = (id: number) => (mutedUntil.current.get(id) ?? 0) > Date.now();
  const mute = (id: number) => mutedUntil.current.set(id, Date.now() + MUTE_MS);

  const mergeFresh = useCallback((fresh: InboxConversation[], current: InboxConversation[]) => {
    const byId = new Map(current.map((c) => [c.id, c]));
    return fresh.map((c) => (isMuted(c.id) && byId.has(c.id) ? byId.get(c.id)! : c));
  }, []);

  usePolling(
    async () => {
      if (state.kind === "not_configured") return;
      try {
        const fresh = await api.listConversations();
        setState((prev) => ({
          kind: "ready",
          conversations: mergeFresh(fresh, prev.kind === "ready" ? prev.conversations : []),
        }));
      } catch (err) {
        setState((prev) =>
          prev.kind === "ready" ? prev : { kind: "error", message: (err as Error).message }
        );
      }
    },
    POLL_INTERVAL_MS,
    `${refreshKey}`
  );

  const updateConversation = useCallback((id: number, fn: (c: InboxConversation) => InboxConversation) => {
    setState((prev) =>
      prev.kind === "ready"
        ? { ...prev, conversations: prev.conversations.map((c) => (c.id === id ? fn(c) : c)) }
        : prev
    );
  }, []);

  const onConversationFromChat = useCallback(
    (fresh: InboxConversation) => {
      if (isMuted(fresh.id)) return;
      // Abrir el chat lo marca como leído.
      updateConversation(fresh.id, () => ({ ...fresh, unreadCount: 0 }));
    },
    [updateConversation]
  );

  // Badge del menú: mensajes sin leer en conversaciones abiertas.
  useEffect(() => {
    const unread = conversations.reduce((sum, c) => sum + (c.status !== "resolved" ? c.unreadCount : 0), 0);
    reportInboxUnread(unread);
  }, [conversations, reportInboxUnread]);

  // ---------- Selección + historial (el "atrás" del celular cierra el chat) ----------

  const open = (c: InboxConversation) => {
    const url = new URL(window.location.href);
    url.searchParams.set("c", String(c.id));
    if (selectedId === null) {
      window.history.pushState({ crmChat: c.id }, "", url);
      pushedHistory.current = true;
    } else {
      window.history.replaceState({ crmChat: c.id }, "", url);
    }
    setSelectedId(c.id);
    setSheetOpen(false);
    updateConversation(c.id, (x) => ({ ...x, unreadCount: 0 }));
  };

  const back = () => {
    if (pushedHistory.current) {
      window.history.back();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("c");
    window.history.replaceState(null, "", url);
    setSelectedId(null);
  };

  useEffect(() => {
    const onPop = () => {
      const c = Number(new URL(window.location.href).searchParams.get("c"));
      pushedHistory.current = false;
      setSelectedId(Number.isInteger(c) && c > 0 ? c : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    setImmersive(isMobile && selectedId !== null);
    return () => setImmersive(false);
  }, [isMobile, selectedId, setImmersive]);

  // ---------- Acciones ----------

  const act = async (
    action: ConversationAction,
    optimistic: (c: InboxConversation) => InboxConversation,
    successText: string | null,
    { busy = true } = {}
  ) => {
    if (!selected) return false;
    const id = selected.id;
    const previous = selected;
    mute(id);
    updateConversation(id, optimistic);
    if (busy) setBusyAction(true);
    try {
      const { conversation, message } = await api.act(id, action);
      mute(id);
      updateConversation(id, () => ({ ...conversation, unreadCount: 0 }));
      if (message) appendRef.current?.(message);
      if (successText) toast(successText);
      return true;
    } catch (err) {
      updateConversation(id, () => previous);
      toast((err as Error).message || "No se pudo guardar el cambio.", "error");
      return false;
    } finally {
      if (busy) setBusyAction(false);
    }
  };

  const chatActions = {
    resolve: () =>
      act({ action: "resolve" }, (c) => ({ ...c, status: "resolved", unreadCount: 0 }), "Conversación resuelta"),
    reopen: () => act({ action: "reopen" }, (c) => ({ ...c, status: "open" }), "Conversación reabierta"),
    takeOver: () =>
      act(
        { action: "take" },
        (c) => ({ ...c, botActive: false, assigneeId: me.id, status: "open" }),
        "Ahora respondés vos"
      ),
    giveBack: () =>
      act({ action: "release" }, (c) => ({ ...c, botActive: true }), "DigiBot retoma la conversación"),
  };

  const assign = (assigneeId: number | null) => {
    const who = team.find((m) => m.id === assigneeId);
    const text = !who ? "Sin asignar" : who.id === me.id ? "Asignada a vos" : `Asignada a ${who.name}`;
    act({ action: "assign", assigneeId }, (c) => ({ ...c, assigneeId }), text, { busy: false });
  };

  const setTags = (tags: string[]) => act({ action: "tags", tags }, (c) => ({ ...c, tags }), null, { busy: false });

  const saveNote = (note: string) => act({ action: "note", note }, (c) => ({ ...c, note }), null, { busy: false });

  const onOutgoing = (preview: string) => {
    if (!selected) return;
    updateConversation(selected.id, (c) => ({
      ...c,
      lastMessagePreview: preview,
      lastMessageAuthor: "agent",
      lastMessageAt: Math.floor(Date.now() / 1000),
    }));
  };

  const toggleContact = () => (isXl ? setContactOpen((v) => !v) : setSheetOpen(true));

  const registerAppend = useCallback((fn: ((m: InboxMessage) => void) | null) => {
    appendRef.current = fn;
  }, []);

  // ---------- Render ----------

  const visible = conversations.filter((c) => matchesFilters(c, channel, status, search, me.id));

  const banner = demo ? (
    <div className="flex items-center gap-2 rounded-field border border-dashed border-crm-warn-border bg-crm-warn-soft px-3 py-2 text-xs text-crm-warn-ink">
      <span className="h-2 w-2 shrink-0 rounded-full bg-crm-warn" />
      <span className="flex-1">
        <strong>Demo:</strong> son datos de ejemplo, nada se envía de verdad.
      </span>
      <button onClick={() => setDemo(false)} className="min-h-[32px] font-bold underline">
        Salir
      </button>
    </div>
  ) : null;

  let listEmpty: React.ReactNode = undefined;
  if (state.kind === "loading") {
    listEmpty = <ListSkeleton />;
  } else if (state.kind === "not_configured" || state.kind === "error") {
    listEmpty = (
      <div className="m-2 rounded-2xl border border-crm-error-border bg-crm-error-bg p-5 text-sm">
        <div className="font-semibold text-crm-error-ink">
          {state.kind === "not_configured" ? "La bandeja no está configurada" : "No se pudieron cargar las conversaciones"}
        </div>
        <p className="mb-0 mt-1.5 text-crm-error-ink-2">
          {state.kind === "error" ? "Revisá tu conexión y probá de nuevo." : state.message}
        </p>
        {state.kind === "error" && (
          <button
            onClick={() => {
              setState({ kind: "loading" });
              setRefreshKey((k) => k + 1);
            }}
            className="mt-3 h-9 rounded-pill bg-crm-error px-4 text-xs font-bold text-white"
          >
            Reintentar
          </button>
        )}
      </div>
    );
  } else if (conversations.length === 0 && !demo) {
    listEmpty = (
      <div className="px-5 py-12 text-center">
        <div className="font-poppins text-base font-semibold text-crm-ink">Todavía no hay conversaciones</div>
        <p className="mx-auto mb-0 mt-1.5 max-w-[260px] text-sm text-crm-muted">
          Cuando un cliente te escriba por un canal conectado, aparece acá.
        </p>
        <button
          onClick={() => setDemo(true)}
          className="mt-4 h-10 rounded-pill border border-crm-border-2 bg-crm-chip px-4 text-sm font-semibold text-crm-ink hover:border-crm-primary hover:text-crm-primary"
        >
          Ver cómo se ve con datos de ejemplo
        </button>
      </div>
    );
  }

  const contactPanel = selected ? (
    <ContactPanel
      conversation={selected}
      team={team}
      meId={me.id}
      onAssign={assign}
      onTags={setTags}
      onNote={saveNote}
    />
  ) : null;

  return (
    <div className="flex min-h-0 flex-1">
      <section
        aria-label="Conversaciones"
        className={`min-h-0 w-full shrink-0 flex-col border-r border-crm-border bg-crm-side md:flex md:w-[320px] lg:w-[360px] ${
          selected ? "hidden" : "flex"
        }`}
      >
        <ConversationList
          conversations={visible}
          allConversations={conversations}
          selectedId={selectedId}
          meId={me.id}
          team={team}
          channel={channel}
          status={status}
          search={search}
          onChannel={setChannel}
          onStatus={setStatus}
          onSearch={setSearch}
          onOpen={open}
          banner={banner}
          empty={listEmpty}
        />
      </section>

      <section aria-label="Chat" className={`min-h-0 min-w-0 flex-1 flex-col md:flex ${selected ? "flex" : "hidden"}`}>
        {selected ? (
          <ChatPanel
            key={`${demo ? "d" : "r"}-${selected.id}`}
            api={api}
            conversation={selected}
            me={me}
            busyAction={busyAction}
            showBack={isMobile}
            onBack={back}
            onToggleContact={toggleContact}
            contactOpen={isXl ? contactOpen : sheetOpen}
            actions={chatActions}
            onConversation={onConversationFromChat}
            onOutgoing={onOutgoing}
            registerAppend={registerAppend}
          />
        ) : selectedId !== null && state.kind !== "ready" ? (
          <div className="flex-1 animate-pulse bg-crm-bg" aria-hidden />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2.5 p-10 text-center">
            <div className="font-poppins text-lg font-semibold text-crm-ink">Elegí una conversación</div>
            <div className="max-w-[340px] text-sm text-crm-muted">
              Todos tus canales llegan acá: WhatsApp, Instagram y Messenger.
            </div>
          </div>
        )}
      </section>

      {selected && contactOpen && (
        <aside
          aria-label="Datos del contacto"
          className="crm-scroll hidden w-[300px] shrink-0 overflow-y-auto border-l border-crm-border bg-crm-side xl:block"
        >
          {contactPanel}
        </aside>
      )}

      {!isXl && (
        <Sheet open={sheetOpen && !!selected} onClose={() => setSheetOpen(false)} title="Datos del contacto">
          {contactPanel}
        </Sheet>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden className="px-1">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex items-start gap-3 p-3">
          <div className="h-[46px] w-[46px] shrink-0 animate-pulse rounded-full bg-crm-surf" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 w-2/3 animate-pulse rounded-md bg-crm-surf" />
            <div className="h-3.5 w-full animate-pulse rounded-md bg-crm-surf" />
          </div>
        </div>
      ))}
    </div>
  );
}
