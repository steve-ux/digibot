"use client";

import { useEffect, useMemo, useState } from "react";
import { getDemoInboxStore } from "@/components/admin/bandeja/demo-api";
import { useCrmShell } from "@/components/crm/CrmShell";
import { getDemoSettings } from "@/components/crm/demo-settings";
import Icon, { type IconName } from "@/components/crm/Icon";
import { ProfilePanel, SoundsPanel, SupportPanel } from "./PersonalPanels";
import { Modal } from "@/components/crm/Modal";
import PageHeader, { PageBody } from "@/components/crm/PageHeader";
import { useToast } from "@/components/crm/Toast";
import {
  ATTRIBUTE_TYPE_LABELS,
  ATTRIBUTE_TYPES,
  keyFromLabel,
  type AttributeType,
  type CustomAttribute,
} from "@/lib/crm/attributes";
import { LABEL_COLOR_IDS, LABEL_COLORS, labelColor, type Label, type LabelColor } from "@/lib/crm/labels";
import { accountApi } from "@/lib/crm/permissions";
import * as settingsLogic from "@/lib/crm/settings";

export type SettingsLoadState =
  | { kind: "ready"; labels: Label[]; attributes: CustomAttribute[] }
  | { kind: "error"; message: string };

export type Tab = "perfil" | "sonidos" | "etiquetas" | "atributos" | "soporte";
type FieldErrors = Record<string, string | undefined>;

// Operaciones de Configuración: contra la API, o en memoria en el modo demo.
interface SettingsClient {
  createLabel(body: object): Promise<Label>;
  updateLabel(id: number, body: object): Promise<Label>;
  deleteLabel(id: number): Promise<void>;
  createAttribute(body: object): Promise<CustomAttribute>;
  updateAttribute(id: number, body: object): Promise<CustomAttribute>;
  deleteAttribute(id: number): Promise<void>;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  } catch {
    throw Object.assign(new Error("No se pudo conectar con el servidor."), { fields: {} });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || "Algo salió mal."), { fields: data.fields ?? {} });
  return data as T;
}

function realClient(accountId: number): SettingsClient {
  const url = (path: string) => accountApi(accountId, path);
  const json = (method: string, body?: object) => ({ method, body: body ? JSON.stringify(body) : undefined });
  return {
    createLabel: async (body) => (await call<{ label: Label }>(url("etiquetas"), json("POST", body))).label,
    updateLabel: async (id, body) => (await call<{ label: Label }>(url(`etiquetas/${id}`), json("PATCH", body))).label,
    deleteLabel: async (id) => void (await call(url(`etiquetas/${id}`), json("DELETE"))),
    createAttribute: async (body) =>
      (await call<{ attribute: CustomAttribute }>(url("atributos"), json("POST", body))).attribute,
    updateAttribute: async (id, body) =>
      (await call<{ attribute: CustomAttribute }>(url(`atributos/${id}`), json("PATCH", body))).attribute,
    deleteAttribute: async (id) => void (await call(url(`atributos/${id}`), json("DELETE"))),
  };
}

function demoClient(accountId: number, me: { id: number; name: string }): SettingsClient {
  const deps = async () => ({ repo: await getDemoSettings(accountId), store: getDemoInboxStore(me, accountId) });
  return {
    createLabel: async (body) => settingsLogic.createLabel(await deps(), accountId, body),
    updateLabel: async (id, body) => settingsLogic.updateLabel(await deps(), accountId, id, body),
    deleteLabel: async (id) => settingsLogic.deleteLabel(await deps(), accountId, id),
    createAttribute: async (body) => settingsLogic.createAttribute(await deps(), accountId, body),
    updateAttribute: async (id, body) => settingsLogic.updateAttribute(await deps(), accountId, id, body),
    deleteAttribute: async (id) => settingsLogic.deleteAttribute(await deps(), accountId, id),
  };
}

export default function ConfiguracionView(props: {
  account: { id: number; name: string };
  initialState: SettingsLoadState;
  initialTab: Tab;
  // Etiquetas y atributos: solo quien administra la cuenta
  canManage: boolean;
}) {
  const { demo } = useCrmShell();
  return <Configuracion key={demo ? "demo" : "real"} {...props} demo={demo} />;
}

