"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccountId } from "@/components/crm/CrmShell";
import { Modal } from "@/components/crm/Modal";
import { accountPath } from "@/lib/crm/permissions";
import { renderTemplateText, type InboxTemplate } from "@/lib/wa-inbox/types";
import type { InboxApi } from "./api";

export interface TemplateSelection {
  template: InboxTemplate;
  headerParams: string[];
  bodyParams: string[];
  preview: string;
}

const keyOf = (t: InboxTemplate) => `${t.name}|${t.language}`;

// "pedido_listo" -> "Pedido listo"
export function prettyTemplateName(name: string) {
  const text = name.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function render(t: InboxTemplate, header: Record<string, string>, body: Record<string, string>) {
  const b = renderTemplateText(t.body, body);
  return t.header ? `${renderTemplateText(t.header, header)}\n${b}` : b;
}

// La variable {{1}} del cuerpo se completa sola con el nombre del contacto.
function autofill(t: InboxTemplate, name: string) {
  const body: Record<string, string> = {};
  if (name && t.bodyVars.includes("1")) body["1"] = name;
  return body;
}

function isComplete(t: InboxTemplate, header: Record<string, string>, body: Record<string, string>) {
  return t.headerVars.every((v) => header[v]?.trim()) && t.bodyVars.every((v) => body[v]?.trim());
}

export default function TemplateModal({
  open,
  onClose,
  api,
  contactFirstName,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  api: InboxApi;
  contactFirstName: string;
  onSend: (selection: TemplateSelection) => void;
}) {
  const accountId = useAccountId();
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; templates: InboxTemplate[] }
  >({ kind: "loading" });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [header, setHeader] = useState<Record<string, string>>({});
  const [body, setBody] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSelectedKey(null);
    let cancelled = false;
    api
      .templates()
      .then((templates) => !cancelled && setState({ kind: "ready", templates }))
      .catch((err: Error) => !cancelled && setState({ kind: "error", message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [open, api, reloadKey]);

  const templates = useMemo(() => (state.kind === "ready" ? state.templates : []), [state]);
  const selected = templates.find((t) => keyOf(t) === selectedKey) ?? null;
  const showLanguage = useMemo(() => new Set(templates.map((t) => t.name)).size !== templates.length, [templates]);

  const send = (t: InboxTemplate, h: Record<string, string>, b: Record<string, string>) => {
    onSend({
      template: t,
      headerParams: t.headerVars.map((v) => h[v].trim()),
      bodyParams: t.bodyVars.map((v) => b[v].trim()),
      preview: render(t, h, b),
    });
  };

  // Un click: si todas las variables se pueden completar solas, se envía directo.
  const pick = (t: InboxTemplate) => {
    const filled = autofill(t, contactFirstName);
    if (isComplete(t, {}, filled)) {
      send(t, {}, filled);
      return;
    }
    setSelectedKey(keyOf(t));
    setHeader({});
    setBody(filled);
  };

  const inputClass =
    "mt-1.5 h-11 w-full rounded-field border border-crm-border bg-crm-surf px-3.5 text-[15px] text-crm-ink outline-none focus:border-crm-primary";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Elegí una plantilla"
      description={
        contactFirstName
          ? "Son mensajes aprobados por WhatsApp. El nombre se completa solo."
          : "Son mensajes aprobados por WhatsApp. Completá los datos que falten."
      }
    >
      {state.kind === "loading" && (
        <div className="flex flex-col gap-2.5" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-crm-surf" />
          ))}
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-2xl border border-crm-error-border bg-crm-error-bg p-4 text-sm text-crm-error-ink">
          No se pudieron cargar las plantillas. {state.message}
          <button
            onClick={() => {
              setState({ kind: "loading" });
              setReloadKey((k) => k + 1);
            }}
            className="ml-2 font-semibold underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {state.kind === "ready" && templates.length === 0 && (
        <div className="rounded-2xl bg-crm-surf p-5 text-sm text-crm-muted">
          Todavía no tenés plantillas aprobadas.{" "}
          <Link href={accountPath(accountId, "plantillas/nueva")} className="font-semibold text-crm-primary">
            Creá una desde Plantillas
          </Link>{" "}
          y esperá la aprobación de Meta.
        </div>
      )}

      {state.kind === "ready" && !selected && templates.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {templates.map((t) => (
            <button
              key={keyOf(t)}
              onClick={() => pick(t)}
              className="flex flex-col gap-[5px] rounded-2xl border border-crm-border bg-crm-surf px-4 py-3.5 text-left transition-colors hover:border-crm-primary"
            >
              <span className="text-xs font-bold text-crm-primary">
                {prettyTemplateName(t.name)}
                {showLanguage && <span className="font-semibold text-crm-muted"> · {t.language}</span>}
              </span>
              <span className="whitespace-pre-wrap text-sm leading-[1.45] text-crm-ink">
                {render(t, {}, autofill(t, contactFirstName))}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isComplete(selected, header, body)) send(selected, header, body);
          }}
          className="flex flex-col gap-4"
        >
          <button
            type="button"
            onClick={() => setSelectedKey(null)}
            className="self-start text-sm font-semibold text-crm-primary"
          >
            ← Elegir otra
          </button>
          <div className="grid gap-3 sm:grid-cols-2">
            {selected.headerVars.map((v, i) => (
              <label key={`h${v}`} className="text-sm font-semibold text-crm-ink">
                Dato {i + 1} del título
                <input
                  data-autofocus={i === 0 ? true : undefined}
                  value={header[v] ?? ""}
                  onChange={(e) => setHeader({ ...header, [v]: e.target.value })}
                  className={inputClass}
                />
              </label>
            ))}
            {selected.bodyVars.map((v) => (
              <label key={`b${v}`} className="text-sm font-semibold text-crm-ink">
                {v === "1" ? "Nombre" : `Dato ${v}`}
                <input
                  value={body[v] ?? ""}
                  onChange={(e) => setBody({ ...body, [v]: e.target.value })}
                  className={inputClass}
                />
              </label>
            ))}
          </div>
          <div className="whitespace-pre-wrap rounded-2xl bg-crm-surf px-4 py-3.5 text-sm leading-[1.45] text-crm-ink">
            {render(selected, header, body)}
          </div>
          <button
            type="submit"
            disabled={!isComplete(selected, header, body)}
            className="h-[46px] self-end rounded-pill bg-crm-primary px-6 font-poppins text-sm font-semibold text-white hover:bg-crm-primary-hover disabled:bg-crm-primary-soft"
          >
            Enviar plantilla
          </button>
        </form>
      )}
    </Modal>
  );
}
