"use client";

import { useMemo, useState } from "react";
import { useAccountId, useCrmShell } from "@/components/crm/CrmShell";
import Icon from "@/components/crm/Icon";
import { Modal } from "@/components/crm/Modal";
import PageHeader, { PageBody } from "@/components/crm/PageHeader";
import { useToast } from "@/components/crm/Toast";
import { avatarColor, CHANNEL_IDS, CHANNELS, initialsOf, type ChannelId } from "@/lib/crm/channels";
import { demoUsers } from "@/lib/crm/demo-data";
import { accountApi, ROLE_LABELS, ROLES, type AccountRole, type CrmRole } from "@/lib/crm/permissions";
import type { TeamUser } from "@/lib/crm/team";

export type EquipoLoadState =
  | { kind: "ready"; users: TeamUser[] }
  | { kind: "error"; message: string };

type Form = {
  id: number | null;
  name: string;
  email: string;
  role: CrmRole;
  channels: ChannelId[];
  status: TeamUser["status"] | null;
};
type FieldErrors = Partial<Record<"name" | "email" | "channels" | "form", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(f: Form): FieldErrors {
  const e: FieldErrors = {};
  if (f.name.trim().length < 2) e.name = "Escribí el nombre (al menos 2 letras).";
  if (!EMAIL_RE.test(f.email.trim())) e.email = "Revisá el email.";
  if (f.role === "agent" && f.channels.length === 0) e.channels = "Elegí al menos un canal.";
  return e;
}

const STATUS: Record<TeamUser["status"], { label: string; cls: string }> = {
  active: { label: "Activo", cls: "text-crm-success-ink" },
  invited: { label: "Invitación enviada", cls: "text-crm-warn" },
  disabled: { label: "Sin acceso", cls: "text-crm-muted" },
};

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

export default function EquipoView({
  initialState,
  meId,
  bootstrap,
  assignable,
}: {
  initialState: EquipoLoadState;
  meId: number;
  bootstrap: boolean;
  // Roles que esta persona puede dar (solo un superadmin da "Administrador")
  assignable: AccountRole[];
}) {
  const { demo, user } = useCrmShell();
  return (
    <Equipo
      key={demo ? "demo" : "real"}
      demo={demo}
      initialState={
        demo
          ? {
              kind: "ready",
              users: demoUsers(user.name).map((u) => ({ ...u, accountId: 1, inviteExpiresAt: null, lastLoginAt: null })),
            }
          : initialState
      }
      meId={demo ? 1 : meId}
      bootstrap={!demo && bootstrap}
      assignable={demo ? ["admin", "supervisor", "agent"] : assignable}
    />
  );
}

