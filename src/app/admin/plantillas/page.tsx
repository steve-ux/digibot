"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import StatusBadge from "@/components/admin/StatusBadge";
import TemplatePreviewModal from "@/components/admin/TemplatePreviewModal";
import type { WhatsAppTemplate } from "@/lib/meta-whatsapp";

type LoadState =
  | { kind: "loading" }
  | { kind: "not_configured"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; templates: WhatsAppTemplate[] };

function bodyPreview(template: WhatsAppTemplate) {
  const body = template.components.find((c) => c.type === "BODY");
  return body && "text" in body ? body.text : "—";
}

export default function PlantillasPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [search, setSearch] = useState("");
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<WhatsAppTemplate | null>(null);

  const load = async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();

      if (res.status === 503) {
        setState({ kind: "not_configured", message: data.message });
        return;
      }
      if (!res.ok) {
        setState({ kind: "error", message: data.message || "No se pudo cargar la lista de plantillas." });
        return;
      }
      setState({ kind: "ready", templates: data.templates });
    } catch {
      setState({ kind: "error", message: "No se pudo conectar con el servidor." });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (state.kind !== "ready") return [];
    if (!search.trim()) return state.templates;
    const q = search.trim().toLowerCase();
    return state.templates.filter((t) => t.name.toLowerCase().includes(q));
  }, [state, search]);

  const handleDelete = async (name: string) => {
    if (!confirm(`¿Eliminar la plantilla "${name}"? Esta acción no se puede deshacer.`)) return;
    setDeletingName(name);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "No se pudo eliminar la plantilla.");
        return;
      }
      await load();
    } finally {
      setDeletingName(null);
    }
  };

  return (
    <AdminShell breadcrumb="Plantillas de WhatsApp">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-poppins text-3xl font-extrabold tracking-tight text-foreground">
            Plantillas de WhatsApp
          </h1>
          <p className="mt-2 max-w-[640px] text-muted-foreground">
            Creá y administrá las plantillas de mensajes que tus bots usan para
            iniciar conversaciones por WhatsApp. Las plantillas nuevas se envían
            a Meta para su aprobación antes de poder usarse.
          </p>
        </div>
        <Link
          href="/admin/plantillas/nueva"
          className="rounded-full bg-primary px-6 py-3 font-poppins text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          + Crear nueva plantilla
        </Link>
      </div>

      {state.kind === "not_configured" && (
        <div className="mt-10 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-6">
          <div className="font-poppins font-semibold text-foreground">
            Todavía no conectaste una cuenta de WhatsApp Business
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Configurá <code className="rounded bg-muted px-1.5 py-0.5">WHATSAPP_WABA_ID</code> y{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">WHATSAPP_ACCESS_TOKEN</code> en las
            variables de entorno del servidor y recargá esta página.
          </p>
        </div>
      )}

      {state.kind === "error" && (
        <div className="mt-10 rounded-2xl border border-destructive/40 bg-destructive/10 p-6">
          <div className="font-poppins font-semibold text-destructive">
            No se pudo cargar la lista de plantillas
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
          <button
            onClick={load}
            className="mt-4 rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-primary hover:text-primary"
          >
            Reintentar
          </button>
        </div>
      )}

      {state.kind === "loading" && (
        <div className="mt-10 text-muted-foreground">Cargando plantillas…</div>
      )}

      {state.kind === "ready" && (
        <>
          <div className="mt-8 max-w-[420px]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar plantilla por nombre…"
              className="w-full rounded-full border border-border bg-card px-5 py-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">Nombre</th>
                  <th className="px-5 py-3 font-semibold">Idioma</th>
                  <th className="px-5 py-3 font-semibold">Categoría</th>
                  <th className="px-5 py-3 font-semibold">Contenido</th>
                  <th className="px-5 py-3 font-semibold">Estado</th>
                  <th className="px-5 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                      No hay plantillas para mostrar.
                    </td>
                  </tr>
                )}
                {filtered.map((template) => (
                  <tr key={template.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-4 font-medium text-foreground">{template.name}</td>
                    <td className="px-5 py-4 text-muted-foreground">{template.language}</td>
                    <td className="px-5 py-4 text-muted-foreground">{template.category}</td>
                    <td className="max-w-[320px] truncate px-5 py-4 text-muted-foreground">
                      {bodyPreview(template)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={template.status} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => setPreviewTemplate(template)}
                          aria-label={`Previsualizar ${template.name}`}
                          title="Previsualizar"
                          className="text-muted-foreground transition-colors hover:text-primary"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(template.name)}
                          disabled={deletingName === template.name}
                          className="text-sm font-medium text-destructive hover:opacity-80 disabled:opacity-50"
                        >
                          {deletingName === template.name ? "Eliminando…" : "Eliminar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
        />
      )}
    </AdminShell>
  );
}
