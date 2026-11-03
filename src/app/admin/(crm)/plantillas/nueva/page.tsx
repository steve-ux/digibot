"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import type { TemplateButton, TemplateCategory, TemplateComponent } from "@/lib/meta-whatsapp";

const LANGUAGES = [
  { code: "es_AR", label: "Español (Argentina)" },
  { code: "es_MX", label: "Español (México)" },
  { code: "es", label: "Español" },
  { code: "en_US", label: "Inglés (EE.UU.)" },
  { code: "pt_BR", label: "Portugués (Brasil)" },
];

const CATEGORIES: { value: TemplateCategory; label: string; hint: string }[] = [
  { value: "UTILITY", label: "Utilidad", hint: "Actualizaciones sobre una acción del cliente (pedido, turno, etc.)" },
  { value: "MARKETING", label: "Marketing", hint: "Promociones, novedades o invitaciones a interactuar." },
  { value: "AUTHENTICATION", label: "Autenticación", hint: "Códigos de un solo uso para verificar identidad." },
];

type ButtonDraft = { type: "QUICK_REPLY" | "URL"; text: string; url: string };

function extractVariables(body: string) {
  const matches = body.match(/{{\s*\d+\s*}}/g) ?? [];
  const unique = Array.from(new Set(matches.map((m) => m.replace(/\D/g, ""))));
  return unique.sort((a, b) => Number(a) - Number(b));
}

