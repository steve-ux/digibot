"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/components/crm/Icon";
import InviteLinkModal, { type InviteLink } from "@/components/crm/InviteLinkModal";
import { Modal } from "@/components/crm/Modal";
import PageHeader, { PageBody } from "@/components/crm/PageHeader";
import { useToast } from "@/components/crm/Toast";
import { ACCOUNT_STATUS_LABELS, type AccountStatus, type AccountSummary } from "@/lib/crm/accounts-repo";
import { avatarColor, initialsOf } from "@/lib/crm/channels";
import { accountPath } from "@/lib/crm/permissions";
import type { TeamUser } from "@/lib/crm/team";

export type CuentasLoadState =
  | { kind: "ready"; accounts: AccountSummary[]; superadmins: TeamUser[] }
  | { kind: "error"; message: string };

type FieldErrors = Record<string, string | undefined>;

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

const STATUS_CLASS: Record<AccountStatus, string> = {
  active: "text-crm-success-ink",
  onboarding: "text-crm-warn",
  suspended: "text-crm-error",
};

function inputClass(invalid: boolean) {
  return `h-[46px] w-full rounded-field border bg-crm-surf px-3.5 text-[15px] text-crm-ink outline-none placeholder:text-crm-subtle focus:border-crm-primary ${
    invalid ? "border-crm-error" : "border-crm-border"
  }`;
}

function Field({ label, error, hint, id, children }: { label: string; error?: string; hint?: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-crm-ink">
        {label}
      </label>
      {children}
      {error ? <span className="text-[13px] text-crm-error">{error}</span> : hint && <span className="text-[13px] text-crm-muted">{hint}</span>}
    </div>
  );
}

function Footer({ onCancel, onSave, saving, label }: { onCancel: () => void; onSave: () => void; saving: boolean; label: string }) {
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
        className="h-[46px] rounded-pill bg-crm-primary px-6 font-poppins text-sm font-semibold text-white hover:bg-crm-primary-hover disabled:bg-crm-primary-soft"
      >
        {saving ? "Guardando…" : label}
      </button>
    </div>
  );
}

const btn =
  "h-9 rounded-pill border border-crm-border bg-crm-chip px-4 text-[13px] font-semibold text-crm-ink-2 transition-colors hover:border-crm-primary hover:text-crm-primary";

