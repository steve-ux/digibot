"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCrmShell } from "@/components/crm/CrmShell";
import Icon from "@/components/crm/Icon";
import { useToast } from "@/components/crm/Toast";
import type { AttributeValue, CustomAttribute } from "@/lib/crm/attributes";
import { CHANNELS } from "@/lib/crm/channels";
import { labelColor, type Label } from "@/lib/crm/labels";
import { accountPath, canAccess } from "@/lib/crm/permissions";
import type { InboxConversation } from "@/lib/wa-inbox/types";
import Avatar from "./Avatar";
import { contactHandle, displayName, formatSince, type TeamMember } from "./utils";

const NOTE_DEBOUNCE_MS = 800;

function SectionTitle({ children, htmlFor, action }: { children: React.ReactNode; htmlFor?: string; action?: React.ReactNode }) {
  const cls = "block text-xs font-bold tracking-[.8px] text-crm-muted";
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={cls}>
          {children}
        </label>
      ) : (
        <div className={cls}>{children}</div>
      )}
      {action}
    </div>
  );
}

// Datos del contacto: id, asignación, etiquetas y atributos de la cuenta, y nota interna (autoguardado).
export default function ContactPanel({
  conversation: c,
  team,
  meId,
  accountId,
  labels,
  attributes,
  onAssign,
  onTags,
  onNote,
  onAttribute,
}: {
  conversation: InboxConversation;
  team: TeamMember[];
  meId: number;
  accountId: number;
  labels: Label[];
  attributes: CustomAttribute[];
  onAssign: (assigneeId: number | null) => void;
  onTags: (tags: string[]) => void;
  onNote: (note: string) => Promise<boolean>;
  onAttribute: (key: string, value: AttributeValue | null) => Promise<boolean>;
}) {
  const { user } = useCrmShell();
  const toast = useToast();
  const [note, setNote] = useState(c.note);
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef<string | null>(null);
  const onNoteRef = useRef(onNote);
  onNoteRef.current = onNote;
  const canConfigure = canAccess(user.role, "settings");
  const settingsHref = accountPath(accountId, "configuracion");

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

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(String(c.id));
      toast(`ID ${c.id} copiado`);
    } catch {
      toast("No se pudo copiar", "error");
    }
  };

  const channel = CHANNELS[c.channel];
  const handle = contactHandle(c);
  // Etiquetas de la cuenta + las que la conversación tenga de antes (aunque ya no estén en la lista).
  const knownNames = new Set(labels.map((l) => l.name));
  const orphanTags = c.tags.filter((t) => !knownNames.has(t));

  return (
    <div className="flex flex-col gap-6 px-[22px] py-[26px]">
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar conversation={c} size={72} showChannel={false} />
        <div className="mt-1 font-poppins text-[17px] font-semibold text-crm-ink">{displayName(c)}</div>
        <div className="flex max-w-full items-center gap-[7px] rounded-pill bg-crm-surf px-3 py-[5px] text-[13px] text-crm-nav">
          <img src={channel.icon} alt={channel.name} width={16} height={16} className="block shrink-0" />
          <span className="truncate">{handle || channel.name}</span>
        </div>
        <button
          onClick={copyId}
          title="Copiar el ID de la conversación"
          className="mt-0.5 flex min-h-[32px] items-center gap-1.5 rounded-pill px-2.5 text-xs font-semibold text-crm-muted transition-colors hover:bg-crm-surf hover:text-crm-ink"
        >
          Conversación #{c.id}
          <Icon name="copy" size={14} />
        </button>
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
        <SectionTitle
          action={
            canConfigure ? (
              <Link href={`${settingsHref}?tab=etiquetas`} className="text-xs font-semibold text-crm-primary hover:underline">
                Editar
              </Link>
            ) : null
          }
        >
          ETIQUETAS
        </SectionTitle>
        {labels.length === 0 && orphanTags.length === 0 ? (
          <p className="m-0 text-[13px] text-crm-muted">
            {canConfigure ? (
              <>
                Todavía no hay etiquetas.{" "}
                <Link href={`${settingsHref}?tab=etiquetas`} className="font-semibold text-crm-primary">
                  Crear la primera
                </Link>
              </>
            ) : (
              "Tu administrador todavía no creó etiquetas."
            )}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {[...labels.map((l) => ({ name: l.name, color: labelColor(l.color), title: l.description ?? undefined })), ...orphanTags.map((t) => ({ name: t, color: labelColor("gray"), title: "Ya no está en la lista de etiquetas" }))].map((tag) => {
              const on = c.tags.includes(tag.name);
              return (
                <button
                  key={tag.name}
                  aria-pressed={on}
                  title={tag.title}
                  onClick={() => onTags(on ? c.tags.filter((t) => t !== tag.name) : [...c.tags, tag.name])}
                  className={`flex min-h-[30px] items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold transition-colors ${
                    on
                      ? "border-crm-primary bg-crm-primary text-white"
                      : "border-crm-border bg-crm-chip text-crm-ink-2 hover:border-crm-primary"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rounded-full ${on ? "ring-1 ring-white" : ""}`}
                    style={{ background: tag.color }}
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {(attributes.length > 0 || canConfigure) && (
        <div>
          <SectionTitle
            action={
              canConfigure ? (
                <Link href={`${settingsHref}?tab=atributos`} className="text-xs font-semibold text-crm-primary hover:underline">
                  Editar
                </Link>
              ) : null
            }
          >
            ATRIBUTOS
          </SectionTitle>
          {attributes.length === 0 ? (
            <p className="m-0 text-[13px] text-crm-muted">
              Guardá datos propios de tu negocio (DNI, obra social, modelo…).{" "}
              <Link href={`${settingsHref}?tab=atributos`} className="font-semibold text-crm-primary">
                Crear atributos
              </Link>
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {attributes.map((def) => (
                <AttributeField
                  key={`${c.id}-${def.key}`}
                  conversationId={c.id}
                  def={def}
                  value={c.attributes[def.key]}
                  onSave={(value) => onAttribute(def.key, value)}
                />
              ))}
            </div>
          )}
        </div>
      )}

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

const fieldClass =
  "h-10 w-full rounded-field border border-crm-border bg-crm-surf px-3 text-sm text-crm-ink outline-none placeholder:text-crm-subtle focus:border-crm-primary";

// Un atributo editable. Texto/número/fecha/link se guardan al salir del campo;
// lista y sí/no, al elegir.
function AttributeField({
  conversationId,
  def,
  value,
  onSave,
}: {
  conversationId: number;
  def: CustomAttribute;
  value: AttributeValue | undefined;
  onSave: (value: AttributeValue | null) => Promise<boolean>;
}) {
  const id = `attr-${conversationId}-${def.key}`;
  const toText = (v: AttributeValue | undefined) => (v === undefined || typeof v === "boolean" ? "" : String(v));
  const [draft, setDraft] = useState(toText(value));
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const focused = useRef(false);

  // El polling trae el valor guardado: se actualiza salvo que se esté escribiendo.
  useEffect(() => {
    if (!focused.current) setDraft(toText(value));
  }, [value]);

  const save = async (next: AttributeValue | null) => {
    setState("saving");
    const ok = await onSave(next);
    setState(ok ? "idle" : "error");
    if (!ok) setDraft(toText(value));
  };

  const commitText = () => {
    focused.current = false;
    const trimmed = draft.trim();
    if (trimmed === toText(value)) return;
    save(trimmed === "" ? null : def.type === "number" ? Number(trimmed.replace(",", ".")) : trimmed);
  };

  const label = (
    <label htmlFor={id} className="mb-1 flex items-center justify-between gap-2 text-[13px] font-semibold text-crm-ink-2">
      <span className="truncate" title={def.description ?? undefined}>
        {def.label}
      </span>
      <span aria-live="polite" className="shrink-0 text-[11px] font-semibold text-crm-muted">
        {state === "saving" && "Guardando…"}
        {state === "error" && <span className="text-crm-error">No se guardó</span>}
      </span>
    </label>
  );

  if (def.type === "checkbox") {
    return (
      <div className="flex min-h-[40px] items-center justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-semibold text-crm-ink-2" title={def.description ?? undefined}>
          {def.label}
        </label>
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => save(e.target.checked ? true : null)}
          className="h-5 w-5 cursor-pointer accent-[var(--crm-primary)]"
        />
      </div>
    );
  }

  if (def.type === "list") {
    return (
      <div>
        {label}
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => save(e.target.value || null)}
          className={`${fieldClass} cursor-pointer`}
        >
          <option value="">—</option>
          {def.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      {label}
      <input
        id={id}
        type={def.type === "date" ? "date" : def.type === "number" ? "text" : def.type === "link" ? "url" : "text"}
        inputMode={def.type === "number" ? "decimal" : def.type === "link" ? "url" : undefined}
        value={draft}
        placeholder={def.type === "link" ? "https://" : "—"}
        onFocus={() => (focused.current = true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={fieldClass}
      />
    </div>
  );
}