function Configuracion({
  account,
  initialState,
  initialTab,
  canManage,
  demo,
}: {
  account: { id: number; name: string };
  initialState: SettingsLoadState;
  initialTab: Tab;
  canManage: boolean;
  demo: boolean;
}) {
  const { user } = useCrmShell();
  const toast = useToast();
  const client = useMemo(
    () => (demo ? demoClient(account.id, { id: user.id, name: user.name }) : realClient(account.id)),
    [demo, account.id, user.id, user.name]
  );
  const [tab, setTab] = useState<Tab>(initialTab);
  const [labels, setLabels] = useState<Label[]>(initialState.kind === "ready" && !demo ? initialState.labels : []);
  const [attributes, setAttributes] = useState<CustomAttribute[]>(
    initialState.kind === "ready" && !demo ? initialState.attributes : []
  );
  const [loading, setLoading] = useState(demo && canManage);

  useEffect(() => {
    if (!demo || !canManage) return;
    getDemoSettings(account.id).then(async (repo) => {
      setLabels(await repo.listLabels(account.id));
      setAttributes(await repo.listAttributes(account.id));
      setLoading(false);
    });
  }, [demo, canManage, account.id]);

  const tabs: { id: Tab; label: string; icon: IconName; count?: number }[] = [
    { id: "perfil", label: "Mi perfil", icon: "user" },
    { id: "sonidos", label: "Sonidos", icon: "bell" },
    ...(canManage
      ? [
          { id: "etiquetas" as const, label: "Etiquetas", icon: "tag" as const, count: labels.length },
          { id: "atributos" as const, label: "Atributos", icon: "panel" as const, count: attributes.length },
        ]
      : []),
    { id: "soporte", label: "Soporte", icon: "info" },
  ];

  const changeTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copiado`);
    } catch {
      toast("No se pudo copiar", "error");
    }
  };

  const error = !demo && initialState.kind === "error" ? initialState.message : null;
  const adminTab = tab === "etiquetas" || tab === "atributos";

  return (
    <PageBody maxWidth={980}>
      <PageHeader
        title="Configuración"
        description={
          canManage
            ? "Tu perfil y tus sonidos, y las etiquetas y datos propios que tu equipo usa en cada conversación."
            : "Tu foto de perfil, los sonidos de mensajes nuevos y los datos para soporte."
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-card border border-crm-border bg-crm-card px-5 py-4">
        <Icon name="building" size={22} className="text-crm-primary" />
        <div className="min-w-[180px] flex-1">
          <div className="text-[15px] font-semibold text-crm-ink">{account.name}</div>
          <div className="text-[13px] text-crm-muted">
            ID de la cuenta: <strong className="text-crm-ink-2">{account.id}</strong> · lo usan el bot y las integraciones
          </div>
        </div>
        <button
          onClick={() => copy(String(account.id), "ID de la cuenta")}
          className="flex h-10 items-center gap-2 rounded-pill border border-crm-border bg-crm-chip px-4 text-[13px] font-semibold text-crm-ink-2 hover:border-crm-primary hover:text-crm-primary"
        >
          <Icon name="copy" size={16} />
          Copiar ID
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Secciones de configuración"
        // La línea de abajo va como sombra interna (no border + -mb-px en cada pestaña):
        // así el scroll horizontal del celular no genera 1px de scroll vertical.
        className="flex gap-1.5 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--crm-border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map(({ id, label, icon, count }) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => changeTab(id)}
            className={`flex min-h-[46px] shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-[15px] font-semibold transition-colors ${
              tab === id ? "border-crm-primary text-crm-primary" : "border-transparent text-crm-muted hover:text-crm-ink"
            }`}
          >
            <Icon name={icon} size={18} />
            {label}
            {count !== undefined && (
              <span className="rounded-pill bg-crm-surf px-2 py-px text-xs text-crm-muted">{count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "perfil" && (
        <div role="tabpanel" id="panel-perfil" aria-labelledby="tab-perfil">
          <ProfilePanel />
        </div>
      )}
      {tab === "sonidos" && (
        <div role="tabpanel" id="panel-sonidos" aria-labelledby="tab-sonidos">
          <SoundsPanel />
        </div>
      )}
      {tab === "soporte" && (
        <div role="tabpanel" id="panel-soporte" aria-labelledby="tab-soporte">
          <SupportPanel account={account} />
        </div>
      )}

      {adminTab && error && (
        <div className="rounded-card border border-crm-error-border bg-crm-error-bg px-5 py-4 text-sm text-crm-error-ink">{error}</div>
      )}

      {!adminTab ? null : loading ? (
        <div aria-hidden className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-card bg-crm-surf" />
          ))}
        </div>
      ) : tab === "etiquetas" ? (
        <div role="tabpanel" id="panel-etiquetas" aria-labelledby="tab-etiquetas">
          <LabelsPanel labels={labels} setLabels={setLabels} client={client} disabled={Boolean(error)} />
        </div>
      ) : (
        <div role="tabpanel" id="panel-atributos" aria-labelledby="tab-atributos">
          <AttributesPanel
            attributes={attributes}
            setAttributes={setAttributes}
            client={client}
            disabled={Boolean(error)}
            onCopyKey={(key) => copy(key, "Clave")}
          />
        </div>
      )}
    </PageBody>
  );
}

// ---------- Piezas comunes ----------

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-[46px] items-center gap-2 rounded-pill bg-crm-primary px-[22px] font-poppins text-[15px] font-semibold text-white transition-colors hover:bg-crm-primary-hover disabled:bg-crm-primary-soft"
    >
      <Icon name="plus" size={18} />
      {children}
    </button>
  );
}

function RowButton({ children, onClick, danger, label }: { children: React.ReactNode; onClick: () => void; danger?: boolean; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex h-9 min-w-[36px] items-center justify-center rounded-pill border border-crm-border bg-crm-chip px-3 text-[13px] font-semibold transition-colors ${
        danger ? "text-crm-muted hover:border-crm-error hover:text-crm-error" : "text-crm-ink-2 hover:border-crm-primary hover:text-crm-primary"
      }`}
    >
      {children}
    </button>
  );
}