export default function CuentasView({
  initialState,
  meId,
  bootstrap,
}: {
  initialState: CuentasLoadState;
  meId: number;
  bootstrap: boolean;
}) {
  const toast = useToast();
  const [accounts, setAccounts] = useState<AccountSummary[]>(initialState.kind === "ready" ? initialState.accounts : []);
  const [superadmins, setSuperadmins] = useState<TeamUser[]>(initialState.kind === "ready" ? initialState.superadmins : []);
  const [invite, setInvite] = useState<InviteLink | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  // Formularios
  const [accountForm, setAccountForm] = useState<
    { id: number | null; name: string; status: AccountStatus; adminName: string; adminEmail: string } | null
  >(null);
  const [superForm, setSuperForm] = useState<{ name: string; email: string } | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setErrors({});
    try {
      await fn();
    } catch (err) {
      const e = err as Error & { fields?: FieldErrors };
      setErrors(e.fields && Object.values(e.fields).some(Boolean) ? e.fields : { form: e.message });
    } finally {
      setSaving(false);
    }
  };

  const saveAccount = () =>
    accountForm &&
    run(async () => {
      if (accountForm.id) {
        const { account } = await call<{ account: AccountSummary }>(`/api/admin/cuentas/${accountForm.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: accountForm.name, status: accountForm.status }),
        });
        setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, ...account } : a)));
        toast("Cuenta guardada");
      } else {
        const { account, admin, inviteUrl } = await call<{
          account: AccountSummary;
          admin: TeamUser | null;
          inviteUrl: string | null;
        }>("/api/admin/cuentas", {
          method: "POST",
          body: JSON.stringify({ name: accountForm.name, adminName: accountForm.adminName, adminEmail: accountForm.adminEmail }),
        });
        setAccounts((prev) => [...prev, { ...account, users: admin ? 1 : 0, conversations: 0 }]);
        if (admin && inviteUrl) setInvite({ name: admin.name, url: inviteUrl, reset: false });
        else toast(`Cuenta #${account.id} creada`);
      }
      setAccountForm(null);
    });

  const saveSuperadmin = () =>
    superForm &&
    run(async () => {
      const { user, inviteUrl, promoted } = await call<{ user: TeamUser; inviteUrl: string | null; promoted: boolean }>(
        "/api/admin/superadmins",
        { method: "POST", body: JSON.stringify(superForm) }
      );
      setSuperadmins((prev) => [...prev.filter((u) => u.id !== user.id), user]);
      setSuperForm(null);
      if (inviteUrl) setInvite({ name: user.name, url: inviteUrl, reset: false });
      else toast(promoted ? `${user.name} ahora es superadmin (entra con su contraseña de siempre)` : "Superadmin creado");
    });

  const superLink = async (u: TeamUser) => {
    try {
      const { inviteUrl } = await call<{ inviteUrl: string }>(`/api/admin/superadmins/${u.id}`, { method: "POST" });
      setInvite({ name: u.name, url: inviteUrl, reset: u.status === "active" });
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const superAccess = async (u: TeamUser, enable: boolean) => {
    try {
      const { user } = await call<{ user: TeamUser }>(`/api/admin/superadmins/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: enable ? "active" : "disabled" }),
      });
      setSuperadmins((prev) => prev.map((x) => (x.id === user.id ? user : x)));
      toast(enable ? "Acceso reactivado" : "Acceso desactivado");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <PageBody>
      <PageHeader
        title="Cuentas"
        description="Cada negocio que usa DigiBot, con su equipo, canales y conversaciones."
        actions={
          <button
            onClick={() => {
              setErrors({});
              setAccountForm({ id: null, name: "", status: "active", adminName: "", adminEmail: "" });
            }}
            className="flex h-[46px] items-center gap-2 rounded-pill bg-crm-primary px-[22px] font-poppins text-[15px] font-semibold text-white transition-colors hover:bg-crm-primary-hover"
          >
            <Icon name="plus" size={18} />
            Nueva cuenta
          </button>
        }
      />

      {bootstrap && (
        <div className="flex flex-wrap items-start gap-3 rounded-card border border-crm-warn-border bg-crm-warn-soft px-5 py-4 text-sm text-crm-warn-ink">
          <Icon name="alert" size={20} className="mt-0.5 text-crm-warn" />
          <div className="min-w-[220px] flex-1">
            <div className="font-semibold">Estás usando el acceso inicial del panel</div>
            <p className="m-0 mt-1 leading-[1.45] text-crm-warn-ink-2">
              Agregá tu usuario en <strong>Superadmins</strong> (más abajo), abrí el link para elegir tu contraseña y
              entrá con tu email. Si ya tenías un usuario, poné el mismo email y pasa a superadmin. Cuando haya un
              superadmin activo, la contraseña compartida deja de funcionar.
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
          {accounts.length === 0 && <div className="py-10 text-center text-sm text-crm-muted">Todavía no hay cuentas.</div>}
          {accounts.map((a, i) => (
            <div key={a.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2.5 py-4 ${i ? "border-t border-crm-border" : ""}`}>
              <div className="flex min-w-0 flex-[1_1_240px] items-center gap-3">
                <div
                  aria-hidden
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] font-poppins text-sm font-semibold text-white"
                  style={{ background: avatarColor(a.id) }}
                >
                  {initialsOf(a.name)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-crm-ink">{a.name}</div>
                  <div className="text-[13px] text-crm-muted">
                    Cuenta #{a.id} · {a.users} {a.users === 1 ? "persona" : "personas"} · {a.conversations}{" "}
                    {a.conversations === 1 ? "conversación" : "conversaciones"}
                  </div>
                </div>
              </div>
              <span className={`shrink-0 text-[13px] font-semibold md:basis-[110px] ${STATUS_CLASS[a.status]}`}>
                {ACCOUNT_STATUS_LABELS[a.status]}
              </span>
              <div className="ml-auto flex shrink-0 gap-2">
                <button
                  onClick={() => {
                    setErrors({});
                    setAccountForm({ id: a.id, name: a.name, status: a.status, adminName: "", adminEmail: "" });
                  }}
                  className={btn}
                >
                  Editar
                </button>
                <Link
                  href={accountPath(a.id)}
                  className="flex h-9 items-center rounded-pill bg-crm-primary px-4 text-[13px] font-semibold text-white hover:bg-crm-primary-hover"
                >
                  Entrar
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {initialState.kind === "ready" && (
        <section aria-labelledby="superadmins-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3 pt-2">
            <div className="min-w-[220px] flex-1">
              <h2 id="superadmins-title" className="m-0 font-poppins text-lg font-semibold text-crm-ink">
                Superadmins
              </h2>
              <p className="m-0 mt-1 text-sm text-crm-muted">El equipo de DigiBot: entra a todas las cuentas y crea administradores.</p>
            </div>
            <button
              onClick={() => {
                setErrors({});
                setSuperForm({ name: "", email: "" });
              }}
              className="flex h-10 items-center gap-2 rounded-pill border border-crm-border-2 bg-crm-chip px-4 text-sm font-semibold text-crm-ink hover:border-crm-primary hover:text-crm-primary"
            >
              <Icon name="plus" size={16} />
              Agregar superadmin
            </button>
          </div>
          <div className="rounded-card border border-crm-border bg-crm-card px-4 py-1.5 md:px-[22px]">
            {superadmins.length === 0 && (
              <div className="py-8 text-center text-sm text-crm-muted">Todavía no hay superadmins. Agregá el tuyo.</div>
            )}
            {superadmins.map((u, i) => (
              <div key={u.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 ${i ? "border-t border-crm-border" : ""}`}>
                <div className="flex min-w-0 flex-[1_1_240px] items-center gap-3">
                  <div
                    aria-hidden
                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full font-poppins text-sm font-semibold text-white"
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
                <span
                  className={`shrink-0 text-[13px] font-semibold ${
                    u.status === "active" ? "text-crm-success-ink" : u.status === "invited" ? "text-crm-warn" : "text-crm-muted"
                  }`}
                >
                  {u.status === "active" ? "Activo" : u.status === "invited" ? "Invitación enviada" : "Sin acceso"}
                </span>
                <div className="ml-auto flex shrink-0 flex-wrap gap-2">
                  {u.status !== "disabled" && (
                    <button onClick={() => superLink(u)} className={btn}>
                      {u.status === "invited" ? "Copiar link" : "Link para nueva contraseña"}
                    </button>
                  )}
                  {u.id !== meId && (
                    <button onClick={() => superAccess(u, u.status === "disabled")} className={btn}>
                      {u.status === "disabled" ? "Reactivar acceso" : "Quitar acceso"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Nueva cuenta / editar */}
      <Modal
        open={accountForm !== null}
        onClose={() => !saving && setAccountForm(null)}
        title={accountForm?.id ? `Editar cuenta #${accountForm.id}` : "Nueva cuenta"}
        maxWidth={540}
        footer={
          accountForm && (
            <Footer
              onCancel={() => setAccountForm(null)}
              onSave={saveAccount}
              saving={saving}
              label={accountForm.id ? "Guardar" : accountForm.adminEmail ? "Crear e invitar" : "Crear cuenta"}
            />
          )
        }
      >
        {accountForm && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              saveAccount();
            }}
            className="flex flex-col gap-5"
          >
            <Field label="Nombre del negocio" id="account-name" error={errors.name}>
              <input
                id="account-name"
                data-autofocus
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                placeholder="Ej. Óptica Sol"
                className={inputClass(Boolean(errors.name))}
              />
            </Field>
            {accountForm.id ? (
              <Field label="Estado" id="account-status" error={errors.status} hint="Suspendida: nadie de la cuenta puede entrar (vos sí).">
                <select
                  id="account-status"
                  value={accountForm.status}
                  onChange={(e) => setAccountForm({ ...accountForm, status: e.target.value as AccountStatus })}
                  className={`${inputClass(false)} cursor-pointer`}
                >
                  {(Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {ACCOUNT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <fieldset className="m-0 flex flex-col gap-3.5 rounded-[14px] border border-crm-border p-4">
                <legend className="px-1 text-sm font-semibold text-crm-ink">Administrador de la cuenta (opcional)</legend>
                <p className="m-0 text-[13px] text-crm-muted">
                  Le damos un link para que cree su contraseña. Después suma a su equipo desde Equipo.
                </p>
                <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                  <Field label="Nombre" id="admin-name" error={errors.adminName}>
                    <input
                      id="admin-name"
                      value={accountForm.adminName}
                      onChange={(e) => setAccountForm({ ...accountForm, adminName: e.target.value })}
                      placeholder="Ej. Laura Gómez"
                      className={inputClass(Boolean(errors.adminName))}
                    />
                  </Field>
                  <Field label="Email" id="admin-email" error={errors.adminEmail}>
                    <input
                      id="admin-email"
                      type="email"
                      inputMode="email"
                      value={accountForm.adminEmail}
                      onChange={(e) => setAccountForm({ ...accountForm, adminEmail: e.target.value })}
                      placeholder="laura@opticasol.com"
                      className={inputClass(Boolean(errors.adminEmail))}
                    />
                  </Field>
                </div>
              </fieldset>
            )}
            {errors.form && (
              <p role="alert" className="m-0 rounded-field bg-crm-error-bg px-3 py-2 text-sm text-crm-error-ink">
                {errors.form}
              </p>
            )}
            <button type="submit" hidden />
          </form>
        )}
      </Modal>

      {/* Agregar superadmin */}
      <Modal
        open={superForm !== null}
        onClose={() => !saving && setSuperForm(null)}
        title="Agregar superadmin"
        description="Entra a todas las cuentas. Si el email ya tiene usuario, pasa a superadmin y conserva su contraseña."
        maxWidth={520}
        footer={superForm && <Footer onCancel={() => setSuperForm(null)} onSave={saveSuperadmin} saving={saving} label="Agregar" />}
      >
        {superForm && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              saveSuperadmin();
            }}
            className="flex flex-col gap-4"
          >
            <Field label="Nombre" id="super-name" error={errors.name}>
              <input
                id="super-name"
                data-autofocus
                value={superForm.name}
                onChange={(e) => setSuperForm({ ...superForm, name: e.target.value })}
                placeholder="Ej. Esteban"
                className={inputClass(Boolean(errors.name))}
              />
            </Field>
            <Field label="Email" id="super-email" error={errors.email}>
              <input
                id="super-email"
                type="email"
                inputMode="email"
                value={superForm.email}
                onChange={(e) => setSuperForm({ ...superForm, email: e.target.value })}
                placeholder="vos@digibotlatam.com"
                className={inputClass(Boolean(errors.email))}
              />
            </Field>
            {errors.form && (
              <p role="alert" className="m-0 rounded-field bg-crm-error-bg px-3 py-2 text-sm text-crm-error-ink">
                {errors.form}
              </p>
            )}
            <button type="submit" hidden />
          </form>
        )}
      </Modal>

      <InviteLinkModal invite={invite} onClose={() => setInvite(null)} />
    </PageBody>
  );
}
