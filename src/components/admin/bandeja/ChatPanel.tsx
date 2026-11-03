"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "@/components/crm/Icon";
import { useToast } from "@/components/crm/Toast";
import { isCommentChannel } from "@/lib/crm/channels";
import type { InboxConversation, InboxMessage } from "@/lib/wa-inbox/types";
import type { InboxApi, SendPayload } from "./api";
import Avatar from "./Avatar";
import Composer, { type ComposeTarget } from "./Composer";
import MessageBubble from "./MessageBubble";
import TemplateModal, { type TemplateSelection } from "./TemplateModal";
import {
  POLL_INTERVAL_MS,
  applyStatuses,
  channelSubtitle,
  dayKey,
  displayName,
  firstName,
  formatDayLabel,
  mergeMessages,
  replaceOptimistic,
  usePolling,
  windowLabel,
  type UiMessage,
} from "./utils";

// Último estado conocido de cada chat abierto en esta sesión: al volver a abrirlo
// se pinta al instante y el polling solo trae lo nuevo.
const chatCache = new Map<string, InboxMessage[]>();
// Borradores por conversación (sobreviven a cambiar de chat).
const drafts = new Map<string, string>();

export interface ChatActions {
  resolve: () => void;
  reopen: () => void;
  takeOver: () => void;
  giveBack: () => void;
}