function Equipo({
  demo,
  initialState,
  meId,
  bootstrap,
  assignable,
}: {
  demo: boolean;
  initialState: EquipoLoadState;
  meId: number;
  bootstrap: boolean;
  assignable: AccountRole[];
}) {
  const toast = useToast();
  const accountId = useAccountId();
  const api = (path = "") => accountApi(accountId, `equipo${path}`);
  // Se puede editar a quien tenga un rol que uno puede dar (y a uno mismo, salvo el rol).
  const canManage = (u: TeamUser) => u.id === meId || assignable.includes(u.role as AccountRole);
  const roleOptions = ROLES.filter((r) => assignable.includes(r.id));
  const [users, setUsers] = useState<TeamUser[]>(initialState.kind === "ready" ? initialState.users : []);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invite, setInvite] = useState<{ name: string; url: string; reset: boolean } | null>(null);

  const openCreate = () => {
    setForm({ id: null, name: "", email: "", role: assignable.includes("agent") ? "agent" : assignable[0], channels: ["wa"], status: null });
    setErrors({});
    setTouched(false);
  };
  const openEdit = (u: TeamUser) => {
    setForm({ id: u.id, name: u.name, email: u.email, role: u.role, channels: [...u.channels], status: u.status });
    setErrors({});
    setTouched(false);
  };

  const liveErrors = useMemo(() => (form && touched ? validate(form) : {}), [form, touched]);
  const shownErrors = { ...liveErrors, ...errors };

  const replaceUser = (u: TeamUser) => setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));

  const save = async () => {
    if (!form) return;
    setTouched(true);
    const found = validate(form);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    const payload = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      role: form.role,
      channels: form.role === "agent" ? form.channels : CHANNEL_IDS,
    };
    setSaving(true);
    setErrors({});
    try {
      if (demo) {
        if (form.id) {
          replaceUser({ ...users.find((u) => u.id === form.id)!, ...payload });
          toast("Cambios guardados");
        } else {
          const id = Math.max(0, ...users.map((u) => u.id)) + 1;
          setUsers((prev) => [
            ...prev,
            { id, accountId, ...payload, status: "invited", inviteExpiresAt: null, lastLoginAt: null },
          ]);
          setInvite({ name: payload.name, url: `${window.location.origin}/admin/invitacion/demo-${id}`, reset: false });
        }
        setForm(null);
        return;
      }
      if (form.id) {
        const { user } = await call<{ user: TeamUser }>(api(`/${form.id}`), {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        replaceUser(user);
        toast("Cambios guardados");
      } else {
        const { user, inviteUrl } = await call<{ user: TeamUser; inviteUrl: string }>(api(), {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setUsers((prev) => [...prev, user]);
        setInvite({ name: user.name, url: inviteUrl, reset: false });
      }
      setForm(null);
    } catch (err) {
      const e = err as Error & { fields: FieldErrors };
      setErrors(Object.keys(e.fields).length ? e.fields : { form: e.message });
    } finally {
      setSaving(false);
    }
  };

  const setAccess = async (enable: boolean) => {
    if (!form?.id) return;
    setSaving(true);
    try {
      if (demo) {
        const current = users.find((u) => u.id === form.id)!;
        replaceUser({ ...current, status: enable ? "active" : "disabled" });
      } else {
        const { user } = await call<{ user: TeamUser }>(api(`/${form.id}`), {
          method: "PATCH",
          body: JSON.stringify({ status: enable ? "active" : "disabled" }),
        });
        replaceUser(user);
      }
      toast(enable ? "Acceso reactivado" : "Acceso desactivado");
      setForm(null);
    } catch (err) {
      setErrors({ form: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const newLink = async (u: TeamUser) => {
    try {
      const url = demo
        ? `${window.location.origin}/admin/invitacion/demo-${u.id}`
        : (await call<{ inviteUrl: string }>(api(`/${u.id}`), { method: "POST" })).inviteUrl;
      setForm(null);
      setInvite({ name: u.name, url, reset: u.status === "active" });
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Link copiado");
    } catch {
      toast("No se pudo copiar: seleccioná el link y copialo a mano", "error");
    }
  };

  const editing = form?.id ? users.find((u) => u.id === form.id) ?? null : null;
  const isSelf = form?.id === meId;

  return (
    <PageBody>
      <PageHeader
        title="Equipo"
        description="Las personas que pueden entrar al panel y qué canales ven."
        actions={
          <button
            onClick={openCreate}
            className="flex h-[46px] items-center gap-2 rounded-pill bg-crm-primary px-[22px] font-poppins text-[15px] font-semibold text-white transition-colors hover:bg-crm-primary-hover"
          >
            <Icon name="plus" size={18} />
            Crear usuario
          </button>
        }
      />

      {bootstrap && (
        <div className="flex flex-wrap items-start gap-3 rounded-card border border-crm-warn-border bg-crm-warn-soft px-5 py-4 text-sm text-crm-warn-ink">
          <Icon name="alert" size={20} className="mt-0.5 text-crm-warn" />
          <div className="min-w-[220px] flex-1">
            <div className="font-semibold">Estás usando el acceso inicial del panel</div>
            <p className="m-0 mt-1 leading-[1.45] text-crm-warn-ink-2">
              Creá tu usuario en <strong>Cuentas → Superadmins</strong>, abrí el link para elegir tu contraseña y
              entrá con tu email. Cuando haya un superadmin activo, la contraseña compartida deja de funcionar.
            </p>
          </div>
        </div>
      )}

      {initialState.kind === "error" && (
        <div className="rounded-card border border-crm-error-border bg-crm-error-bg px-5 py-4 text-sm text-crm-error-ink">
          {initialState.message}
        </div>
      )}

      {initialState.kind === "ready" && (
        <div className="rounded-card border border-crm-border bg-crm-card px-4 py-1.5 md:px-[22px]">
          {users.length === 0 && (
            <div className="py-10 text-center text-sm text-crm-muted">
              Todavía no hay nadie. Creá el primer usuario con el botón de arriba.
            </div>
          )}
          {users.map((u, i) => {
            const status = STATUS[u.status];
            return (
              <div
                key={u.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2.5 py-4 ${i ? "border-t border-crm-border" : ""}`}
              >
                <div className="flex min-w-0 flex-[1_1_240px] items-center gap-3">
                  <div
                    aria-hidden
                    className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full font-poppins text-sm font-semibold text-white"
                    style={{ background: avatarColor(u.id * 2) }}
                  >
                    {initialsOf(u.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-crm-ink">
                      {u.name}
                      {u.id === meId && " (vos)"}
                    </div>
                    <div className="truncate text-[13px] text-crm-muted">{u.email}</div>
                  </div>
                </div>
                <span className="shrink-0 rounded-pill border border-crm-tint-border bg-crm-tint px-3 py-[5px] text-[13px] font-semibold text-crm-primary">
                  {ROLE_LABELS[u.role]}
                </span>
                <div className="flex shrink-0 gap-1 md:basis-[160px]" aria-label={`Canales: ${u.channels.map((c) => CHANNELS[c].name).join(", ")}`}>
                  {CHANNEL_IDS.map((c) => (
                    <img
                      key={c}
                      src={CHANNELS[c].icon}
                      alt=""
                      title={CHANNELS[c].longName}
                      width={22}
                      height={22}
                      className="block"
                      style={{ opacity: u.channels.includes(c) ? 1 : 0.18 }}
                    />
                  ))}
                </div>
                <span className={`shrink-0 text-[13px] font-semibold md:basis-[140px] ${status.cls}`}>{status.label}</span>
                <div className="ml-auto flex shrink-0 gap-2">
                  {u.status === "invited" && canManage(u) && (
                    <button
                      onClick={() => newLink(u)}
                      className="h-9 rounded-pill px-3 text-[13px] font-semibold text-crm-primary hover:bg-crm-tint"
                    >
                      Copiar link
                    </button>
                  )}
                  {canManage(u) && (
                  <button
                    onClick={() => openEdit(u)}
                    className="h-9 rounded-pill border border-crm-border bg-crm-chip px-4 text-[13px] font-semibold text-crm-ink-2 transition-colors hover:border-crm-primary hover:text-crm-primary"
                  >
                    Editar
                  </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {ROLES.map((r) => (
          <div key={r.id} className="rounded-[18px] border border-crm-border bg-crm-card px-5 py-[18px]">
            <div className="font-poppins text-[15px] font-semibold text-crm-ink">{r.label}</div>
            <div className="mt-1 text-sm leading-[1.45] text-crm-muted">{r.description}</div>
          </div>
        ))}
      </div>

      {/* Crear / editar */}
      <Modal
        open={form !== null}
        onClose={() => !saving && setForm(null)}
        title={form?.id ? "Editar usuario" : "Crear usuario"}
        maxWidth={560}
        footer={
          form && (
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <div className="mr-auto flex flex-wrap gap-x-4">
                {editing && editing.status === "active" && (
                  <button
                    type="button"
                    onClick={() => newLink(editing)}
                    className="min-h-[44px] text-sm font-semibold text-crm-primary"
                  >
                    Link para nueva contraseña
                  </button>
                )}
                {editing && !isSelf && (
                  <button
                    type="button"
                    onClick={() => setAccess(editing.status === "disabled")}
                    disabled={saving}
                    className={`min-h-[44px] text-sm font-semibold ${
                      editing.status === "disabled" ? "text-crm-primary" : "text-crm-error"
                    }`}
                  >
                    {editing.status === "disabled" ? "Reactivar acceso" : "Quitar acceso"}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setForm(null)}
                disabled={saving}
                className="h-[46px] rounded-pill border border-crm-border-2 bg-crm-chip px-[22px] font-poppins text-sm font-semibold text-crm-ink"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="h-[46px] rounded-pill bg-crm-primary px-6 font-poppins text-sm font-semibold text-white hover:bg-crm-primary-hover disabled:bg-crm-primary-soft"
              >
                {saving ? "Guardando…" : form.id ? "Guardar cambios" : "Crear e invitar"}
              </button>
            </div>
          )
        }
      >
        {form && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            noValidate
            className="flex flex-col gap-5"
          >
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              <Field label="Nombre" error={shownErrors.name} id="user-name">
                <input
                  id="user-name"
                  data-autofocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onBlur={() => setTouched(true)}
                  placeholder="Ej. Sofía Rivas"
                  aria-invalid={Boolean(shownErrors.name)}
                  className={inputClass(Boolean(shownErrors.name))}
                />
              </Field>
              <Field label="Email" error={shownErrors.email} id="user-email">
                <input
                  id="user-email"
                  type="email"
                  inputMode="email"
                  value={form.email}
                  disabled={Boolean(editing && editing.status !== "invited")}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  onBlur={() => setTouched(true)}
                  placeholder="sofia@tunegocio.com"
                  aria-invalid={Boolean(shownErrors.email)}
                  className={`${inputClass(Boolean(shownErrors.email))} disabled:opacity-60`}
                />
              </Field>
            </div>

            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 text-sm font-semibold text-crm-ink">¿Qué puede hacer?</legend>
              {isSelf && (
                <p className="mb-2 mt-0 text-[13px] text-crm-muted">No podés cambiar tu propio rol.</p>
              )}
              <div role="radiogroup" className="flex flex-col gap-2">
                {(isSelf ? ROLES.filter((r) => r.id === form.role) : roleOptions).map((r) => {
                  const on = form.role === r.id;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      key={r.id}
                      disabled={isSelf}
                      onClick={() => setForm({ ...form, role: r.id })}
                      className={`flex items-start gap-3 rounded-[14px] border-[1.5px] px-3.5 py-3 text-left transition-colors ${
                        on ? "border-crm-primary bg-crm-tint" : "border-crm-border hover:border-crm-primary"
                      }`}
                    >
                      <span
                        className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          on ? "border-crm-primary" : "border-crm-border-2"
                        }`}
                      >
                        {on && <span className="h-2.5 w-2.5 rounded-full bg-crm-primary" />}
                      </span>
                      <span>
                        <span className="block text-[15px] font-semibold text-crm-ink">{r.label}</span>
                        <span className="mt-0.5 block text-[13px] leading-[1.4] text-crm-muted">{r.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 text-sm font-semibold text-crm-ink">Canales que ve</legend>
              {form.role === "agent" ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {CHANNEL_IDS.map((c) => {
                      const on = form.channels.includes(c);
                      return (
                        <button
                          type="button"
                          key={c}
                          aria-pressed={on}
                          onClick={() =>
                            setForm({
                              ...form,
                              channels: on ? form.channels.filter((x) => x !== c) : [...form.channels, c],
                            })
                          }
                          className={`flex h-10 items-center gap-2 rounded-pill border-[1.5px] pl-2.5 pr-3.5 text-sm font-semibold transition-colors ${
                            on
                              ? "border-crm-primary bg-crm-tint text-crm-primary"
                              : "border-crm-border text-crm-ink-2 hover:border-crm-primary"
                          }`}
                        >
                          <img src={CHANNELS[c].icon} alt="" width={20} height={20} className="block" />
                          {CHANNELS[c].name}
                        </button>
                      );
                    })}
                  </div>
                  {shownErrors.channels && <p className="mb-0 mt-2 text-[13px] text-crm-error">{shownErrors.channels}</p>}
                </>
              ) : (
                <p className="m-0 text-sm text-crm-muted">
                  {ROLE_LABELS[form.role]}es ven todos los canales.
                </p>
              )}
            </fieldset>

            <div className="flex items-center gap-2.5 rounded-[14px] border border-crm-tint-border bg-crm-tint px-3.5 py-3 text-[13px] text-crm-ink">
              <Icon name="mail" size={18} className="text-crm-primary" />
              <span>
                {form.id
                  ? "Si le cambiás el rol o le quitás el acceso, se le cierra la sesión."
                  : "Te damos un link para que se lo mandes y cree su contraseña. Vence en 7 días."}
              </span>
            </div>

            {shownErrors.form && (
              <p role="alert" className="m-0 rounded-field bg-crm-error-bg px-3 py-2 text-sm text-crm-error-ink">
                {shownErrors.form}
              </p>
            )}
            <button type="submit" hidden />
          </form>
        )}
      </Modal>

      {/* Link de invitación */}
      <Modal
        open={invite !== null}
        onClose={() => setInvite(null)}
        title={invite?.reset ? "Link para nueva contraseña" : "¡Listo! Falta un paso"}
        description={
          invite
            ? `Mandale este link a ${invite.name.split(" ")[0]} por WhatsApp o email para que ${
                invite.reset ? "elija una contraseña nueva" : "cree su contraseña"
              }. Vence en 7 días y sirve una sola vez.`
            : undefined
        }
        maxWidth={520}
      >
        {invite && (
          <div className="flex flex-col gap-3">
            <label htmlFor="invite-link" className="sr-only">
              Link de invitación
            </label>
            <input
              id="invite-link"
              readOnly
              value={invite.url}
              onFocus={(e) => e.target.select()}
              className="h-11 w-full rounded-field border border-crm-border bg-crm-surf px-3.5 text-sm text-crm-ink outline-none"
            />
            <div className="flex flex-wrap gap-2.5">
              <button
                data-autofocus
                onClick={() => copy(invite.url)}
                className="h-11 flex-1 rounded-pill bg-crm-primary px-5 font-poppins text-sm font-semibold text-white hover:bg-crm-primary-hover"
              >
                Copiar link
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `¡Hola ${invite.name.split(" ")[0]}! Te sumé al panel de DigiBot. Creá tu contraseña acá: ${invite.url}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-pill border border-crm-border-2 bg-crm-chip px-5 font-poppins text-sm font-semibold text-crm-ink hover:border-crm-primary hover:text-crm-primary"
              >
                <img src={CHANNELS.wa.icon} alt="" width={18} height={18} />
                Mandar por WhatsApp
              </a>
            </div>
            {demo && <p className="m-0 text-xs text-crm-muted">En la demo el link no funciona.</p>}
          </div>
        )}
      </Modal>
    </PageBody>
  );
}

function inputClass(invalid: boolean) {
  return `h-[46px] w-full rounded-field border bg-crm-surf px-3.5 text-[15px] text-crm-ink outline-none placeholder:text-crm-subtle focus:border-crm-primary ${
    invalid ? "border-crm-error" : "border-crm-border"
  }`;
}

function Field({ label, error, id, children }: { label: string; error?: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-crm-ink">
        {label}
      </label>
      {children}
      {error && <span className="text-[13px] text-crm-error">{error}</span>}
    </div>
  );
}
