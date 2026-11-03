"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/crm/Icon";
import { useToast } from "@/components/crm/Toast";
import { isCommentChannel, supportsPrivateReply } from "@/lib/crm/channels";
import { replyAvailability } from "@/lib/crm/reply-window";
import type { InboxConversation } from "@/lib/wa-inbox/types";
import type { ReplyMode } from "./api";
import { QUICK_REPLIES, useMediaQuery } from "./utils";

export type ComposeTarget = "reply" | ReplyMode | "note";

const MAX_HEIGHT = 140;

// Qué se muestra abajo del chat: uno solo de estos estados a la vez.
export function composerState(c: InboxConversation) {
  if (c.status === "resolved") return "resolved" as const;
  if (c.botActive) return "bot" as const;
  if (c.channel === "wa" && c.windowSecondsLeft <= 0) return "gate" as const;
  // Instagram / Messenger: más de 7 días sin que el cliente escriba.
  if ((c.channel === "ig" || c.channel === "fb") && !replyAvailability(c, "message").allowed) {
    return "expired" as const;
  }
  return "compose" as const;
}

function PrimaryButton({ onClick, children, busy }: { onClick: () => void; children: React.ReactNode; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex h-11 shrink-0 items-center gap-2 rounded-pill bg-crm-primary px-5 font-poppins text-sm font-semibold text-white transition-colors hover:bg-crm-primary-hover disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export default function Composer({
  conversation,
  draft,
  onDraft,
  busyAction,
  onSend,
  onReopen,
  onTakeOver,
  onGiveBack,
  onOpenTemplates,
}: {
  conversation: InboxConversation;
  draft: string;
  onDraft: (text: string) => void;
  busyAction: boolean;
  onSend: (text: string, target: ComposeTarget) => void;
  onReopen: () => void;
  onTakeOver: () => void;
  onGiveBack: () => void;
  onOpenTemplates: () => void;
}) {
  const toast = useToast();
  const state = composerState(conversation);
  const isComment = isCommentChannel(conversation.channel);
  const [target, setTarget] = useState<ComposeTarget>(isComment ? "public" : "reply");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // En pantallas táctiles Enter hace salto de línea (como WhatsApp); se envía con el botón.
  const coarse = useMediaQuery("(pointer: coarse)");

  useEffect(() => setTarget(isComment ? "public" : "reply"), [conversation.id, isComment]);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  };
  useEffect(resize, [draft]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text, target);
    onDraft("");
    textareaRef.current?.focus();
  };

  const wrap = "pb-safe shrink-0 border-t border-crm-border bg-crm-side px-4 pb-4 pt-3.5 md:px-[22px] md:pb-[18px]";

  if (state === "resolved") {
    return (
      <div className={wrap}>
        <div className="flex flex-wrap items-center gap-3.5">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-crm-success-bg text-crm-success">
            <Icon name="check" size={18} />
          </span>
          <div className="min-w-[180px] flex-1">
            <div className="text-[15px] font-semibold text-crm-ink">Conversación resuelta</div>
            <div className="text-[13px] text-crm-muted">Si el cliente vuelve a escribir, se reabre sola.</div>
          </div>
          <button
            onClick={onReopen}
            disabled={busyAction}
            className="h-[42px] rounded-pill border border-crm-border-2 bg-crm-chip px-5 font-poppins text-sm font-semibold text-crm-ink transition-colors hover:border-crm-primary hover:text-crm-primary disabled:opacity-60"
          >
            Reabrir
          </button>
        </div>
      </div>
    );
  }

  if (state === "bot") {
    return (
      <div className={wrap}>
        <div className="flex flex-wrap items-center gap-3.5 rounded-[18px] border border-crm-tint-border bg-crm-tint px-4 py-3.5">
          <div className="flex shrink-0 gap-[5px] rounded-[14px] rounded-bl-[4px] bg-crm-primary px-[13px] py-[11px]" aria-hidden>
            {[0, 0.2, 0.4].map((d) => (
              <span
                key={d}
                className="h-1.5 w-1.5 rounded-full bg-crm-accent [animation:dot_1.4s_infinite]"
                style={{ animationDelay: `${d}s` }}
              />
            ))}
          </div>
          <div className="min-w-[180px] flex-1">
            <div className="text-[15px] font-semibold text-crm-ink">DigiBot está atendiendo esta conversación</div>
            <div className="text-[13px] text-crm-nav">Si querés responder vos, tomala. La IA se pausa solo en este chat.</div>
          </div>
          <PrimaryButton onClick={onTakeOver} busy={busyAction}>
            Tomar conversación
          </PrimaryButton>
        </div>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className={wrap}>
        <div className="flex flex-wrap items-center gap-3.5 rounded-[18px] border border-crm-warn-border bg-crm-warn-soft px-4 py-3.5">
          <Icon name="lock" size={22} className="text-crm-warn" />
          <div className="min-w-[180px] flex-1">
            <div className="text-[15px] font-semibold text-crm-warn-ink">Ya no se puede responder por este canal</div>
            <div className="text-[13px] text-crm-warn-ink-2">{replyAvailability(conversation, "message").reason}</div>
          </div>
        </div>
      </div>
    );
  }

  if (state === "gate") {
    return (
      <div className={wrap}>
        <div className="flex flex-wrap items-center gap-3.5 rounded-[18px] border border-crm-warn-border bg-crm-warn-soft px-4 py-3.5">
          <Icon name="lock" size={22} className="text-crm-warn" />
          <div className="min-w-[180px] flex-1">
            <div className="text-[15px] font-semibold text-crm-warn-ink">Pasaron más de 24 h desde su último mensaje</div>
            <div className="text-[13px] text-crm-warn-ink-2">WhatsApp solo deja retomar la charla con una plantilla aprobada.</div>
          </div>
          <PrimaryButton onClick={onOpenTemplates}>
            <Icon name="template" size={17} />
            Enviar plantilla
          </PrimaryButton>
        </div>
      </div>
    );
  }

  const privateAllowed =
    isComment && supportsPrivateReply(conversation.channel) && replyAvailability(conversation, "comment_private").allowed;
  const humanAgent = !isComment && conversation.channel !== "wa" && replyAvailability(conversation, "message").humanAgent;
  const targets: { id: ComposeTarget; label: string }[] = isComment
    ? [
        { id: "public", label: "En público" },
        ...(privateAllowed ? [{ id: "private" as const, label: "Por privado" }] : []),
        { id: "note", label: "Nota interna" },
      ]
    : [
        { id: "reply", label: "Responder" },
        { id: "note", label: "Nota interna" },
      ];
  const isNote = target === "note";
  const placeholder = isNote
    ? "Escribí una nota para tu equipo (el cliente no la ve)"
    : target === "public"
      ? "Respondé el comentario (lo ve todo el mundo)"
      : target === "private"
        ? "Escribile por mensaje privado"
        : "Escribí un mensaje…";
  const canSend = draft.trim().length > 0;

  return (
    <div className={wrap}>
      <div className="flex flex-col gap-2.5">
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
          <div role="radiogroup" aria-label="Tipo de respuesta" className="mr-1.5 flex shrink-0 gap-0.5 rounded-pill bg-crm-surf p-[3px]">
            {targets.map((t) => {
              const on = target === t.id;
              return (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setTarget(t.id)}
                  className={`h-[30px] whitespace-nowrap rounded-pill px-[13px] text-xs font-bold transition-colors ${
                    on
                      ? t.id === "note"
                        ? "bg-[#FCD34D] text-[#78350F]"
                        : "bg-crm-primary text-white"
                      : "text-crm-muted hover:text-crm-ink"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {!isNote &&
            QUICK_REPLIES.map((q) => (
              <button
                key={q}
                onClick={() => {
                  onDraft(q);
                  textareaRef.current?.focus();
                }}
                className="h-8 shrink-0 whitespace-nowrap rounded-pill border border-crm-border bg-crm-chip px-[13px] text-[13px] font-medium text-crm-ink-2 transition-colors hover:border-crm-primary hover:text-crm-primary"
              >
                {q}
              </button>
            ))}
        </div>

        {humanAgent && !isNote && (
          <div className="flex items-start gap-2 rounded-field bg-crm-warn-soft px-3 py-2 text-xs leading-[1.4] text-crm-warn-ink">
            <Icon name="clock" size={14} className="mt-px" />
            <span>
              Pasaron más de 24 h: Meta solo deja que responda una persona del equipo, hasta 7 días después de su
              último mensaje.
            </span>
          </div>
        )}

        <div className="flex items-end gap-2 md:gap-2.5">
          <button
            onClick={() => toast("Muy pronto vas a poder adjuntar archivos")}
            title="Adjuntar archivo"
            aria-label="Adjuntar archivo"
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full text-crm-muted transition-colors hover:text-crm-primary"
          >
            <Icon name="clip" size={21} />
          </button>
          <label className="sr-only" htmlFor="crm-composer">
            {isNote ? "Nota interna" : "Mensaje"}
          </label>
          <textarea
            id="crm-composer"
            ref={textareaRef}
            rows={1}
            value={draft}
            enterKeyHint={coarse ? "enter" : "send"}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            className={`max-h-[140px] min-w-0 flex-1 resize-none overflow-y-hidden rounded-[24px] border px-[18px] py-[13px] text-[15px] leading-[1.4] text-crm-ink outline-none placeholder:text-crm-subtle focus:border-crm-primary ${
              isNote ? "border-dashed border-crm-note-border bg-crm-note" : "border-crm-border bg-crm-surf"
            }`}
          />
          <button
            onClick={submit}
            disabled={!canSend}
            title={isNote ? "Guardar nota" : "Enviar"}
            aria-label={isNote ? "Guardar nota" : "Enviar"}
            className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full text-white transition-colors ${
              canSend ? "bg-crm-primary hover:bg-crm-primary-hover" : "bg-crm-primary-soft"
            }`}
          >
            <Icon name={isNote ? "check" : "send"} size={20} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3.5 text-xs">
          <span className="hidden text-crm-muted md:inline">Enter para enviar · Shift + Enter para salto de línea</span>
          <button
            onClick={onGiveBack}
            disabled={busyAction}
            className="ml-auto min-h-[32px] border-0 bg-transparent p-0 text-xs font-semibold text-crm-primary hover:text-crm-primary-hover disabled:opacity-60"
          >
            Devolver a DigiBot
          </button>
        </div>
      </div>
    </div>
  );
}
