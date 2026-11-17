"use client";

// Panel interno: todas las conexiones de WhatsApp de todas las cuentas, con su estado,
// el motivo de desconexión, la sincronización y las acciones de soporte.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/crm/Modal";
import PageHeader, { PageBody } from "@/components/crm/PageHeader";
import { useToast } from "@/components/crm/Toast";
import { ONBOARDING_STEPS, type SignupEventRow, type WaAccountRow, type WaHealth } from "@/lib/whatsapp-accounts/types";

interface PanelNotification {
  id: number;
  title: string;
  body: string | null;
  createdAt: number;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } });
  } catch {
    throw new Error("No se pudo conectar con el servidor.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Algo salió mal.");
  return data as T;
}

const HEALTH: Record<WaHealth, { label: string; className: string }> = {
  active: { label: "Activa", className: "bg-crm-success-bg text-crm-success-ink" },
  needs_attention: { label: "Revisar", className: "bg-crm-warn-soft text-crm-warn-ink" },
  disconnected: { label: "Desconectada", className: "bg-crm-error-bg text-crm-error-ink" },
};

const HISTORY: Record<WaAccountRow["historyStatus"], string> = {
  none: "—",
  pending: "Pedido",
  in_progress: "En curso",
  done: "Completo",
  declined: "No compartió",
  error: "Error al pedir",
};

const fmt = (unix: number | null) =>
  unix ? new Date(unix * 1000).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—";

type Action = "subscribe" | "register" | "sync_state" | "sync_history" | "verify";

