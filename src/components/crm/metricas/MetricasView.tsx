"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCrmShell } from "@/components/crm/CrmShell";
import PageHeader, { PageBody } from "@/components/crm/PageHeader";
import { avatarColor, CHANNELS, initialsOf, type ChannelId } from "@/lib/crm/channels";
import { DEMO_TEAMMATES } from "@/lib/crm/demo-data";
import { demoMetricsMessages } from "@/lib/crm/demo-metrics";
import {
  computeMetrics,
  formatDuration,
  METRICS_PERIODS,
  type Delta,
  type MetricsPeriod,
  type MetricsReport,
} from "@/lib/crm/metrics";
import { accountApi, accountPath } from "@/lib/crm/permissions";

export type MetricsLoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; report: MetricsReport };

// Orden de apilado y de la leyenda: probado para que dos colores vecinos se
// distingan también con daltonismo (el azul de Facebook nunca al lado del violeta de Messenger).
const STACK_ORDER: ChannelId[] = ["wa", "ig", "fbc", "igc", "fb", "th"];

const TONE_CLASS: Record<Delta["tone"], string> = {
  good: "text-crm-success-ink",
  bad: "text-crm-warn-ink",
  neutral: "text-crm-muted",
};

const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

export default function MetricasView(props: {
  accountId: number;
  initialPeriod: MetricsPeriod;
  initialState: MetricsLoadState;
}) {
  const { demo } = useCrmShell();
  return <Metricas key={demo ? "demo" : "real"} {...props} demo={demo} />;
}

