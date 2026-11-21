"use client";

// Panel interno "Cobros" (superadmins): MRR por moneda, estado de todas las
// suscripciones, pagos fallidos y reintento manual.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader, { PageBody } from "@/components/crm/PageHeader";
import { useToast } from "@/components/crm/Toast";
import type { AdminBillingOverview } from "@/lib/billing/admin";
import { formatMoney } from "@/lib/billing/config";
import type { BillingStatus } from "@/lib/billing/types";

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

const STATUS: Record<BillingStatus, { label: string; className: string }> = {
  incomplete: { label: "Sin confirmar", className: "bg-crm-surf text-crm-muted" },
  active: { label: "Activa", className: "bg-crm-success-bg text-crm-success-ink" },
  past_due: { label: "En mora", className: "bg-crm-warn-soft text-crm-warn-ink" },
  suspended: { label: "Suspendida", className: "bg-crm-error-bg text-crm-error" },
  cancelled: { label: "Cancelada", className: "bg-crm-surf text-crm-muted" },
};

const FILTERS: { id: "all" | BillingStatus; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "active", label: "Activas" },
  { id: "past_due", label: "En mora" },
  { id: "suspended", label: "Suspendidas" },
  { id: "cancelled", label: "Canceladas" },
];

const day = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—");
const when = (unix: number) => new Date(unix * 1000).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
const card = "rounded-card border border-crm-border bg-crm-card p-5";
const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[.5px] text-crm-muted";
const td = "px-3 py-3 align-top text-sm text-crm-ink";

