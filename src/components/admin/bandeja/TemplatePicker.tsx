"use client";

import { useEffect, useMemo, useState } from "react";
import { renderTemplateText, type InboxTemplate } from "@/lib/wa-inbox/types";

export interface TemplateSelection {
  template: InboxTemplate;
  headerParams: string[];
  bodyParams: string[];
  preview: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; templates: InboxTemplate[] };

// Se cachea por sesión: el picker se monta cada vez que se abre un chat con la ventana cerrada.
let cachedTemplates: InboxTemplate[] | null = null;

const templateKey = (t: InboxTemplate) => `${t.name}|${t.language}`;

export default function TemplatePicker({ onSend }: { onSend: (selection: TemplateSelection) => void }) {
  const [state, setState] = useState<LoadState>(
    cachedTemplates ? { kind: "ready", templates: cachedTemplates } : { kind: "loading" }
  );
  const [selectedKey, setSelectedKey] = useState("");
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({});
  const [bodyValues, setBodyValues] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/bandeja/plantillas");
        const data = await res.json();
        if (!res.ok) {
          if (!cachedTemplates) {
            setState({ kind: "error", message: data.message || "No se pudieron cargar las plantillas." });
          }
          return;
        }
        cachedTemplates = data.templates;
        setState({ kind: "ready", templates: data.templates });
      } catch {
        if (!cachedTemplates) setState({ kind: "error", message: "No se pudo conectar con el servidor." });
      }
    })();
  }, []);

  const template =
    state.kind === "ready" ? state.templates.find((t) => templateKey(t) === selectedKey) ?? null : null;

  const preview = useMemo(() => {
    if (!template) return "";
    const body = renderTemplateText(template.body, bodyValues);
    return template.header ? `${renderTemplateText(template.header, headerValues)}\n${body}` : body;
  }, [template, headerValues, bodyValues]);

  const canSend =
    template !== null &&
    template.headerVars.every((v) => headerValues[v]?.trim()) &&
    template.bodyVars.every((v) => bodyValues[v]?.trim());

  const submit = () => {
    if (!template || !canSend) return;
    onSend({
      template,
      headerParams: template.headerVars.map((v) => headerValues[v].trim()),
      bodyParams: template.bodyVars.map((v) => bodyValues[v].trim()),
      preview,
    });
    setSelectedKey("");
    setHeaderValues({});
    setBodyValues({});
  };

  const inputClass =
    "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

  return (
    <div className="border-t border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">
        Pasaron más de 24 h desde el último mensaje del cliente. Para retomar la
        conversación tenés que mandar una plantilla aprobada.
      </p>

      {state.kind === "loading" && <div aria-hidden className="mt-2 h-10 animate-pulse rounded-xl bg-muted" />}
      {state.kind === "error" && <p className="mt-2 text-sm text-destructive">{state.message}</p>}
      {state.kind === "ready" && state.templates.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          No tenés plantillas aprobadas. Creá una desde Plantillas de WhatsApp.
        </p>
      )}

      {state.kind === "ready" && state.templates.length > 0 && (
        <div className="mt-2 flex flex-col gap-3">
          <select
            value={selectedKey}
            onChange={(e) => {
              setSelectedKey(e.target.value);
              setHeaderValues({});
              setBodyValues({});
            }}
            className={inputClass}
          >
            <option value="">Elegí una plantilla…</option>
            {state.templates.map((t) => (
              <option key={templateKey(t)} value={templateKey(t)}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>

          {template && (
            <>
              {(template.headerVars.length > 0 || template.bodyVars.length > 0) && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {template.headerVars.map((v) => (
                    <label key={`h${v}`} className="text-xs font-medium text-foreground">
                      Encabezado {"{{" + v + "}}"}
                      <input
                        value={headerValues[v] || ""}
                        onChange={(e) => setHeaderValues({ ...headerValues, [v]: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                  ))}
                  {template.bodyVars.map((v) => (
                    <label key={`b${v}`} className="text-xs font-medium text-foreground">
                      Variable {"{{" + v + "}}"}
                      <input
                        value={bodyValues[v] || ""}
                        onChange={(e) => setBodyValues({ ...bodyValues, [v]: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 whitespace-pre-wrap rounded-xl bg-muted px-3 py-2 text-sm text-foreground">
                  {preview}
                </div>
                <button
                  onClick={submit}
                  disabled={!canSend}
                  className="rounded-full bg-primary px-5 py-2.5 font-poppins text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  Enviar plantilla
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