function Metricas({
  accountId,
  initialPeriod,
  initialState,
  demo,
}: {
  accountId: number;
  initialPeriod: MetricsPeriod;
  initialState: MetricsLoadState;
  demo: boolean;
}) {
  const { user, setDemo } = useCrmShell();
  const [period, setPeriod] = useState<MetricsPeriod>(initialPeriod);
  const [state, setState] = useState<MetricsLoadState>(demo ? { kind: "loading" } : initialState);
  const [refreshing, setRefreshing] = useState(false);
  const firstLoad = useRef(true);

  // Demo: ~60 días de actividad de ejemplo, calculados con el mismo código que los datos reales.
  const demoMessages = useMemo(() => {
    if (!demo) return null;
    const team = [
      { name: user.name, weight: 4, speed: 75 },
      { name: DEMO_TEAMMATES[0]?.name ?? "Sofía Rivas", weight: 3, speed: 130 },
      { name: DEMO_TEAMMATES[1]?.name ?? "Diego Paz", weight: 2, speed: 190 },
    ];
    return demoMetricsMessages(Math.floor(Date.now() / 1000), team);
  }, [demo, user.name]);

  useEffect(() => {
    if (demoMessages) {
      setState({
        kind: "ready",
        report: computeMetrics({ period, now: Math.floor(Date.now() / 1000), messages: demoMessages, waitingNow: 5 }),
      });
      return;
    }
    // El primer período ya llegó calculado desde el server.
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    let cancelled = false;
    setRefreshing(true);
    fetch(`${accountApi(accountId, "metricas")}?periodo=${period}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setState(res.ok ? { kind: "ready", report: data.report } : { kind: "error", message: data.message || "No se pudieron cargar las métricas." });
      })
      .catch(() => !cancelled && setState({ kind: "error", message: "No se pudo conectar con el servidor." }))
      .finally(() => !cancelled && setRefreshing(false));
    return () => {
      cancelled = true;
    };
  }, [period, demoMessages, accountId]);

  const choose = (next: MetricsPeriod) => {
    setPeriod(next);
    const url = new URL(window.location.href);
    url.searchParams.set("periodo", next);
    window.history.replaceState(window.history.state, "", url);
  };

  const report = state.kind === "ready" ? state.report : null;
  const empty = report !== null && report.conversations === 0 && report.waitingNow === 0 && !demo;

  return (
    <PageBody maxWidth={1200}>
      <PageHeader
        title="Métricas"
        description="Cómo vienen respondiendo tu equipo y DigiBot en todos los canales."
        actions={
          <div
            role="group"
            aria-label="Período"
            className="flex gap-0.5 rounded-pill border border-crm-border bg-crm-card p-1"
          >
            {METRICS_PERIODS.map((p) => (
              <button
                key={p.id}
                aria-pressed={period === p.id}
                onClick={() => choose(p.id)}
                className={`h-9 rounded-pill px-4 text-sm font-semibold transition-colors ${
                  period === p.id ? "bg-crm-primary text-white" : "text-crm-ink-2 hover:text-crm-primary"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {demo && (
        <div className="flex items-center gap-2 rounded-field border border-dashed border-crm-warn-border bg-crm-warn-soft px-3 py-2 text-xs text-crm-warn-ink">
          <span className="h-2 w-2 shrink-0 rounded-full bg-crm-warn" />
          <span className="flex-1">
            <strong>Demo:</strong> son datos de ejemplo para ver cómo se ve con movimiento.
          </span>
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-card border border-crm-error-border bg-crm-error-bg px-5 py-4 text-sm text-crm-error-ink">
          {state.message}
        </div>
      )}

      {state.kind === "loading" && <MetricsSkeleton />}

      {empty && (
        <div className="rounded-card border border-dashed border-crm-border-2 bg-crm-card px-6 py-12 text-center">
          <div className="font-poppins text-base font-semibold text-crm-ink">Todavía no hay movimiento en este período</div>
          <p className="mx-auto mb-0 mt-1.5 max-w-[360px] text-sm text-crm-muted">
            Cuando tus clientes escriban por los canales conectados, acá vas a ver cuántos llegan y qué tan rápido responden.
          </p>
          <button
            onClick={() => setDemo(true)}
            className="mt-4 h-10 rounded-pill border border-crm-border-2 bg-crm-chip px-4 text-sm font-semibold text-crm-ink hover:border-crm-primary hover:text-crm-primary"
          >
            Ver cómo se ve con datos de ejemplo
          </button>
        </div>
      )}

      {report && !empty && (
        <div className={`flex flex-col gap-[22px] transition-opacity ${refreshing ? "opacity-60" : ""}`} aria-busy={refreshing}>
          <Kpis report={report} accountId={accountId} />
          <ChannelBars report={report} />
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]">
            <WhoAnswered report={report} />
            <TeamTable report={report} />
          </div>
        </div>
      )}
    </PageBody>
  );
}

// ---------- KPIs ----------

function Kpis({ report, accountId }: { report: MetricsReport; accountId: number }) {
  const cards: { label: string; value: string; delta: React.ReactNode }[] = [
    { label: "Conversaciones", value: report.conversations.toLocaleString("es-AR"), delta: <DeltaText delta={report.conversationsDelta} /> },
    {
      label: "Resueltas por DigiBot",
      value: report.botResolvedPct === null ? "—" : `${report.botResolvedPct}%`,
      delta: <DeltaText delta={report.botResolvedDelta} />,
    },
    {
      label: "Primera respuesta, promedio",
      value: formatDuration(report.firstResponseSeconds),
      delta: <DeltaText delta={report.firstResponseDelta} />,
    },
    {
      label: "Esperando respuesta ahora",
      value: String(report.waitingNow),
      delta:
        report.waitingNow > 0 ? (
          <Link
            href={`${accountPath(accountId, "conversaciones")}?estado=pending`}
            className="font-semibold text-crm-warn-ink underline-offset-2 hover:underline"
          >
            Revisalas en la Bandeja →
          </Link>
        ) : (
          <span className="text-crm-success-ink">Nadie esperando</span>
        ),
    },
  ];
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
      {cards.map((k) => (
        <div key={k.label} className="rounded-card border border-crm-border bg-crm-card px-[22px] py-5">
          <div className="text-sm font-medium text-crm-muted">{k.label}</div>
          <div className="mt-2 font-poppins text-[34px] font-bold leading-tight tracking-[-1px] text-crm-ink">{k.value}</div>
          <div className="mt-1 min-h-[20px] text-[13px] font-semibold">{k.delta}</div>
        </div>
      ))}
    </div>
  );
}

function DeltaText({ delta }: { delta: Delta | null }) {
  if (!delta) return null;
  return <span className={TONE_CLASS[delta.tone]}>{delta.text}</span>;
}

// ---------- Conversaciones por canal (barras apiladas) ----------

function ChannelBars({ report }: { report: MetricsReport }) {
  const [asTable, setAsTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...report.bars.map((b) => b.total));
  const many = report.bars.length > 12;
  // Solo los canales que tuvieron algo en el período (si no hay nada, todos).
  const used = STACK_ORDER.filter((c) => report.byChannel[c] > 0);
  const channels = used.length ? used : STACK_ORDER;

  return (
    <section aria-labelledby="bars-title" className="min-w-0 rounded-card border border-crm-border bg-crm-card p-[22px]">
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="bars-title" className="m-0 flex-1 font-poppins text-[17px] font-semibold text-crm-ink">
          Conversaciones por canal
        </h2>
        <ul className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1.5 p-0" aria-label="Canales">
          {channels.map((c) => (
            <li key={c} className="flex items-center gap-1.5 text-[13px] text-crm-ink-2">
              <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: CHANNELS[c].color }} />
              {CHANNELS[c].name}
            </li>
          ))}
        </ul>
        <button
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="h-9 rounded-pill border border-crm-border bg-crm-chip px-3.5 text-[13px] font-semibold text-crm-ink-2 hover:border-crm-primary hover:text-crm-primary"
        >
          {asTable ? "Ver gráfico" : "Ver como tabla"}
        </button>
      </div>

      {asTable ? (
        <div className="crm-scroll overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-right text-[13px]">
            <thead>
              <tr className="text-xs font-bold tracking-[.4px] text-crm-muted">
                <th scope="col" className="py-2 text-left font-bold">
                  {report.period === "today" ? "HORA" : "DÍA"}
                </th>
                {channels.map((c) => (
                  <th key={c} scope="col" className="px-2 py-2 font-bold">
                    {CHANNELS[c].name.toUpperCase()}
                  </th>
                ))}
                <th scope="col" className="py-2 font-bold">
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {report.bars.map((b) => (
                <tr key={b.title} className="border-t border-crm-border text-crm-ink">
                  <th scope="row" className="py-2 text-left font-semibold">
                    {b.title}
                  </th>
                  {channels.map((c) => (
                    <td key={c} className="px-2 py-2 tabular-nums">
                      {b.byChannel[c]}
                    </td>
                  ))}
                  <td className="py-2 font-semibold tabular-nums">{b.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <div
            className="flex h-[240px] items-end border-b border-crm-border"
            style={{ gap: many ? "clamp(2px,0.6vw,6px)" : "clamp(6px,2vw,22px)" }}
            onMouseLeave={() => setHover(null)}
          >
            {report.bars.map((b, i) => {
              const h = b.total ? Math.max(4, Math.round((b.total / max) * 190)) : 0;
              const showLabel = !many || i % 5 === 0 || i === report.bars.length - 1;
              const detail = channels
                .filter((c) => b.byChannel[c] > 0)
                .map((c) => `${CHANNELS[c].name}: ${b.byChannel[c]}`)
                .join(", ");
              return (
                <button
                  key={b.title}
                  type="button"
                  aria-label={`${b.title}: ${b.total} conversaciones${detail ? ` (${detail})` : ""}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-crm-primary"
                >
                  {!many && b.total > 0 && <span className="text-xs font-semibold text-crm-muted">{b.total}</span>}
                  <span
                    className={`flex w-full flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px] transition-opacity ${
                      hover !== null && hover !== i ? "opacity-50" : ""
                    }`}
                    style={{ height: h, maxWidth: many ? 22 : 46 }}
                  >
                    {channels.map((c) =>
                      b.byChannel[c] > 0 ? (
                        <span key={c} style={{ flex: b.byChannel[c], background: CHANNELS[c].color, minHeight: 2 }} />
                      ) : null
                    )}
                  </span>
                  <span className="pointer-events-none absolute -bottom-6 whitespace-nowrap text-xs text-crm-muted">
                    {showLabel ? b.label : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="h-7" aria-hidden />
          {hover !== null && <BarTooltip report={report} index={hover} channels={channels} />}
        </div>
      )}
    </section>
  );
}

function BarTooltip({ report, index, channels }: { report: MetricsReport; index: number; channels: ChannelId[] }) {
  const b = report.bars[index];
  const left = ((index + 0.5) / report.bars.length) * 100;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute top-0 z-10 w-[190px] rounded-[12px] border border-crm-border bg-crm-card px-3.5 py-3 text-[13px] shadow-[0_12px_32px_-12px_rgba(0,0,0,.3)]"
      // Al costado de la barra (nunca encima): a la derecha, o a la izquierda si está cerca del borde.
      style={{ left: left < 60 ? `calc(${left}% + 18px)` : `calc(${left}% - 208px)` }}
    >
      <div className="mb-1.5 font-semibold text-crm-ink">{b.title}</div>
      {channels.map((c) => (
        <div key={c} className="flex items-center gap-2 py-px text-crm-ink-2">
          <span aria-hidden className="h-2 w-2 rounded-[2px]" style={{ background: CHANNELS[c].color }} />
          <span className="flex-1">{CHANNELS[c].name}</span>
          <span className="font-semibold tabular-nums text-crm-ink">{b.byChannel[c]}</span>
        </div>
      ))}
      <div className="mt-1.5 flex border-t border-crm-border pt-1.5 font-semibold text-crm-ink">
        <span className="flex-1">Total</span>
        <span className="tabular-nums">{b.total}</span>
      </div>
    </div>
  );
}

// ---------- Quién respondió + participación por canal ----------

function WhoAnswered({ report }: { report: MetricsReport }) {
  const answered = report.split.bot + report.split.team;
  const botPct = pct(report.split.bot, answered);
  const teamPct = answered ? 100 - botPct : 0;
  const total = Object.values(report.byChannel).reduce((a, b) => a + b, 0);

  return (
    <section aria-labelledby="who-title" className="rounded-card border border-crm-border bg-crm-card p-[22px]">
      <h2 id="who-title" className="m-0 mb-[18px] font-poppins text-[17px] font-semibold text-crm-ink">
        Quién respondió
      </h2>
      {answered === 0 ? (
        <p className="m-0 text-sm text-crm-muted">Todavía no hubo respuestas en este período.</p>
      ) : (
        <>
          <div
            className="flex h-3.5 gap-[3px] overflow-hidden rounded-pill"
            role="img"
            aria-label={`DigiBot respondió solo el ${botPct}% de las conversaciones; tu equipo, el ${teamPct}%`}
          >
            {report.split.bot > 0 && <div className="bg-crm-primary" style={{ flex: report.split.bot }} />}
            {report.split.team > 0 && <div style={{ flex: report.split.team, background: "var(--crm-accent, #66FF99)" }} />}
          </div>
          <div className="mt-4 flex flex-wrap gap-6">
            <div>
              <div className="font-poppins text-2xl font-bold text-crm-ink">{botPct}%</div>
              <div className="flex items-center gap-1.5 text-[13px] text-crm-muted">
                <span aria-hidden className="h-2 w-2 rounded-full bg-crm-primary" />
                DigiBot, sin ayuda · {report.split.bot}
              </div>
            </div>
            <div>
              <div className="font-poppins text-2xl font-bold text-crm-ink">{teamPct}%</div>
              <div className="flex items-center gap-1.5 text-[13px] text-crm-muted">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: "var(--crm-accent, #66FF99)" }} />
                Tu equipo · {report.split.team}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="mt-5 border-t border-crm-border pt-4">
        <h3 className="m-0 mb-3 text-xs font-bold tracking-[.8px] text-crm-muted">POR CANAL</h3>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {STACK_ORDER.map((c) => {
            const share = pct(report.byChannel[c], total);
            return (
              <li key={c} className="flex items-center gap-2.5">
                <img src={CHANNELS[c].icon} alt="" width={22} height={22} className="block shrink-0" />
                <span className="w-[118px] shrink-0 truncate text-sm text-crm-ink">{CHANNELS[c].name}</span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-crm-surf" aria-hidden>
                  <span className="block h-full rounded-pill" style={{ width: `${share}%`, background: CHANNELS[c].color }} />
                </span>
                <span className="min-w-[74px] shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-crm-ink">
                  {share}% <span className="font-normal text-crm-muted">· {report.byChannel[c]}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ---------- Equipo ----------

function TeamTable({ report }: { report: MetricsReport }) {
  return (
    <section aria-labelledby="team-title" className="min-w-0 rounded-card border border-crm-border bg-crm-card p-[22px]">
      <h2 id="team-title" className="m-0 mb-2.5 font-poppins text-[17px] font-semibold text-crm-ink">
        Tu equipo
      </h2>
      {report.team.length === 0 ? (
        <p className="m-0 text-sm text-crm-muted">
          Nadie del equipo respondió en este período: DigiBot se encargó de todo.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="hidden sm:table-header-group">
            <tr className="text-xs font-bold tracking-[.4px] text-crm-muted">
              <th scope="col" className="py-2 text-left font-bold">PERSONA</th>
              <th scope="col" className="py-2 text-right font-bold">ATENDIDAS</th>
              <th scope="col" className="py-2 text-right font-bold">RESPONDE EN</th>
              <th scope="col" className="py-2 text-right font-bold">RESUELTAS</th>
            </tr>
          </thead>
          <tbody>
            {report.team.map((t, i) => (
              <tr key={t.name} className="flex flex-wrap items-center border-t border-crm-border py-3 sm:table-row sm:py-0">
                <th scope="row" className="flex w-full min-w-0 items-center gap-2.5 py-0 text-left font-semibold text-crm-ink sm:table-cell sm:w-auto sm:py-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: avatarColor(i * 2) }}
                    >
                      {initialsOf(t.name)}
                    </span>
                    <span className="truncate">{t.name}</span>
                  </span>
                </th>
                <TeamCell label="Atendidas" value={String(t.handled)} />
                <TeamCell label="Responde en" value={formatDuration(t.avgResponseSeconds)} />
                <TeamCell label="Resueltas" value={String(t.resolved)} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// En mobile cada persona es una tarjeta: el dato lleva su etiqueta al lado.
function TeamCell({ label, value }: { label: string; value: string }) {
  return (
    <td className="mt-2 flex-1 text-left tabular-nums text-crm-ink sm:mt-0 sm:py-3 sm:text-right">
      <span className="block text-[11px] font-bold tracking-[.4px] text-crm-muted sm:hidden">{label.toUpperCase()}</span>
      {value}
    </td>
  );
}

function MetricsSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-[22px]">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[132px] animate-pulse rounded-card bg-crm-surf" />
        ))}
      </div>
      <div className="h-[330px] animate-pulse rounded-card bg-crm-surf" />
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]">
        <div className="h-[300px] animate-pulse rounded-card bg-crm-surf" />
        <div className="h-[300px] animate-pulse rounded-card bg-crm-surf" />
      </div>
    </div>
  );
}