export default function NuevaPlantillaPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [language, setLanguage] = useState("es_AR");
  const [category, setCategory] = useState<TemplateCategory>("UTILITY");
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<ButtonDraft[]>([]);
  const [examples, setExamples] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const variables = useMemo(() => extractVariables(body), [body]);

  const addButton = () => {
    if (buttons.length >= 3) return;
    setButtons([...buttons, { type: "QUICK_REPLY", text: "", url: "" }]);
  };

  const updateButton = (index: number, patch: Partial<ButtonDraft>) => {
    setButtons(buttons.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const buildComponents = (): TemplateComponent[] => {
    const components: TemplateComponent[] = [];

    if (header.trim()) {
      components.push({ type: "HEADER", format: "TEXT", text: header.trim() });
    }

    const bodyComponent: TemplateComponent = { type: "BODY", text: body.trim() };
    if (variables.length > 0) {
      bodyComponent.example = { body_text: [variables.map((v) => examples[v] || `ejemplo${v}`)] };
    }
    components.push(bodyComponent);

    if (footer.trim()) {
      components.push({ type: "FOOTER", text: footer.trim() });
    }

    if (buttons.length > 0) {
      const builtButtons: TemplateButton[] = buttons.map((b) =>
        b.type === "URL"
          ? { type: "URL", text: b.text.trim(), url: b.url.trim() }
          : { type: "QUICK_REPLY", text: b.text.trim() }
      );
      components.push({ type: "BUTTONS", buttons: builtButtons });
    }

    return components;
  };

  const isValidName = /^[a-z0-9_]+$/.test(name);
  const canSubmit = isValidName && body.trim().length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          language,
          category,
          components: buildComponents(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "No se pudo crear la plantilla.");
        return;
      }

      router.push("/admin/plantillas");
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderPreviewText = (text: string) =>
    text.replace(/{{\s*(\d+)\s*}}/g, (_, n) => examples[n] || `{{${n}}}`);

  return (
    <AdminShell breadcrumb="Nueva plantilla">
      <div className="mb-6">
        <h1 className="font-poppins text-3xl font-extrabold tracking-tight text-foreground">
          Crear nueva plantilla
        </h1>
        <p className="mt-2 text-muted-foreground">
          Se enviará a Meta para su aprobación. Puede tardar desde minutos hasta
          24 horas.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <label className="block text-sm font-medium text-foreground">
              Nombre de la plantilla *
              <input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                placeholder="bienvenida_cliente"
                className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
              />
            </label>
            {name.length > 0 && !isValidName && (
              <p className="mt-2 text-sm text-destructive">
                Solo minúsculas, números y guion bajo. Sin espacios.
              </p>
            )}

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium text-foreground">
                Idioma *
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-foreground">
                Categoría *
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {CATEGORIES.find((c) => c.value === category)?.hint}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-poppins font-semibold text-foreground">Contenido del mensaje</h2>

            <label className="mt-4 block text-sm font-medium text-foreground">
              Encabezado (opcional)
              <input
                value={header}
                onChange={(e) => setHeader(e.target.value)}
                placeholder="Ej: Confirmación de tu turno"
                className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
              />
            </label>

            <label className="mt-5 block text-sm font-medium text-foreground">
              Cuerpo del mensaje *
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder={"Hola {{1}}, tu pedido de {{2}} ya está confirmado."}
                className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
              />
              <span className="mt-1.5 block text-xs text-muted-foreground">
                Usá <code className="rounded bg-muted px-1">{"{{1}}"}</code>,{" "}
                <code className="rounded bg-muted px-1">{"{{2}}"}</code>, etc. para variables
                dinámicas.
              </span>
            </label>

            {variables.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {variables.map((v) => (
                  <label key={v} className="block text-sm font-medium text-foreground">
                    Ejemplo para {"{{" + v + "}}"}
                    <input
                      value={examples[v] || ""}
                      onChange={(e) => setExamples({ ...examples, [v]: e.target.value })}
                      placeholder={`Valor de ejemplo`}
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </label>
                ))}
              </div>
            )}

            <label className="mt-5 block text-sm font-medium text-foreground">
              Pie de página (opcional)
              <input
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                placeholder="Ej: DigiBot LATAM"
                className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-poppins font-semibold text-foreground">Botones (opcional)</h2>
              {buttons.length < 3 && (
                <button
                  type="button"
                  onClick={addButton}
                  className="text-sm font-semibold text-primary hover:opacity-80"
                >
                  + Agregar botón
                </button>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-4">
              {buttons.map((b, i) => (
                <div key={i} className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4">
                  <label className="text-sm font-medium text-foreground">
                    Tipo
                    <select
                      value={b.type}
                      onChange={(e) => updateButton(i, { type: e.target.value as ButtonDraft["type"] })}
                      className="mt-1.5 block rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="QUICK_REPLY">Respuesta rápida</option>
                      <option value="URL">Ir a sitio web</option>
                    </select>
                  </label>
                  <label className="flex-1 min-w-[160px] text-sm font-medium text-foreground">
                    Texto del botón
                    <input
                      value={b.text}
                      onChange={(e) => updateButton(i, { text: e.target.value })}
                      className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </label>
                  {b.type === "URL" && (
                    <label className="flex-1 min-w-[200px] text-sm font-medium text-foreground">
                      URL
                      <input
                        value={b.url}
                        onChange={(e) => updateButton(i, { url: e.target.value })}
                        placeholder="https://digibotlatam.com"
                        className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => removeButton(i)}
                    className="text-sm font-medium text-destructive hover:opacity-80"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-full bg-primary px-7 py-3.5 font-poppins text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? "Enviando a Meta…" : "Enviar para aprobación"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/plantillas")}
              className="rounded-full border border-border px-7 py-3.5 font-poppins text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
            >
              Cancelar
            </button>
          </div>
        </div>

        <div>
          <div className="sticky top-24 rounded-[28px] border border-border bg-card p-5 shadow-[0_30px_70px_-30px_rgba(28,28,28,0.25)]">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-poppins text-[15px] font-bold text-white">
                D
              </div>
              <div>
                <div className="font-poppins text-[15px] font-semibold text-foreground">
                  DigiBot
                </div>
                <div className="text-xs font-semibold text-green-600">en línea</div>
              </div>
            </div>

            <div className="chat-pattern mt-4 flex flex-col gap-2 rounded-2xl p-4">
              <div className="max-w-[92%] rounded-2xl rounded-bl-[4px] bg-card p-3.5 text-[14px] leading-relaxed text-foreground shadow-sm">
                {header.trim() && (
                  <div className="mb-1.5 font-poppins font-bold text-foreground">{header}</div>
                )}
                <div className="whitespace-pre-wrap">
                  {body.trim() ? renderPreviewText(body) : "El texto de tu mensaje aparecerá acá…"}
                </div>
                {footer.trim() && (
                  <div className="mt-1.5 text-xs text-muted-foreground">{footer}</div>
                )}
                {buttons.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-2.5">
                    {buttons.map((b, i) => (
                      <div
                        key={i}
                        className="rounded-lg py-1.5 text-center text-[13px] font-semibold text-primary"
                      >
                        {b.text || "Botón"}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
    </AdminShell>
  );
}
