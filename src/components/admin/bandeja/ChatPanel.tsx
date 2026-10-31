"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { InboxConversation, InboxMessage, MessageStatusUpdate } from "@/lib/wa-inbox/types";
import Composer from "./Composer";
import MessageBubble from "./MessageBubble";
import TemplatePicker, { type TemplateSelection } from "./TemplatePicker";
import {
  POLL_INTERVAL_MS,
  applyStatuses,
  displayName,
  initials,
  mergeMessages,
  replaceOptimistic,
  usePolling,
  windowLabel,
  type UiMessage,
} from "./utils";

interface PollResponse {
  conversation: InboxConversation;
  messages: InboxMessage[];
  statuses: MessageStatusUpdate[];
}

// Último estado conocido de cada chat abierto en esta sesión: al volver a abrirlo
// se pinta al instante y el polling solo trae lo nuevo.
const chatCache = new Map<number, { conversation: InboxConversation; messages: InboxMessage[] }>();

type SendBody =
  | { type: "text"; body: string }
  | { type: "template"; name: string; language: string; headerParams: string[]; bodyParams: string[] };

export default function ChatPanel({
  initialConversation,
  onBack,
  onActivity,
}: {
  initialConversation: InboxConversation;
  onBack: () => void;
  onActivity: () => void;
}) {
  const conversationId = initialConversation.id;
  const cached = chatCache.get(conversationId);
  const [conversation, setConversation] = useState(cached?.conversation ?? initialConversation);
  const [messages, setMessages] = useState<UiMessage[]>(cached?.messages ?? []);
  const [loaded, setLoaded] = useState(Boolean(cached));
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const lastIdRef = useRef(cached?.messages.reduce((max, m) => Math.max(max, m.id), 0) ?? 0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  usePolling(
    async () => {
      try {
        const res = await fetch(
          `/api/admin/bandeja/conversaciones/${conversationId}/mensajes?after=${lastIdRef.current}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.message || "No se pudieron cargar los mensajes.");
          return;
        }
        const { conversation: fresh, messages: incoming, statuses } = data as PollResponse;
        for (const m of incoming) lastIdRef.current = Math.max(lastIdRef.current, m.id);
        setConversation(fresh);
        setMessages((prev) => applyStatuses(mergeMessages(prev, incoming), statuses));
        setLoadError("");
        setLoaded(true);
      } catch {
        setLoadError("No se pudo conectar con el servidor.");
      }
    },
    POLL_INTERVAL_MS,
    conversationId
  );

  useEffect(() => {
    if (!loaded) return;
    chatCache.set(conversationId, { conversation, messages: messages.filter((m) => !m.pending) });
  }, [conversationId, conversation, messages, loaded]);

  // Baja al último mensaje si el usuario ya estaba abajo (no lo arrastra si está leyendo arriba).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = async (payload: SendBody, optimisticBody: string, templateName: string | null) => {
    const localId = -Date.now();
    const optimistic: UiMessage = {
      id: localId,
      conversationId,
      wamid: null,
      direction: "out",
      type: payload.type,
      body: optimisticBody,
      templateName,
      status: "sending",
      errorCode: null,
      errorTitle: null,
      messageAt: Math.floor(Date.now() / 1000),
      pending: true,
    };
    stickToBottomRef.current = true;
    setSendError("");
    setMessages((prev) => [...prev, optimistic]);

    const failLocally = (title: string) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === localId ? { ...m, status: "failed", errorTitle: title } : m))
      );

    try {
      const res = await fetch(`/api/admin/bandeja/conversaciones/${conversationId}/mensajes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (data.saved) {
        // Guardado en la base: puede estar "sent" o "failed" (con el error de Meta).
        setMessages((prev) => replaceOptimistic(prev, localId, data.saved));
        if (!res.ok) setSendError(data.message || "Meta rechazó el mensaje.");
      } else {
        // Rechazado antes de guardarse (ventana cerrada, validación, etc.).
        const message = data.message || "No se pudo enviar el mensaje.";
        failLocally(message);
        setSendError(message);
      }
    } catch {
      failLocally("No se pudo conectar con el servidor.");
      setSendError("No se pudo conectar con el servidor.");
    } finally {
      onActivity();
    }
  };

  const sendText = (text: string) => send({ type: "text", body: text }, text, null);

  const sendTemplate = (selection: TemplateSelection) =>
    send(
      {
        type: "template",
        name: selection.template.name,
        language: selection.template.language,
        headerParams: selection.headerParams,
        bodyParams: selection.bodyParams,
      },
      selection.preview,
      selection.template.name
    );

  const windowOpen = conversation.windowSecondsLeft > 0;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <button
          onClick={onBack}
          aria-label="Volver a las conversaciones"
          className="text-muted-foreground hover:text-primary lg:hidden"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 font-poppins text-sm font-bold text-primary">
          {initials(conversation)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-poppins text-[15px] font-semibold text-foreground">
            {displayName(conversation)}
          </div>
          <div className="text-xs text-muted-foreground">+{conversation.waId}</div>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
            windowOpen
              ? "border-secondary/30 bg-secondary/15 text-green-700 dark:text-secondary"
              : "border-yellow-400/30 bg-yellow-400/15 text-yellow-700 dark:text-yellow-400"
          }`}
        >
          {windowLabel(conversation.windowSecondsLeft)}
        </span>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="chat-pattern flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
      >
        {!loaded && !loadError && (
          <div aria-hidden className="flex flex-col gap-2">
            {["w-2/5 self-start", "w-1/3 self-end", "w-1/2 self-start", "w-1/4 self-end"].map((cls) => (
              <div key={cls} className={`h-10 animate-pulse rounded-2xl bg-muted ${cls}`} />
            ))}
          </div>
        )}
        {loadError && !loaded && <div className="m-auto text-sm text-destructive">{loadError}</div>}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>

      {sendError && (
        <div className="border-t border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {sendError}
        </div>
      )}

      {windowOpen ? <Composer onSend={sendText} /> : <TemplatePicker onSend={sendTemplate} />}
    </div>
  );
}
