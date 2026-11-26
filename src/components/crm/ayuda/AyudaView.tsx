"use client";

// Ayuda: chat con el bot de soporte de la plataforma (vive en n8n; el panel le
// habla por /api/admin/cuentas/:cuenta/ayuda) + preguntas frecuentes con respuesta al instante.
// La conversación se guarda en la pestaña (sessionStorage) para no perderla al navegar.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Logo from "@/components/Logo";
import PageHeader from "@/components/crm/PageHeader";
import { useCrmShell } from "@/components/crm/CrmShell";
import Icon from "@/components/crm/Icon";
import UserAvatar from "@/components/crm/UserAvatar";
import type { HelpFaq } from "@/lib/crm/help-faq";
import { accountApi } from "@/lib/crm/permissions";
import { waLink } from "@/lib/whatsapp";

const SUPPORT_EMAIL = "soporte@digibotlatam.com";
const HANDOFF = "Hablar con una persona";
const SUGGESTIONS = ["¿Qué puedo hacer en el panel?", "Tengo un problema con un canal", HANDOFF];

interface ChatMessage {
  id: string;
  from: "bot" | "user";
  text: string;
  at: number;
  // Debajo de la burbuja: botones para hablar con soporte humano
  handoff?: boolean;
  error?: boolean;
}

interface StoredChat {
  sessionId: string;
  startedAt: number;
  messages: ChatMessage[];
}

const card = "rounded-card border border-crm-border bg-crm-card";
const eyebrow = "text-[11px] font-bold uppercase tracking-[2px]";
const iconButton =
  "flex h-10 w-10 items-center justify-center rounded-field border border-crm-border bg-crm-surf text-crm-nav transition-colors hover:border-crm-primary hover:text-crm-primary";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
const pad2 = (n: number) => String(n).padStart(2, "0");

function greeting(firstName: string): ChatMessage {
  return {
    id: "hola",
    from: "bot",
    text: `¡Hola ${firstName}! 👋 Soy DigiBot. Te ayudo a usar el panel: la bandeja, tu equipo, los canales, tu plan y más. ¿En qué te doy una mano?`,
    at: Date.now(),
  };
}

function freshChat(firstName: string): StoredChat {
  return { sessionId: newId(), startedAt: Date.now(), messages: [greeting(firstName)] };
}

function loadChat(key: string): StoredChat | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredChat;
    return parsed && Array.isArray(parsed.messages) && parsed.messages.length ? parsed : null;
  } catch {
    return null;
  }
}

function saveChat(key: string, chat: StoredChat) {
  try {
    sessionStorage.setItem(key, JSON.stringify(chat));
  } catch {
    // Sin sessionStorage (modo privado, etc.): el chat vive solo en esta pantalla.
  }
}

