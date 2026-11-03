"use client";

import { useEffect, useRef, useState } from "react";
import { CHANNELS } from "@/lib/crm/channels";
import type { InboxConversation } from "@/lib/wa-inbox/types";
import Avatar from "./Avatar";
import { contactHandle, displayName, formatSince, TAGS, type TeamMember } from "./utils";

const NOTE_DEBOUNCE_MS = 800;

function SectionTitle({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  const cls = "mb-2 block text-xs font-bold tracking-[.8px] text-crm-muted";
  return htmlFor ? (
    <label htmlFor={htmlFor} className={cls}>
      {children}
    </label>
  ) : (
    <div className={cls}>{children}</div>
  );
}

// Datos del contacto: asignación, etiquetas de un click y nota interna (autoguardado).
export default function ContactPanel({
  conversation: c,
  team,
  meId,
  onAssign,
  onTags,
  onNote,
}: {
  conversation: InboxConversation;
  team: TeamMember[];
  meId: number;
  onAssign: (assigneeId: number | null) => void;
  onTags: (tags: string[]) => void;
  onNote: (note: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState(c.note);
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef<string | null>(null);
  const onNoteRef = useRef(onNote);
  onNoteRef.current = onNote;

  // Al cambiar de conversación se guarda lo pendiente y se carga la nota nueva.
  useEffect(() => {
    setNote(c.note);
    setNoteState("idle");
    return () => {
      clearTimeout(timer.current);
      if (pending.current !== null) onNoteRef.current(pending.current);
      pending.current = null;
    };
    // Solo al cambiar de conversación; las actualizaciones del polling no pisan lo que se escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id]);

  const changeNote = (value: string) => {
    setNote(value);
    pending.current = value;
    setNoteState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const toSave = pending.current;
      if (toSave === null) return;
      pending.current = null;
      const ok = await onNoteRef.current(toSave);
      setNoteState(ok ? "saved" : "error");
    }, NOTE_DEBOUNCE_MS);
  };

  const channel = CHANNELS[c.channel];
  const handle = contactHandle(c);

  return (
    <div className="flex flex-col gap-6 px-[22px] py-[26px]">
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar conversation={c} size={72} showChannel={false} />
        <div className="mt-1 font-poppins text-[17px] font-semibold text-crm-ink">{displayName(c)}</div>
        <div className="flex max-w-full items-center gap-[7px] rounded-pill bg-crm-surf px-3 py-[5px] text-[13px] text-crm-nav">
          <img src={channel.icon} alt={channel.name} width={16} height={16} className="block shrink-0" />
          <span className="truncate">{handle || channel.name}</span>
        </div>
      </div>

      <div>
        <SectionTitle htmlFor={`assignee-${c.id}`}>ASIGNADA A</SectionTitle>
        <select
          id={`assignee-${c.id}`}
          value={c.assigneeId ?? ""}
          onChange={(e) => onAssign(e.target.value ? Number(e.target.value) : null)}
          className="h-11 w-full cursor-pointer rounded-field border border-crm-border bg-crm-surf px-3 text-sm text-crm-ink outline-none focus:border-crm-primary"
        >
          <option value="">Sin asignar</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === meId ? `${m.name} (vos)` : m.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <SectionTitle>ETIQUETAS</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {TAGS.map((tag) => {
            const on = c.tags.includes(tag);
            return (
              <button
                key={tag}
                aria-pressed={on}
                onClick={() => onTags(on ? c.tags.filter((t) => t !== tag) : [...c.tags, tag])}
                className={`min-h-[30px] rounded-pill border px-3 text-xs font-semibold transition-colors ${
                  on
                    ? "border-crm-primary bg-crm-primary text-white"
                    : "border-crm-border bg-crm-chip text-crm-ink-2 hover:border-crm-primary"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <SectionTitle htmlFor={`note-${c.id}`}>NOTA INTERNA</SectionTitle>
          <span aria-live="polite" className="text-[11px] font-semibold text-crm-muted">
            {noteState === "saving" && "Guardando…"}
            {noteState === "saved" && "Guardado"}
            {noteState === "error" && <span className="text-crm-error">No se pudo guardar</span>}
          </span>
        </div>
        <textarea
          id={`note-${c.id}`}
          value={note}
          onChange={(e) => changeNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Algo que tu equipo deba saber de este cliente"
          className="w-full resize-y rounded-field border border-crm-border bg-crm-surf px-3 py-[11px] text-sm leading-[1.4] text-crm-ink outline-none placeholder:text-crm-subtle focus:border-crm-primary"
        />
      </div>

      <dl className="m-0 flex flex-col gap-2.5 border-t border-crm-border pt-[18px] text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-crm-muted">Primer contacto</dt>
          <dd className="m-0 font-semibold text-crm-ink" suppressHydrationWarning>
            {formatSince(c.createdAt)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-crm-muted">Conversaciones</dt>
          <dd className="m-0 font-semibold text-crm-ink">{c.sessionCount}</dd>
        </div>
      </dl>
    </div>
  );
}