export default function CobrosView() {
  const toast = useToast();
  const [data, setData] = useState<AdminBillingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await call<AdminBillingOverview>("/api/admin/cobros"));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const retry = async (subscriptionId: number) => {
    setBusy(subscriptionId);
    try {
      const res = await call<{ message: string; result: string }>(`/api/admin/cobros/${subscriptionId}/reintentar`, { method: "POST" });
      toast(res.message, res.result === "failed" ? "error" : undefined);
      await load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo(() => (data ? data.subscriptions.filter((s) => filter === "all" || s.status === filter) : []), [data, filter]);

  return (
    <PageBody>
      <PageHeader
        title="Cobros"
        description="Suscripciones con cobro automático (dLocal Go): estado, pagos fallidos y MRR."
        actions={
          <Link
            href="/admin/cuentas"
            className="flex h-[46px] items-center rounded-pill border border-crm-border-2 bg-crm-chip px-[22px] font-poppins text-[15px] font-semibold text-crm-ink transition-colors hover:border-crm-primary hover:text-crm-primary"
          >
            Volver a Cuentas
          </Link>
        }
      />

      {error && <div className="mb-4 rounded-card border border-crm-error-border bg-crm-error-bg px-4 py-3 text-sm font-semibold text-crm-error">{error}</div>}
      {!data && !error && <p className="text-sm text-crm-muted">Cargando…</p>}

      {data && (
        <div className="flex flex-col gap-4">
          {/* MRR + conteos */}
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {data.mrr.length === 0 ? (
              <div className={card}>
                <div className="text-xs font-semibold uppercase tracking-[1px] text-crm-muted">MRR</div>
                <div className="mt-1 font-poppins text-2xl font-bold text-crm-ink">—</div>
                <div className="text-[13px] text-crm-muted">Todavía no hay suscripciones activas.</div>
              </div>
            ) : (
              data.mrr.map((m) => (
                <div key={m.currency} className={card}>
                  <div className="text-xs font-semibold uppercase tracking-[1px] text-crm-muted">MRR {m.currency}</div>
                  <div className="mt-1 font-poppins text-2xl font-bold tabular-nums text-crm-ink">{formatMoney(m.amount, m.currency)}</div>
                  <div className="text-[13px] text-crm-muted">
                    {m.subscriptions} suscripci{m.subscriptions === 1 ? "ón" : "ones"} activas o en mora
                  </div>
                </div>
              ))
            )}
            <div className={card}>
              <div className="text-xs font-semibold uppercase tracking-[1px] text-crm-muted">Estado</div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[13px]">
                {(["active", "past_due", "suspended", "cancelled"] as BillingStatus[]).map((s) => (
                  <span key={s} className={`rounded-pill px-2.5 py-[3px] font-semibold ${STATUS[s].className}`}>
                    {STATUS[s].label}: {data.counts[s]}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Pagos fallidos */}
          <section className={card}>
            <h2 className="m-0 font-poppins text-[17px] font-semibold text-crm-ink">Pagos fallidos</h2>
            {data.failedPayments.length === 0 ? (
              <p className="m-0 mt-2 text-sm text-crm-muted">No hay pagos fallidos.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="border-b border-crm-border">
                      <th className={th}>Fecha</th>
                      <th className={th}>Cuenta</th>
                      <th className={th}>Cobro</th>
                      <th className={th}>Monto</th>
                      <th className={th}>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.failedPayments.map((p) => (
                      <tr key={p.id} className="border-b border-crm-border last:border-0">
                        <td className={`${td} whitespace-nowrap text-crm-muted`}>{when(p.createdAt)}</td>
                        <td className={td}>
                          {p.accountId ? (
                            <Link className="font-semibold text-crm-primary" href={`/admin/cuentas/${p.accountId}/configuracion?tab=suscripcion`}>
                              {p.accountName}
                            </Link>
                          ) : (
                            p.accountName
                          )}
                        </td>
                        <td className={`${td} font-mono text-[13px]`}>{p.orderId}</td>
                        <td className={`${td} whitespace-nowrap tabular-nums`}>{formatMoney(p.amount, p.currency)}</td>
                        <td className={`${td} text-crm-ink-2`}>{p.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Suscripciones */}
          <section className={card}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="m-0 flex-1 font-poppins text-[17px] font-semibold text-crm-ink">Suscripciones</h2>
              <div className="flex flex-wrap gap-1.5" role="tablist">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    role="tab"
                    aria-selected={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={`min-h-[34px] rounded-pill px-3 text-[13px] font-semibold ${filter === f.id ? "bg-crm-primary text-white" : "bg-crm-surf text-crm-ink-2 hover:text-crm-primary"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="m-0 mt-3 text-sm text-crm-muted">No hay suscripciones con ese estado.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead>
                    <tr className="border-b border-crm-border">
                      <th className={th}>Cuenta</th>
                      <th className={th}>Plan</th>
                      <th className={th}>Estado</th>
                      <th className={th}>Monto</th>
                      <th className={th}>Próximo cobro</th>
                      <th className={th}>Tarjeta</th>
                      <th className={th} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id} className="border-b border-crm-border last:border-0">
                        <td className={td}>
                          {s.accountId ? (
                            <Link className="font-semibold text-crm-primary" href={`/admin/cuentas/${s.accountId}/configuracion?tab=suscripcion`}>
                              {s.accountName}
                            </Link>
                          ) : (
                            s.accountName
                          )}
                          <div className="text-xs text-crm-muted">
                            #{s.id} · {s.country}
                          </div>
                        </td>
                        <td className={td}>
                          {s.planKey}
                          {s.pendingPlanKey && <div className="text-xs text-crm-muted">→ {s.pendingPlanKey} en el próximo cobro</div>}
                        </td>
                        <td className={td}>
                          <span className={`rounded-pill px-2.5 py-[3px] text-xs font-semibold ${STATUS[s.status].className}`}>{STATUS[s.status].label}</span>
                          {s.cancelAtPeriodEnd && <div className="mt-1 text-xs text-crm-muted">Cancela el {day(s.periodEnd)}</div>}
                          {s.failedAttempts > 0 && (
                            <div className="mt-1 text-xs text-crm-warn-ink">
                              {s.failedAttempts} intento{s.failedAttempts > 1 ? "s" : ""} fallido{s.failedAttempts > 1 ? "s" : ""} · desde {day(s.pastDueSince)}
                            </div>
                          )}
                        </td>
                        <td className={`${td} whitespace-nowrap tabular-nums`}>{formatMoney(s.amount, s.currency)}</td>
                        <td className={`${td} whitespace-nowrap`}>{day(s.nextChargeOn)}</td>
                        <td className={`${td} whitespace-nowrap text-crm-ink-2`}>{s.card ?? "—"}</td>
                        <td className={`${td} text-right`}>
                          {(s.status === "past_due" || s.status === "suspended") && (
                            <button
                              disabled={busy !== null}
                              onClick={() => retry(s.id)}
                              className="h-9 whitespace-nowrap rounded-pill border border-crm-border-2 bg-crm-chip px-3.5 text-[13px] font-semibold text-crm-ink hover:border-crm-primary hover:text-crm-primary disabled:opacity-60"
                            >
                              {busy === s.id ? "Cobrando…" : "Reintentar cobro"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </PageBody>
  );
}