export default function WaAccountsView() {
  const toast = useToast();
  const [rows, setRows] = useState<WaAccountRow[] | null>(null);
  const [notifications, setNotifications] = useState<PanelNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [events, setEvents] = useState<{ row: WaAccountRow; events: SignupEventRow[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await call<{ accounts: WaAccountRow[]; notifications: PanelNotification[] }>("/api/admin/whatsapp-cuentas");
      setRows(data.accounts);
      setNotifications(data.notifications);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (row: WaAccountRow, action: Action) => {
    setBusy(`${row.id}:${action}`);
    try {
      const res = await call<{ health: WaHealth | null }>(`/api/admin/whatsapp-cuentas/${row.id}/acciones`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      toast(action === "verify" ? `Token verificado: ${HEALTH[res.health ?? "active"].label}` : "Listo");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
      void load();
    }
  };

  const showEvents = async (row: WaAccountRow) => {
    try {
      const data = await call<{ events: SignupEventRow[] }>(`/api/admin/whatsapp-cuentas/${row.id}/eventos`);
      setEvents({ row, events: data.events });
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const button = (row: WaAccountRow, action: Action, label: string, show = true) =>
    show && (
      <button
        key={action}
        onClick={() => act(row, action)}
        disabled={busy !== null || row.status !== "connected"}
        className="min-h-[34px] rounded-pill border border-crm-border-2 bg-crm-chip px-3 text-xs font-semibold text-crm-ink hover:border-crm-primary hover:text-crm-primary disabled:opacity-50"
      >
        {busy === `${row.id}:${action}` ? "…" : label}
      </button>
    );

  return (
    <PageBody maxWidth={1280}>
      <PageHeader
        title="Cuentas de WhatsApp"
        description="Todos los números conectados con Embedded Signup, su estado y las acciones de soporte."
        actions={
          <Link
            href="/admin/cuentas"
            className="flex h-[46px] items-center rounded-pill border border-crm-border-2 bg-crm-chip px-[22px] font-poppins text-[15px] font-semibold text-crm-ink"
          >
            Volver a Cuentas
          </Link>
        }
      />

      {notifications.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Avisos">
          {notifications.map((n) => (
            <li key={n.id} className="rounded-card border border-crm-error-border bg-crm-error-bg px-4 py-3 text-sm text-crm-error-ink">
              <div className="font-semibold">{n.title}</div>
              {n.body && <div className="text-[13px]">{n.body}</div>}
              <div className="text-xs opacity-80">{fmt(n.createdAt)}</div>
            </li>
          ))}
        </ul>
      )}

      {error && <div className="rounded-card border border-crm-error-border bg-crm-error-bg px-5 py-4 text-sm text-crm-error-ink">{error}</div>}
      {rows && rows.length === 0 && <p className="text-sm text-crm-muted">Todavía no hay números conectados con Embedded Signup.</p>}

      <div className="flex flex-col gap-3">
        {rows?.map((row) => (
          <article key={row.id} className="flex flex-col gap-3 rounded-card border border-crm-border bg-crm-card p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-[220px] flex-1">
                <div className="font-poppins text-base font-semibold text-crm-ink">
                  {row.phone}
                  {row.verifiedName ? <span className="font-normal text-crm-muted"> · {row.verifiedName}</span> : null}
                </div>
                <div className="text-xs text-crm-muted">
                  {row.accountName} (#{row.accountId}) · WABA {row.wabaId} · phone_number_id {row.phoneNumberId}
                </div>
              </div>
              <span className={`rounded-pill px-2.5 py-1 text-xs font-semibold ${HEALTH[row.health].className}`}>
                {row.status === "connected" ? HEALTH[row.health].label : "Desvinculada desde el panel"}
              </span>
            </div>

            <dl className="m-0 grid gap-x-6 gap-y-1.5 text-[13px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              <div>
                <dt className="text-crm-muted">Coexistencia</dt>
                <dd className="m-0 text-crm-ink">{row.coexistence ? "Sí (también en la app)" : "No"}</dd>
              </div>
              <div>
                <dt className="text-crm-muted">Sincronización</dt>
                <dd className="m-0 text-crm-ink">
                  {row.coexistence ? `${HISTORY[row.historyStatus]}${row.historyStatus === "in_progress" ? ` · ${row.historyProgress}%` : ""}` : "No aplica"}
                </dd>
              </div>
              <div>
                <dt className="text-crm-muted">Motivo de desconexión</dt>
                <dd className="m-0 text-crm-ink">
                  {row.disconnection
                    ? `${row.disconnection.reason ?? "—"} · ${row.disconnection.source}${row.disconnection.initiatedBy ? ` · ${row.disconnection.initiatedBy}` : ""} · ${fmt(row.disconnection.at)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-crm-muted">Último chequeo de token</dt>
                <dd className="m-0 text-crm-ink">{fmt(row.healthCheckedAt)}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-1.5" aria-label="Pasos del onboarding">
              {ONBOARDING_STEPS.map((step) => {
                const s = row.steps[step];
                const cls = !s
                  ? "bg-crm-surf text-crm-muted"
                  : s.status === "ok"
                    ? "bg-crm-success-bg text-crm-success-ink"
                    : s.status === "skipped"
                      ? "bg-crm-surf text-crm-ink-2"
                      : "bg-crm-error-bg text-crm-error-ink";
                return (
                  <span key={step} title={s?.error ?? undefined} className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
                    {step}: {s?.status ?? "—"}
                  </span>
                );
              })}
            </div>

            {row.lastError && (
              <p className="m-0 break-words rounded-field bg-crm-surf px-3 py-2 text-xs text-crm-ink-2">
                <strong>Último error</strong> ({fmt(row.lastErrorAt)}): {row.lastError}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {button(row, "subscribe", "Reintentar suscripción")}
              {button(row, "register", "Reintentar registro", !row.coexistence)}
              {button(row, "sync_state", "Pedir sync de contactos", row.coexistence && !row.syncStateRequested)}
              {button(row, "sync_history", "Pedir historial", row.coexistence && !row.historyRequested)}
              {button(row, "verify", "Verificar token ahora")}
              <button
                onClick={() => showEvents(row)}
                disabled={!row.signupSessionId}
                className="min-h-[34px] rounded-pill border border-crm-border-2 bg-crm-chip px-3 text-xs font-semibold text-crm-ink hover:border-crm-primary hover:text-crm-primary disabled:opacity-50"
              >
                Ver eventos del signup
              </button>
            </div>
          </article>
        ))}
      </div>

      <Modal
        open={events !== null}
        onClose={() => setEvents(null)}
        title={`Eventos del signup · ${events?.row.phone ?? ""}`}
        description={events?.row.signupSessionId ? `Sesión ${events.row.signupSessionId}` : undefined}
        maxWidth={720}
      >
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {events?.events.length === 0 && <li className="text-sm text-crm-muted">Sin eventos guardados.</li>}
          {events?.events.map((e) => (
            <li key={e.id} className="rounded-field bg-crm-surf px-3 py-2">
              <div className="text-xs font-semibold text-crm-ink">
                {e.kind} · {fmt(e.at)}
              </div>
              <pre className="m-0 mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] text-crm-ink-2">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            </li>
          ))}
        </ol>
      </Modal>
    </PageBody>
  );
}