// Texto del bot: links clickeables, **negrita** y saltos de línea (whitespace-pre-wrap).
const TOKEN = /(https?:\/\/[^\s)<>"']+|\*\*[^*\n]+\*\*)/g;
function RichText({ text, light }: { text: string; light?: boolean }) {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((part, i) => {
        if (/^https?:\/\//.test(part)) {
          const trailing = /[.,;:!?]+$/.exec(part)?.[0] ?? "";
          const url = trailing ? part.slice(0, -trailing.length) : part;
          return (
            <Fragment key={i}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`break-all font-semibold underline underline-offset-2 ${light ? "text-white" : "text-crm-primary"}`}
              >
                {url}
              </a>
              {trailing}
            </Fragment>
          );
        }
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

function BotAvatar({ size = 34 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full border border-crm-tint-border bg-crm-tint"
      style={{ width: size, height: size }}
    >
      <Logo size={Math.round(size * 0.62)} />
    </span>
  );
}

function HandoffActions({ message }: { message: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <a
        href={waLink(message)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-9 items-center gap-2 rounded-pill bg-crm-wa px-3.5 text-[13px] font-semibold text-white hover:opacity-90"
      >
        <Icon name="whatsapp" size={16} />
        Escribir por WhatsApp
      </a>
      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Ayuda con el panel de DigiBot")}`}
        className="flex h-9 items-center gap-2 rounded-pill border border-crm-border bg-crm-chip px-3.5 text-[13px] font-semibold text-crm-ink-2 hover:border-crm-primary hover:text-crm-primary"
      >
        <Icon name="mail" size={16} />
        {SUPPORT_EMAIL}
      </a>
    </div>
  );
}

function Bubble({ m, userName, avatarUrl, handoffMessage }: { m: ChatMessage; userName: string; avatarUrl: string | null; handoffMessage: string }) {
  const mine = m.from === "user";
  return (
    <div className={`flex items-end gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
      {mine ? <UserAvatar name={userName} url={avatarUrl} size={34} /> : <BotAvatar />}
      <div className={`flex min-w-0 max-w-[min(620px,85%)] flex-col ${mine ? "items-end" : "items-start"}`}>
        <div
          className={`whitespace-pre-wrap break-words rounded-[18px] px-4 py-2.5 text-[15px] leading-[1.5] ${
            mine
              ? "rounded-br-[4px] bg-crm-primary text-white"
              : m.error
                ? "rounded-bl-[4px] border border-crm-error-border bg-crm-error-bg text-crm-error-ink"
                : "rounded-bl-[4px] border border-crm-border bg-crm-surf text-crm-ink"
          }`}
        >
          <RichText text={m.text} light={mine} />
        </div>
        {m.handoff && <HandoffActions message={handoffMessage} />}
        <span className="mx-1 mt-1 text-[11px] font-medium tabular-nums text-crm-muted">{hhmm(m.at)}</span>
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex items-end gap-2.5" role="status" aria-label="DigiBot está escribiendo">
      <BotAvatar />
      <div className="flex h-[42px] items-center gap-1.5 rounded-[18px] rounded-bl-[4px] border border-crm-border bg-crm-surf px-4">
        {[0, 0.2, 0.4].map((delay) => (
          <span
            key={delay}
            className="h-2 w-2 rounded-full bg-crm-primary"
            style={{ animation: "dot 1.4s infinite", animationDelay: `${delay}s` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function AyudaView({ accountId, faq }: { accountId: number; faq: HelpFaq[] }) {
  const { user, account, avatarUrl } = useCrmShell();
  const firstName = user.name.trim().split(/\s+/)[0] || "";
  const storageKey = `digibot-ayuda:${accountId}:${user.id}`;
  // null hasta montar: la hora y lo guardado en la pestaña solo existen en el navegador.
  const [chat, setChat] = useState<StoredChat | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [filter, setFilter] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setChat(loadChat(storageKey) ?? freshChat(firstName));
  }, [storageKey, firstName]);

  useEffect(() => {
    if (chat) saveChat(storageKey, chat);
  }, [chat, storageKey]);

  // Siempre al último mensaje (y al indicador de "escribiendo").
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat?.messages.length, pending]);

  // Auto-alto del campo de texto (hasta 5 líneas aprox.).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  const handoffMessage = useMemo(
    () =>
      `Hola! Necesito ayuda con el panel de DigiBot.\nCuenta: ${account?.name ?? ""} (#${accountId})\nUsuario: ${user.name} (${user.roleLabel})`,
    [account?.name, accountId, user.name, user.roleLabel]
  );

  const push = useCallback((...messages: ChatMessage[]) => {
    setChat((prev) => (prev ? { ...prev, messages: [...prev.messages, ...messages] } : prev));
  }, []);

  // En mobile las preguntas frecuentes quedan debajo del chat: se sube a mirarlo.
  const revealChat = () => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      chatRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const ask = async (text: string, source: "composer" | "faq" | "chip") => {
    const message = text.trim();
    if (!message || pending || !chat) return;
    push({ id: newId(), from: "user", text: message, at: Date.now() });

    if (message === HANDOFF) {
      push({
        id: newId(),
        from: "bot",
        text: "¡Claro! Escribile a nuestro equipo de soporte por WhatsApp o por email. Si nos contás qué estabas haciendo cuando pasó, lo resolvemos más rápido.",
        at: Date.now(),
        handoff: true,
      });
      return;
    }

    setPending(true);
    try {
      const res = await fetch(accountApi(accountId, "ayuda"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId: chat.sessionId, source }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string; message?: string };
      if (res.ok && data.reply) {
        push({ id: newId(), from: "bot", text: data.reply, at: Date.now() });
      } else if (data.error === "not_configured") {
        push({
          id: newId(),
          from: "bot",
          text: "Todavía estoy aprendiendo a responder consultas libres 🤖. Por ahora te contesto al instante las preguntas frecuentes; para todo lo demás, escribile a nuestro equipo:",
          at: Date.now(),
          handoff: true,
        });
      } else {
        push({
          id: newId(),
          from: "bot",
          text: data.message || "No pude responder en este momento. Probá de nuevo en unos segundos.",
          at: Date.now(),
          error: true,
          handoff: res.status >= 500,
        });
      }
    } catch {
      push({
        id: newId(),
        from: "bot",
        text: "No hay conexión. Revisá tu internet y probá de nuevo.",
        at: Date.now(),
        error: true,
      });
    } finally {
      setPending(false);
    }
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || pending) {
      inputRef.current?.focus();
      return;
    }
    const text = draft;
    setDraft("");
    void ask(text, "composer");
  };

  const pickFaq = (item: HelpFaq) => {
    if (pending || !chat) return;
    revealChat();
    if (item.answer) {
      push(
        { id: newId(), from: "user", text: item.question, at: Date.now() },
        { id: newId(), from: "bot", text: item.answer, at: Date.now() }
      );
    } else {
      void ask(item.question, "faq");
    }
  };

  const reset = () => {
    if (pending) return;
    setChat(freshChat(firstName));
    setDraft("");
    inputRef.current?.focus();
  };

  const visibleFaq = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? faq.filter((f) => `${f.label} ${f.question}`.toLowerCase().includes(q)) : faq;
  }, [faq, filter]);

  const started = chat ? new Date(chat.startedAt) : null;
  const sameDay = started ? started.toDateString() === new Date().toDateString() : true;

  return (
    <div className="crm-scroll flex-1 overflow-y-auto lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pb-8 pt-5 md:px-[clamp(24px,4vw,56px)] md:pt-8 lg:h-full lg:pb-7">
        {/* Encabezado: mismo patrón que el resto de las secciones (PageHeader) */}
        <PageHeader
          title="Ayuda"
          description="Chateá con DigiBot, mirá las preguntas frecuentes y recibí ayuda guiada para usar el panel."
          actions={
            <span className="flex items-center gap-2 rounded-pill bg-crm-success-bg px-3 py-1.5 text-[12px] font-bold text-crm-success-ink">
              <span className="h-2 w-2 rounded-full bg-crm-success" />
              Asistente en línea · 24/7
            </span>
          }
        />

        <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
          {/* Columna izquierda: preguntas frecuentes a todo el alto (en mobile, debajo del chat) */}
          <aside className="order-2 flex flex-col lg:order-1 lg:min-h-0">
            <div className={`${card} flex flex-col px-4 py-5 md:px-5 lg:min-h-0 lg:flex-1`}>
              <div className="flex items-center justify-between gap-2 px-1">
                <p className={`${eyebrow} m-0 text-crm-primary`}>Preguntas frecuentes</p>
                <span className="text-[11px] font-semibold tracking-[1.5px] text-crm-muted">{pad2(faq.length)} / TOP</span>
              </div>
              <h3 className="m-0 mt-1 px-1 font-poppins text-lg font-bold tracking-[-.3px] text-crm-ink">Buscar respuesta rápida</h3>

              <label className="relative mt-3 block">
                <span className="sr-only">Buscar en las preguntas frecuentes</span>
                <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-crm-muted" />
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Buscar…"
                  className="h-10 w-full rounded-field border border-crm-border bg-crm-surf pl-9 pr-3 text-sm text-crm-ink outline-none focus-visible:!outline-none placeholder:text-crm-subtle focus:border-crm-primary"
                />
              </label>

              <div className="crm-scroll -mx-1 mt-3 flex flex-col gap-2 px-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {visibleFaq.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pickFaq(item)}
                    disabled={pending}
                    className="group flex min-h-[52px] w-full items-center gap-3 rounded-field border border-crm-border bg-crm-surf px-3.5 py-2.5 text-left transition-colors hover:border-crm-primary hover:bg-crm-tint disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="w-5 shrink-0 text-[11px] font-bold tabular-nums text-crm-subtle group-hover:text-crm-primary">
                      {pad2(faq.indexOf(item) + 1)}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-crm-ink">{item.label}</span>
                    <span aria-hidden className="text-crm-muted transition-transform group-hover:translate-x-0.5 group-hover:text-crm-primary">
                      →
                    </span>
                  </button>
                ))}
                {visibleFaq.length === 0 && (
                  <p className="m-0 px-1 py-3 text-sm text-crm-muted">
                    No hay preguntas con “{filter.trim()}”. Escribísela a DigiBot en el chat.
                  </p>
                )}
              </div>
            </div>
          </aside>

          {/* Chat */}
          <section
            ref={chatRef}
            aria-label="Chat con DigiBot"
            className={`${card} order-1 flex h-[min(680px,78dvh)] min-h-[460px] scroll-mt-4 flex-col overflow-hidden lg:order-2 lg:h-auto lg:min-h-0`}
          >
            <div className="flex items-center gap-3 border-b border-crm-border px-4 py-3.5 md:px-5">
              <span className="relative">
                <BotAvatar size={42} />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-crm-card bg-crm-success" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-poppins text-base font-bold text-crm-ink">DigiBot</div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[1.2px] text-crm-success-ink">
                  <span className="h-1.5 w-1.5 rounded-full bg-crm-success" />
                  En línea · responde al instante
                </div>
              </div>
              <div className="flex items-center gap-2" role="group" aria-label="Acciones del chat">
                <button type="button" onClick={reset} disabled={pending} title="Reiniciar conversación" aria-label="Reiniciar conversación" className={`${iconButton} disabled:opacity-50`}>
                  <Icon name="retry" size={18} />
                </button>
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Ayuda con el panel de DigiBot")}`}
                  title={`Escribir a ${SUPPORT_EMAIL}`}
                  aria-label="Enviar un email a soporte"
                  className={iconButton}
                >
                  <Icon name="mail" size={18} />
                </a>
                <a
                  href={waLink(handoffMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Soporte humano por WhatsApp"
                  aria-label="Abrir WhatsApp de soporte"
                  className={`${iconButton} hover:!border-crm-wa hover:!text-crm-wa`}
                >
                  <Icon name="whatsapp" size={18} />
                </a>
              </div>
            </div>

            <div ref={bodyRef} className="crm-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 md:px-6" aria-live="polite">
              {started && (
                <div className="flex items-center gap-3" aria-hidden>
                  <span className="h-px flex-1 bg-crm-border" />
                  <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-crm-muted">
                    {sameDay ? "Hoy" : started.toLocaleDateString("es-AR", { day: "numeric", month: "short" })} · {hhmm(started.getTime())}
                  </span>
                  <span className="h-px flex-1 bg-crm-border" />
                </div>
              )}
              {chat?.messages.map((m) => (
                <Bubble key={m.id} m={m} userName={user.name} avatarUrl={avatarUrl} handoffMessage={handoffMessage} />
              ))}
              {pending && <Typing />}
            </div>

            <div className="border-t border-crm-border px-4 pb-4 pt-3 md:px-5">
              <div className="crm-scroll -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-0.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void ask(s, "chip")}
                    disabled={pending || !chat}
                    className="h-9 shrink-0 rounded-pill border border-crm-border bg-crm-chip px-3.5 text-[13px] font-semibold text-crm-ink-2 transition-colors hover:border-crm-primary hover:text-crm-primary disabled:opacity-60"
                  >
                    {s}
                  </button>
                ))}
              </div>

              <form onSubmit={submit} className="flex items-end gap-2 rounded-[16px] border border-crm-border bg-crm-surf p-1.5 focus-within:border-crm-primary">
                <label htmlFor="ayuda-consulta" className="sr-only">
                  Tu consulta para DigiBot
                </label>
                <textarea
                  id="ayuda-consulta"
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  maxLength={2000}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  placeholder="Escribí tu consulta…"
                  className="max-h-[140px] min-h-[42px] flex-1 resize-none bg-transparent px-2.5 py-2.5 text-[15px] leading-[1.4] text-crm-ink outline-none focus-visible:!outline-none placeholder:text-crm-subtle"
                />
                <button
                  type="submit"
                  disabled={pending || !draft.trim()}
                  aria-label="Enviar consulta a DigiBot"
                  title="Enviar"
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-field bg-crm-primary text-white transition-colors hover:bg-crm-primary-hover disabled:opacity-50"
                >
                  <Icon name="send" size={18} />
                </button>
              </form>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-[12px] text-crm-muted">
                <p className="m-0">
                  Si DigiBot no resuelve tu consulta,{" "}
                  <button type="button" onClick={() => void ask(HANDOFF, "chip")} disabled={pending || !chat} className="font-semibold text-crm-primary hover:underline">
                    te derivamos con soporte humano →
                  </button>
                </p>
                <span className="hidden font-semibold uppercase tracking-[1.2px] md:inline">Enter para enviar · Shift + Enter, nueva línea</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