export default function ChatPanel({
  api,
  conversation: c,
  me,
  busyAction,
  showBack,
  onBack,
  onToggleContact,
  contactOpen,
  actions,
  onConversation,
  onOutgoing,
  registerAppend,
}: {
  api: InboxApi;
  conversation: InboxConversation;
  me: { id: number; name: string };
  busyAction: boolean;
  showBack: boolean;
  onBack: () => void;
  onToggleContact: () => void;
  contactOpen: boolean;
  actions: ChatActions;
  // Conversación fresca que trae el polling del chat (ventana, estado…)
  onConversation: (fresh: InboxConversation) => void;
  // Para reflejar al instante el preview en la lista
  onOutgoing: (preview: string) => void;
  registerAppend: (fn: ((m: InboxMessage) => void) | null) => void;
}) {
  const toast = useToast();
  const cacheKey = `${api.demo ? "demo" : "real"}:${c.id}`;
  const cached = chatCache.get(cacheKey);
  const [messages, setMessages] = useState<UiMessage[]>(cached ?? []);
  const [loaded, setLoaded] = useState(Boolean(cached));
  const [loadError, setLoadError] = useState("");
  const [draft, setDraftState] = useState(drafts.get(cacheKey) ?? "");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const lastIdRef = useRef(cached?.reduce((max, m) => Math.max(max, m.id), 0) ?? 0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const onConversationRef = useRef(onConversation);
  onConversationRef.current = onConversation;

  const setDraft = (text: string) => {
    setDraftState(text);
    drafts.set(cacheKey, text);
  };

  usePolling(
    async () => {
      try {
        const data = await api.loadMessages(c.id, lastIdRef.current);
        for (const m of data.messages) lastIdRef.current = Math.max(lastIdRef.current, m.id);
        onConversationRef.current(data.conversation);
        setMessages((prev) => applyStatuses(mergeMessages(prev, data.messages), data.statuses));
        setLoadError("");
        setLoaded(true);
      } catch (err) {
        setLoadError((err as Error).message || "No se pudieron cargar los mensajes.");
      }
    },
    POLL_INTERVAL_MS,
    cacheKey
  );

  useEffect(() => {
    if (loaded) chatCache.set(cacheKey, messages.filter((m) => !m.pending));
  }, [cacheKey, messages, loaded]);

  // Los avisos del sistema que devuelven las acciones (tomar, resolver…) se suman al instante.
  const append = useCallback((m: InboxMessage) => {
    stickToBottomRef.current = true;
    lastIdRef.current = Math.max(lastIdRef.current, m.id);
    setMessages((prev) => mergeMessages(prev, [m]));
  }, []);
  useEffect(() => {
    registerAppend(append);
    return () => registerAppend(null);
  }, [append, registerAppend]);

  // Baja al último mensaje si el usuario ya estaba abajo (no lo arrastra si está leyendo arriba).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, loaded]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // ---------- Envío (optimistic UI) ----------

  const sendPayload = async (payload: SendPayload, optimistic: Partial<UiMessage>) => {
    const localId = -Date.now();
    const isNote = payload.type === "note";
    const message: UiMessage = {
      id: localId,
      conversationId: c.id,
      wamid: null,
      direction: isNote ? "internal" : "out",
      author: isNote ? "note" : "agent",
      authorName: me.name,
      type: "text",
      body: "",
      templateName: null,
      status: "sending",
      errorCode: null,
      errorTitle: null,
      messageAt: Math.floor(Date.now() / 1000),
      pending: true,
      ...optimistic,
    };
    stickToBottomRef.current = true;
    setMessages((prev) => [...prev, message]);
    if (!isNote) onOutgoing(message.body ?? "");

    const res = await api.send(c.id, payload);
    if (res.saved) {
      const saved = res.saved;
      lastIdRef.current = Math.max(lastIdRef.current, saved.id);
      setMessages((prev) => replaceOptimistic(prev, localId, saved));
      return saved.status !== "failed";
    }
    // Rechazado antes de guardarse: queda marcado como fallido en pantalla.
    const error = res.error ?? { code: "error", message: "No se pudo enviar el mensaje." };
    setMessages((prev) =>
      prev.map((m) =>
        m.id === localId
          ? {
              ...m,
              status: "failed",
              // Ventana cerrada = mismo caso que el 131047 de Meta (ofrece mandar plantilla).
              errorCode: error.code === "window_closed" && c.channel === "wa" ? 131047 : null,
              errorTitle: error.message,
            }
          : m
      )
    );
    if (isNote) toast(error.message, "error");
    return false;
  };

  const sendText = async (text: string, target: ComposeTarget) => {
    if (target === "note") {
      const ok = await sendPayload({ type: "note", body: text }, { body: text, type: "note", status: "sent" });
      if (ok) toast("Nota guardada");
      return;
    }
    const replyMode = target === "public" || target === "private" ? target : undefined;
    const type = replyMode === "public" ? "comment_reply" : replyMode === "private" ? "private_reply" : "text";
    await sendPayload({ type: "text", body: text, replyMode }, { body: text, type });
  };

  const sendTemplate = async (selection: TemplateSelection) => {
    setTemplatesOpen(false);
    const ok = await sendPayload(
      {
        type: "template",
        name: selection.template.name,
        language: selection.template.language,
        headerParams: selection.headerParams,
        bodyParams: selection.bodyParams,
      },
      { body: selection.preview, type: "template", templateName: selection.template.name }
    );
    if (ok) toast("Plantilla enviada");
  };

  const retry = async (m: UiMessage) => {
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: "sending" } : x)));
    const res = await api.send(c.id, { type: "retry", messageId: m.id });
    if (res.saved) {
      const saved = res.saved;
      setMessages((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      if (saved.status !== "failed") toast("Mensaje reenviado");
    } else {
      setMessages((prev) =>
        prev.map((x) =>
          x.id === m.id
            ? {
                ...x,
                status: "failed",
                errorCode: res.error?.code === "window_closed" && c.channel === "wa" ? 131047 : null,
                errorTitle: res.error?.message ?? x.errorTitle,
              }
            : x
        )
      );
      toast(res.error?.message ?? "No se pudo reenviar el mensaje.", "error");
    }
  };

  // ---------- Render ----------

  const open = c.status !== "resolved";
  const isWa = c.channel === "wa";
  const windowOpen = c.windowSecondsLeft > 0;
  const failureActions = { onRetry: retry, onTemplate: () => setTemplatesOpen(true) };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-crm-border bg-crm-side px-3 py-3 pt-[max(12px,env(safe-area-inset-top))] md:gap-3.5 md:px-[22px] md:py-3.5">
        {showBack && (
          <button
            onClick={onBack}
            aria-label="Volver a las conversaciones"
            className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-crm-nav hover:bg-crm-surf"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <Avatar conversation={c} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate font-poppins text-[17px] font-semibold text-crm-ink">{displayName(c)}</h2>
          <div className="mt-px truncate text-[13px] text-crm-muted">{channelSubtitle(c)}</div>
        </div>

        <div className="hidden flex-wrap items-center justify-end gap-2 2xl:flex">
          {isWa && open && (
            <span
              title="WhatsApp permite responder libremente hasta 24 h después del último mensaje del cliente."
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-[7px] text-[13px] font-semibold ${
                windowOpen ? "bg-crm-success-bg text-crm-success-ink" : "bg-crm-warn-bg text-crm-warn-ink"
              }`}
            >
              <Icon name="clock" size={15} />
              {windowLabel(c.windowSecondsLeft)}
            </span>
          )}
          {c.botActive && open && (
            <span className="flex items-center gap-[7px] whitespace-nowrap rounded-pill border border-crm-tint-border bg-crm-tint px-3 py-1.5 text-[13px] font-semibold text-crm-primary">
              <span className="h-2 w-2 rounded-full bg-crm-accent shadow-[0_0_0_2px_rgba(22,163,74,.2)]" />
              Responde DigiBot
            </span>
          )}
        </div>

        {open && (
          <button
            onClick={actions.resolve}
            disabled={busyAction}
            aria-label="Resolver conversación"
            className="flex h-11 shrink-0 items-center gap-2 rounded-pill bg-crm-primary px-3.5 font-poppins text-sm font-semibold text-white transition-colors hover:bg-crm-primary-hover disabled:opacity-60 md:h-10 md:px-[18px]"
          >
            <Icon name="check" size={17} />
            <span className="hidden sm:inline">Resolver</span>
          </button>
        )}
        <button
          onClick={onToggleContact}
          title="Datos del contacto"
          aria-label="Datos del contacto"
          aria-expanded={contactOpen}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border transition-colors md:h-10 md:w-10 ${
            contactOpen
              ? "border-crm-primary text-crm-primary"
              : "border-crm-border bg-crm-chip text-crm-nav hover:border-crm-primary hover:text-crm-primary"
          }`}
        >
          <Icon name="panel" size={18} />
        </button>
      </header>

      {/* Salvo en pantallas muy anchas, los indicadores van en una segunda línea compacta
          para que el nombre del contacto no se corte. */}
      {open && (isWa || c.botActive) && (
        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-crm-border bg-crm-side px-3 py-2 md:px-[22px] 2xl:hidden">
          {isWa && (
            <span
              title="WhatsApp permite responder libremente hasta 24 h después del último mensaje del cliente."
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-xs font-semibold ${
                windowOpen ? "bg-crm-success-bg text-crm-success-ink" : "bg-crm-warn-bg text-crm-warn-ink"
              }`}
            >
              <Icon name="clock" size={13} />
              {windowLabel(c.windowSecondsLeft)}
            </span>
          )}
          {c.botActive && (
            <span className="flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-crm-tint-border bg-crm-tint px-2.5 py-1 text-xs font-semibold text-crm-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-crm-accent" />
              Responde DigiBot
            </span>
          )}
        </div>
      )}

      {isCommentChannel(c.channel) && c.post && (
        <div className="flex shrink-0 items-center gap-3.5 border-b border-crm-border bg-crm-card px-4 py-3 md:px-[22px]">
          {c.post.thumbnailUrl ? (
            <img src={c.post.thumbnailUrl} alt="Imagen de la publicación" className="h-14 w-14 shrink-0 rounded-[10px] object-cover" />
          ) : (
            <div
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] bg-[repeating-linear-gradient(135deg,var(--crm-border)_0_6px,var(--crm-surf)_6px_12px)] text-center text-[9px] font-semibold text-crm-muted"
            >
              {c.channel === "th" ? "hilo" : "foto del post"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-crm-muted">
              {c.channel === "th" ? "Respondió tu hilo" : "Comentó en tu publicación"}
            </div>
            <div className="mt-0.5 truncate text-sm text-crm-ink">{c.post.caption || "Publicación sin texto"}</div>
          </div>
          {(c.post.likes > 0 || c.post.comments > 0) && (
            <div className="hidden shrink-0 text-[13px] text-crm-muted md:block">
              {c.post.likes} {c.channel === "fbc" ? "reacciones" : "me gusta"} · {c.post.comments} comentarios
            </div>
          )}
          {c.post.permalink && (
            <a
              href={c.post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-semibold text-crm-primary hover:text-crm-primary-hover"
            >
              Ver
            </a>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label={`Mensajes con ${displayName(c)}`}
        className={`crm-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-[clamp(12px,4vw,48px)] py-[22px] ${
          isWa ? "crm-chat-wa" : "bg-crm-bg"
        }`}
      >
        {!loaded && !loadError && (
          <div aria-hidden className="flex flex-col gap-2.5">
            {["w-2/5 self-start", "w-1/3 self-end", "w-1/2 self-start", "w-1/4 self-end"].map((cls) => (
              <div key={cls} className={`h-12 animate-pulse rounded-[18px] bg-crm-in-bubble opacity-70 ${cls}`} />
            ))}
          </div>
        )}
        {loadError && !loaded && (
          <div className="m-auto max-w-[320px] rounded-2xl bg-crm-card p-5 text-center text-sm text-crm-muted">
            <div className="font-semibold text-crm-error">No se pudieron cargar los mensajes</div>
            <div className="mt-1">{loadError}</div>
          </div>
        )}
        {messages.map((m, i) => {
          const showDay = i === 0 || dayKey(messages[i - 1].messageAt) !== dayKey(m.messageAt);
          return (
            <Fragment key={m.id}>
              {showDay && (
                <div
                  suppressHydrationWarning
                  className="mb-1.5 self-center rounded-pill bg-crm-in-bubble px-3 py-[5px] text-xs font-semibold text-crm-muted shadow-[0_1px_1px_rgba(0,0,0,.05)]"
                >
                  {formatDayLabel(m.messageAt)}
                </div>
              )}
              <MessageBubble message={m} channel={c.channel} meName={me.name} actions={failureActions} />
            </Fragment>
          );
        })}
      </div>

      <Composer
        conversation={c}
        draft={draft}
        onDraft={setDraft}
        busyAction={busyAction}
        onSend={sendText}
        onReopen={actions.reopen}
        onTakeOver={actions.takeOver}
        onGiveBack={actions.giveBack}
        onOpenTemplates={() => setTemplatesOpen(true)}
      />

      {isWa && (
        <TemplateModal
          open={templatesOpen}
          onClose={() => setTemplatesOpen(false)}
          api={api}
          contactFirstName={firstName(c)}
          onSend={sendTemplate}
        />
      )}
    </div>
  );
}