function inputClass(invalid: boolean) {
  return `h-[46px] w-full rounded-field border bg-crm-surf px-3.5 text-[15px] text-crm-ink outline-none placeholder:text-crm-subtle focus:border-crm-primary disabled:opacity-60 ${
    invalid ? "border-crm-error" : "border-crm-border"
  }`;
}

function Field({ label, hint, error, id, children }: { label: string; hint?: string; error?: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-crm-ink">
        {label}
      </label>
      {children}
      {error ? (
        <span className="text-[13px] text-crm-error">{error}</span>
      ) : (
        hint && <span className="text-[13px] text-crm-muted">{hint}</span>
      )}
    </div>
  );
}

function ModalFooter({ onCancel, onSave, saving, saveLabel, danger }: { onCancel: () => void; onSave: () => void; saving: boolean; saveLabel: string; danger?: boolean }) {
  return (
    <div className="flex flex-wrap justify-end gap-2.5">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="h-[46px] rounded-pill border border-crm-border-2 bg-crm-chip px-[22px] font-poppins text-sm font-semibold text-crm-ink"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className={`h-[46px] rounded-pill px-6 font-poppins text-sm font-semibold text-white disabled:opacity-60 ${
          danger ? "bg-crm-error" : "bg-crm-primary hover:bg-crm-primary-hover"
        }`}
      >
        {saving ? "Guardando…" : saveLabel}
      </button>
    </div>
  );
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="m-0 rounded-field bg-crm-error-bg px-3 py-2 text-sm text-crm-error-ink">
      {message}
    </p>
  );
}

function useSaver() {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setErrors({});
    try {
      await fn();
      return true;
    } catch (err) {
      const e = err as Error & { fields?: FieldErrors };
      setErrors(e.fields && Object.keys(e.fields).length ? e.fields : { form: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { saving, errors, setErrors, run };
}

// ---------- Etiquetas ----------

type LabelForm = { id: number | null; name: string; color: LabelColor; description: string };

function LabelsPanel({
  labels,
  setLabels,
  client,
  disabled,
}: {
  labels: Label[];
  setLabels: React.Dispatch<React.SetStateAction<Label[]>>;
  client: SettingsClient;
  disabled: boolean;
}) {
  const toast = useToast();
  const [form, setForm] = useState<LabelForm | null>(null);
  const [toDelete, setToDelete] = useState<Label | null>(null);
  const { saving, errors, setErrors, run } = useSaver();
  const sorted = [...labels].sort((a, b) => a.name.localeCompare(b.name, "es"));

  const open = (l?: Label) => {
    setErrors({});
    setForm(l ? { id: l.id, name: l.name, color: l.color, description: l.description ?? "" } : { id: null, name: "", color: "blue", description: "" });
  };

  const save = () =>
    form &&
    run(async () => {
      if (!form.name.trim()) throw Object.assign(new Error(""), { fields: { name: "Escribí el nombre de la etiqueta." } });
      const body = { name: form.name, color: form.color, description: form.description };
      if (form.id) {
        const saved = await client.updateLabel(form.id, body);
        setLabels((prev) => prev.map((l) => (l.id === saved.id ? saved : l)));
        toast("Etiqueta guardada");
      } else {
        const saved = await client.createLabel(body);
        setLabels((prev) => [...prev, saved]);
        toast("Etiqueta creada");
      }
      setForm(null);
    });

  const remove = () =>
    toDelete &&
    run(async () => {
      await client.deleteLabel(toDelete.id);
      setLabels((prev) => prev.filter((l) => l.id !== toDelete.id));
      toast("Etiqueta borrada");
      setToDelete(null);
    });

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 min-w-[240px] flex-1 text-sm text-crm-muted">
          Sirven para ordenar las conversaciones (venta, reclamo, turno…). El bot las recibe por nombre.
        </p>
        <PrimaryButton onClick={() => open()} disabled={disabled}>
          Nueva etiqueta
        </PrimaryButton>
      </div>

      <div className="rounded-card border border-crm-border bg-crm-card px-4 py-1.5 md:px-[22px]">
        {sorted.length === 0 && (
          <div className="py-10 text-center text-sm text-crm-muted">Todavía no hay etiquetas. Creá la primera.</div>
        )}
        {sorted.map((l, i) => (
          <div key={l.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 ${i ? "border-t border-crm-border" : ""}`}>
            <div className="flex min-w-0 flex-[1_1_220px] items-center gap-3">
              <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: labelColor(l.color) }} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-crm-ink">{l.name}</div>
                {l.description && <div className="truncate text-[13px] text-crm-muted">{l.description}</div>}
              </div>
            </div>
            <span className="sr-only">Color {LABEL_COLORS[l.color].name}</span>
            <div className="ml-auto flex gap-2">
              <RowButton onClick={() => open(l)}>Editar</RowButton>
              <RowButton onClick={() => setToDelete(l)} danger label={`Borrar ${l.name}`}>
                <Icon name="trash" size={16} />
              </RowButton>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={form !== null}
        onClose={() => !saving && setForm(null)}
        title={form?.id ? "Editar etiqueta" : "Nueva etiqueta"}
        maxWidth={500}
        footer={form && <ModalFooter onCancel={() => setForm(null)} onSave={save} saving={saving} saveLabel={form.id ? "Guardar" : "Crear etiqueta"} />}
      >
        {form && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="flex flex-col gap-5"
          >
            <Field label="Nombre" id="label-name" error={errors.name} hint={form.id ? "Si la renombrás, se actualiza en todas las conversaciones." : undefined}>
              <input
                id="label-name"
                data-autofocus
                maxLength={40}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. Presupuesto enviado"
                aria-invalid={Boolean(errors.name)}
                className={inputClass(Boolean(errors.name))}
              />
            </Field>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 text-sm font-semibold text-crm-ink">Color</legend>
              <div role="radiogroup" className="flex flex-wrap gap-2">
                {LABEL_COLOR_IDS.map((c) => {
                  const on = form.color === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={LABEL_COLORS[c].name}
                      title={LABEL_COLORS[c].name}
                      onClick={() => setForm({ ...form, color: c })}
                      className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors ${
                        on ? "border-crm-ink" : "border-transparent hover:border-crm-border-2"
                      }`}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: LABEL_COLORS[c].hex }}>
                        {on && <Icon name="check" size={16} className="text-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <Field label="Descripción (opcional)" id="label-description" error={errors.description} hint="Para que el equipo sepa cuándo usarla.">
              <input
                id="label-description"
                maxLength={191}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ej. Ya le mandamos el presupuesto por WhatsApp"
                className={inputClass(Boolean(errors.description))}
              />
            </Field>
            <FormError message={errors.form || errors.color} />
            <button type="submit" hidden />
          </form>
        )}
      </Modal>

      <Modal
        open={toDelete !== null}
        onClose={() => !saving && setToDelete(null)}
        title={`¿Borrar "${toDelete?.name ?? ""}"?`}
        description="Se saca de todas las conversaciones que la tengan. No se puede deshacer."
        maxWidth={460}
        footer={<ModalFooter onCancel={() => setToDelete(null)} onSave={remove} saving={saving} saveLabel="Borrar etiqueta" danger />}
      >
        <FormError message={errors.form} />
      </Modal>
    </div>
  );
}

// ---------- Atributos ----------

type AttributeForm = {
  id: number | null;
  label: string;
  key: string;
  // La clave se arma sola desde el nombre hasta que la persona la toca
  keyTouched: boolean;
  type: AttributeType;
  options: string;
  description: string;
};

function AttributesPanel({
  attributes,
  setAttributes,
  client,
  disabled,
  onCopyKey,
}: {
  attributes: CustomAttribute[];
  setAttributes: React.Dispatch<React.SetStateAction<CustomAttribute[]>>;
  client: SettingsClient;
  disabled: boolean;
  onCopyKey: (key: string) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<AttributeForm | null>(null);
  const [toDelete, setToDelete] = useState<CustomAttribute | null>(null);
  const { saving, errors, setErrors, run } = useSaver();

  const open = (a?: CustomAttribute) => {
    setErrors({});
    setForm(
      a
        ? { id: a.id, label: a.label, key: a.key, keyTouched: true, type: a.type, options: a.options.join("\n"), description: a.description ?? "" }
        : { id: null, label: "", key: "", keyTouched: false, type: "text", options: "", description: "" }
    );
  };

  const save = () =>
    form &&
    run(async () => {
      const options = form.options.split("\n").map((o) => o.trim()).filter(Boolean);
      if (form.id) {
        const saved = await client.updateAttribute(form.id, {
          label: form.label,
          description: form.description,
          ...(form.type === "list" ? { options } : {}),
        });
        setAttributes((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
        toast("Atributo guardado");
      } else {
        const saved = await client.createAttribute({
          label: form.label,
          key: form.key,
          type: form.type,
          options,
          description: form.description,
        });
        setAttributes((prev) => [...prev, saved]);
        toast("Atributo creado");
      }
      setForm(null);
    });

  const remove = () =>
    toDelete &&
    run(async () => {
      await client.deleteAttribute(toDelete.id);
      setAttributes((prev) => prev.filter((a) => a.id !== toDelete.id));
      toast("Atributo borrado");
      setToDelete(null);
    });

  // Ejemplo de lo que recibe el bot (con las claves reales de la cuenta).
  const example = JSON.stringify(
    {
      account_id: "…",
      conversation_id: "…",
      labels: ["Venta"],
      attributes: Object.fromEntries(
        attributes.slice(0, 4).map((a) => [a.key, a.type === "checkbox" ? true : a.type === "number" ? 0 : a.type === "list" ? a.options[0] ?? "" : "…"])
      ),
    },
    null,
    2
  );

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 min-w-[240px] flex-1 text-sm text-crm-muted">
          Datos propios de tu negocio que se completan en cada conversación: DNI, obra social, modelo, fecha de compra…
        </p>
        <PrimaryButton onClick={() => open()} disabled={disabled}>
          Nuevo atributo
        </PrimaryButton>
      </div>

      <div className="rounded-card border border-crm-border bg-crm-card px-4 py-1.5 md:px-[22px]">
        {attributes.length === 0 && (
          <div className="py-10 text-center text-sm text-crm-muted">Todavía no hay atributos. Creá el primero.</div>
        )}
        {attributes.map((a, i) => (
          <div key={a.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 ${i ? "border-t border-crm-border" : ""}`}>
            <div className="min-w-0 flex-[1_1_220px]">
              <div className="truncate text-[15px] font-semibold text-crm-ink">{a.label}</div>
              <button
                onClick={() => onCopyKey(a.key)}
                title="Copiar la clave"
                className="mt-0.5 flex max-w-full items-center gap-1 rounded font-mono text-[12.5px] text-crm-muted hover:text-crm-primary"
              >
                <span className="truncate">{a.key}</span>
                <Icon name="copy" size={13} />
              </button>
            </div>
            <span className="shrink-0 rounded-pill border border-crm-tint-border bg-crm-tint px-3 py-[5px] text-[13px] font-semibold text-crm-primary">
              {ATTRIBUTE_TYPE_LABELS[a.type]}
            </span>
            {a.type === "list" && (
              <span className="min-w-0 max-w-full shrink truncate text-[13px] text-crm-muted md:max-w-[220px]" title={a.options.join(", ")}>
                {a.options.join(" · ")}
              </span>
            )}
            <div className="ml-auto flex gap-2">
              <RowButton onClick={() => open(a)}>Editar</RowButton>
              <RowButton onClick={() => setToDelete(a)} danger label={`Borrar ${a.label}`}>
                <Icon name="trash" size={16} />
              </RowButton>
            </div>
          </div>
        ))}
      </div>

      {attributes.length > 0 && (
        <details className="rounded-card border border-crm-border bg-crm-card px-5 py-4 text-sm">
          <summary className="cursor-pointer font-semibold text-crm-ink">Cómo lo recibe el bot</summary>
          <p className="mb-2 mt-2 text-crm-muted">
            Cada conversación viaja con el ID de la cuenta, su propio ID, las etiquetas y los atributos con estas claves:
          </p>
          <pre className="crm-scroll m-0 overflow-x-auto rounded-field bg-crm-surf p-3 font-mono text-[12.5px] leading-[1.5] text-crm-ink">
            {example}
          </pre>
        </details>
      )}

      <Modal
        open={form !== null}
        onClose={() => !saving && setForm(null)}
        title={form?.id ? "Editar atributo" : "Nuevo atributo"}
        maxWidth={560}
        footer={form && <ModalFooter onCancel={() => setForm(null)} onSave={save} saving={saving} saveLabel={form.id ? "Guardar" : "Crear atributo"} />}
      >
        {form && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="flex flex-col gap-5"
          >
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              <Field label="Nombre" id="attr-label" error={errors.label}>
                <input
                  id="attr-label"
                  data-autofocus
                  maxLength={80}
                  value={form.label}
                  onChange={(e) =>
                    setForm({ ...form, label: e.target.value, key: form.keyTouched ? form.key : keyFromLabel(e.target.value) })
                  }
                  placeholder="Ej. Obra social"
                  aria-invalid={Boolean(errors.label)}
                  className={inputClass(Boolean(errors.label))}
                />
              </Field>
              <Field
                label="Clave para el bot"
                id="attr-key"
                error={errors.key}
                hint={form.id ? "La clave no cambia: el bot puede estar usándola." : "Minúsculas y guion bajo."}
              >
                <input
                  id="attr-key"
                  maxLength={64}
                  value={form.key}
                  disabled={Boolean(form.id)}
                  onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"), keyTouched: true })}
                  placeholder="obra_social"
                  aria-invalid={Boolean(errors.key)}
                  className={`${inputClass(Boolean(errors.key))} font-mono text-sm`}
                />
              </Field>
            </div>

            <Field label="Tipo de dato" id="attr-type" error={errors.type} hint={ATTRIBUTE_TYPES.find((t) => t.id === form.type)?.hint}>
              <select
                id="attr-type"
                value={form.type}
                disabled={Boolean(form.id)}
                onChange={(e) => setForm({ ...form, type: e.target.value as AttributeType })}
                className={`${inputClass(Boolean(errors.type))} cursor-pointer`}
              >
                {ATTRIBUTE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>

            {form.type === "list" && (
              <Field label="Opciones" id="attr-options" error={errors.options} hint="Una por línea.">
                <textarea
                  id="attr-options"
                  rows={4}
                  value={form.options}
                  onChange={(e) => setForm({ ...form, options: e.target.value })}
                  placeholder={"OSDE\nSwiss Medical\nParticular"}
                  className={`${inputClass(Boolean(errors.options))} h-auto py-3 leading-[1.5]`}
                />
              </Field>
            )}

            <Field label="Descripción (opcional)" id="attr-description" error={errors.description}>
              <input
                id="attr-description"
                maxLength={191}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ej. La que figura en la credencial"
                className={inputClass(Boolean(errors.description))}
              />
            </Field>
            <FormError message={errors.form} />
            <button type="submit" hidden />
          </form>
        )}
      </Modal>

      <Modal
        open={toDelete !== null}
        onClose={() => !saving && setToDelete(null)}
        title={`¿Borrar "${toDelete?.label ?? ""}"?`}
        description="Se borra el valor que tenga en todas las conversaciones. No se puede deshacer."
        maxWidth={460}
        footer={<ModalFooter onCancel={() => setToDelete(null)} onSave={remove} saving={saving} saveLabel="Borrar atributo" danger />}
      >
        <FormError message={errors.form} />
      </Modal>
    </div>
  );
}
