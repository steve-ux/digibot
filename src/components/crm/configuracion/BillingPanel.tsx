"use client";

// Configuración → Suscripción con cobro automático (dLocal Go): plan, próximo cobro,
// tarjeta, historial de pagos, cambio de plan, pagar con otra tarjeta y cancelación.
// La tarjeta se carga en SmartFields (iframe de dLocal Go): nunca pasa por DigiBot.

import { useState } from "react";
import { HolderAndCard, payWithCard, postJson, useSmartFields, type Checkout, type Fields, type Holder } from "@/components/billing/card";
import { useCrmShell } from "@/components/crm/CrmShell";
import Icon from "@/components/crm/Icon";
import { Modal } from "@/components/crm/Modal";
import { useToast } from "@/components/crm/Toast";
import { formatMoney } from "@/lib/billing/config";
import type { BillingOverview, PaymentRowStatus, PlanOptionView } from "@/lib/billing/overview";
import type { BillingStatus } from "@/lib/billing/types";
import { accountApi } from "@/lib/crm/permissions";

const card = "rounded-card border border-crm-border bg-crm-card px-5 py-5 md:px-[22px]";
const chipButton =
  "flex h-[46px] items-center justify-center gap-2 rounded-pill border border-crm-border-2 bg-crm-chip px-5 font-poppins text-sm font-semibold text-crm-ink transition-colors hover:border-crm-primary hover:text-crm-primary disabled:cursor-not-allowed disabled:opacity-60";
const primaryButton =
  "flex h-[46px] items-center justify-center gap-2 rounded-pill bg-crm-primary px-[22px] font-poppins text-[15px] font-semibold text-white transition-colors hover:bg-crm-primary-hover disabled:cursor-not-allowed disabled:opacity-60";
const dangerButton =
  "flex h-[46px] items-center justify-center rounded-pill bg-crm-error px-6 font-poppins text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60";
const CARD_CLASSES = {
  input:
    "h-[46px] w-full rounded-field border border-crm-border-2 bg-crm-card px-3.5 text-[15px] text-crm-ink outline-none focus:border-crm-primary disabled:opacity-70",
  label: "mb-1.5 block text-[13px] font-semibold text-crm-ink-2",
  error: "mt-1 text-[13px] text-crm-error",
  cardBox: "flex min-h-[50px] flex-col justify-center rounded-field border border-crm-border-2 bg-crm-card px-3.5 py-2",
  hint: "mt-1.5 text-[13px] text-crm-muted",
};

const STATUS: Record<BillingStatus, { label: string; className: string }> = {
  incomplete: { label: "Sin confirmar", className: "border-crm-border-2 bg-crm-surf text-crm-muted" },
  active: { label: "Activa", className: "border-crm-success bg-crm-success-bg text-crm-success-ink" },
  past_due: { label: "Pago pendiente", className: "border-crm-warn-border bg-crm-warn-bg text-crm-warn-ink" },
  suspended: { label: "Suspendida", className: "border-crm-error-border bg-crm-error-bg text-crm-error" },
  cancelled: { label: "Cancelada", className: "border-crm-border-2 bg-crm-surf text-crm-muted" },
};

const PAYMENT_STATUS: Record<PaymentRowStatus, { label: string; className: string }> = {
  paid: { label: "Pagado", className: "bg-crm-success-bg text-crm-success-ink" },
  rejected: { label: "Rechazado", className: "bg-crm-error-bg text-crm-error" },
  pending: { label: "Procesando", className: "bg-crm-warn-bg text-crm-warn-ink" },
  review: { label: "En revisión", className: "bg-crm-warn-bg text-crm-warn-ink" },
};

const day = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";
const dateTime = (unix: number) => new Date(unix * 1000).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const brandName = (b: string) => ({ visa: "Visa", mastercard: "Mastercard", amex: "American Express", VI: "Visa", MC: "Mastercard" })[b] ?? b.charAt(0).toUpperCase() + b.slice(1);

export function BillingPanel({
  account,
  initial,
  billingLocked,
}: {
  account: { id: number; name: string };
  initial: BillingOverview;
  billingLocked: boolean;
}) {
  const toast = useToast();
  const [overview, setOverview] = useState(initial);
  const [plansOpen, setPlansOpen] = useState(false);
  const [confirm, setConfirm] = useState<PlanOptionView | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const sub = overview.subscription;
  const current = sub ? overview.plans.find((p) => p.planKey === sub.planKey) : null;

  const post = async (path: string, body: unknown, ok: string) => {
    setBusy(true);
    const res = await postJson<{ overview: BillingOverview }>(accountApi(account.id, path), body);
    setBusy(false);
    if (!res.ok) {
      toast(res.message, "error");
      return false;
    }
    setOverview(res.data.overview);
    toast(ok);
    return true;
  };

  if (!sub) {
    return (
      <div className="flex flex-col gap-4 pt-2">
        <div className={card}>
          <div className="text-[13px] font-semibold uppercase tracking-[1px] text-crm-muted">Tu plan</div>
          <div className="mt-0.5 font-poppins text-[26px] font-bold text-crm-ink">Sin plan</div>
          <p className="m-0 mt-1 text-sm text-crm-muted">Elegí un plan para empezar. Se cobra todos los meses el mismo día y podés cancelar cuando quieras.</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {overview.plans.map((p) => (
              <a key={p.planKey} href={`/suscripcion/${p.planKey}`} className={chipButton}>
                Elegir {p.name}
              </a>
            ))}
          </div>
        </div>
        <PaymentsHistory accountId={account.id} payments={overview.payments} />
      </div>
    );
  }

  const blocked = sub.status === "past_due" || sub.status === "suspended";
  const statusLine =
    sub.status === "cancelled"
      ? `Tu suscripción terminó el ${day(sub.periodEnd)}.`
      : sub.status === "suspended"
        ? "La cuenta está suspendida por falta de pago: el panel y el bot están pausados. Pagá con otra tarjeta y se reactiva al instante."
        : sub.status === "past_due"
          ? `No pudimos cobrar el último pago.${sub.suspendOn ? ` Si no se paga antes del ${day(sub.suspendOn)}, la cuenta se suspende.` : ""}`
          : sub.cancelAtPeriodEnd
            ? `Se cancela el ${day(sub.periodEnd)}. Hasta ese día seguís usando todo.`
            : `Próximo cobro: ${day(sub.nextChargeOn)} · ${formatMoney(sub.pendingPlan?.amount ?? sub.amount, sub.currency)}`;

  return (
    <div className="flex flex-col gap-4 pt-2">
      {/* Plan actual */}
      <div className={`${card} flex flex-col gap-4`}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-[220px] flex-1">
            <div className="text-[13px] font-semibold uppercase tracking-[1px] text-crm-muted">Tu plan</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
              <span className="font-poppins text-[26px] font-bold tracking-[-.5px] text-crm-ink">{sub.planName}</span>
              <span className={`rounded-pill border px-2.5 py-[3px] text-xs font-semibold ${STATUS[sub.status].className}`}>{STATUS[sub.status].label}</span>
            </div>
            <div className="text-sm text-crm-muted">
              <strong className="text-crm-ink">{formatMoney(sub.amount, sub.currency)}</strong> por mes
              {current?.tagline ? ` · ${current.tagline}` : ""}
            </div>
            <div className={`mt-1.5 text-sm font-semibold ${blocked ? "text-crm-warn-ink" : "text-crm-ink-2"}`}>{statusLine}</div>
            {sub.pendingPlan && sub.status === "active" && (
              <div className="mt-1.5 text-sm text-crm-ink-2">
                Desde el {day(sub.nextChargeOn)} pasás al plan <strong>{sub.pendingPlan.name}</strong> ({formatMoney(sub.pendingPlan.amount, sub.currency)}/mes).{" "}
                <button disabled={busy} onClick={() => post("suscripcion/plan", { planKey: sub.planKey }, `Seguís en el plan ${sub.planName}.`)} className="font-semibold text-crm-primary">
                  Seguir en {sub.planName}
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2.5">
            {blocked && (
              <button onClick={() => setCardOpen(true)} className={primaryButton}>
                <Icon name="card" size={18} />
                Pagar {formatMoney(sub.payWithNewCard.amount, sub.currency)}
              </button>
            )}
            {sub.status === "active" && !sub.cancelAtPeriodEnd && (
              <button onClick={() => setPlansOpen(true)} className={primaryButton}>
                <Icon name="chart" size={18} />
                Cambiar plan
              </button>
            )}
            {sub.status === "active" && sub.cancelAtPeriodEnd && (
              <button disabled={busy} onClick={() => post("suscripcion/cancelar", { cancel: false }, "Listo: tu suscripción sigue activa.")} className={primaryButton}>
                Seguir con mi plan
              </button>
            )}
            {sub.status === "cancelled" && (
              <a href={`/suscripcion/${sub.planKey}`} className={primaryButton}>
                Volver a suscribirme
              </a>
            )}
          </div>
        </div>
        {current && current.features.length > 0 && (
          <ul className="m-0 grid list-none gap-x-6 gap-y-1.5 border-t border-crm-border p-0 pt-4 text-sm text-crm-ink-2 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {current.features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Icon name="check" size={16} className="mt-0.5 shrink-0 text-crm-primary" />
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Método de pago */}
      {sub.status !== "cancelled" && (
        <div className={`${card} flex flex-wrap items-center gap-4`}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-crm-surf text-crm-ink-2">
            <Icon name="card" size={22} />
          </span>
          <div className="min-w-[200px] flex-1">
            <div className="text-[15px] font-semibold text-crm-ink">Método de pago</div>
            <div className="text-sm text-crm-muted">{sub.card ? `${brandName(sub.card.brand)} terminada en ${sub.card.last4}` : "Tarjeta guardada en dLocal Go"}</div>
          </div>
          <button onClick={() => setCardOpen(true)} className={chipButton}>
            Pagar con otra tarjeta
          </button>
          <p className="m-0 flex w-full items-start gap-1.5 text-xs leading-[1.4] text-crm-muted">
            <Icon name="lock" size={14} className="mt-px shrink-0" />
            {blocked
              ? "Pagás la deuda con la tarjeta nueva y queda guardada para los próximos cobros."
              : `Para cambiar la tarjeta se adelanta el próximo mes (${formatMoney(sub.payWithNewCard.amount, sub.currency)}): la nueva queda guardada para los cobros siguientes.`}{" "}
            Los datos se cargan en el campo seguro de dLocal Go y nunca pasan por DigiBot.
          </p>
        </div>
      )}

      <PaymentsHistory accountId={account.id} payments={overview.payments} />

      {/* Cancelar */}
      {sub.status === "active" && !sub.cancelAtPeriodEnd && !billingLocked && (
        <div className="flex flex-wrap items-center gap-3 px-1">
          <p className="m-0 min-w-[220px] flex-1 text-[13px] text-crm-muted">
            Si cancelás, seguís usando el panel y el bot hasta el {day(sub.periodEnd)} y no se cobra más.
          </p>
          <button onClick={() => setCancelOpen(true)} className={dangerButton}>
            Cancelar suscripción
          </button>
        </div>
      )}

      {/* Cambiar plan */}
      <Modal open={plansOpen} onClose={() => setPlansOpen(false)} title="Cambiá tu plan" description="La mejora se cobra hoy, proporcional a los días que quedan. La baja rige desde el próximo cobro." maxWidth={900}>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
          {overview.plans.map((p) => (
            <div key={p.planKey} className={`flex flex-col gap-3 rounded-card border p-5 ${p.change.kind === "current" ? "border-crm-primary" : "border-crm-border"} bg-crm-card`}>
              <div>
                <div className="font-poppins text-lg font-bold text-crm-ink">{p.name}</div>
                <div className="text-[13px] text-crm-muted">{p.tagline}</div>
              </div>
              <div className="font-poppins text-[24px] font-bold text-crm-ink">
                {p.amount !== null && p.currency ? formatMoney(p.amount, p.currency) : "-"}
                <span className="text-sm font-semibold text-crm-muted">/mes</span>
              </div>
              <ul className="m-0 flex flex-1 list-none flex-col gap-1.5 p-0 text-[13px] text-crm-ink-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Icon name="check" size={14} className="mt-0.5 shrink-0 text-crm-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <PlanAction option={p} onPick={() => setConfirm(p)} />
            </div>
          ))}
        </div>
      </Modal>

      {/* Confirmar cambio */}
      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.change.kind === "upgrade" ? `¿Pasar al plan ${confirm.name}?` : `¿Bajar al plan ${confirm?.name}?`}
        maxWidth={500}
        footer={
          <div className="flex flex-wrap justify-end gap-2.5">
            <button onClick={() => setConfirm(null)} className={chipButton}>
              Mejor no
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                if (!confirm) return;
                const done = await post(
                  "suscripcion/plan",
                  { planKey: confirm.planKey },
                  confirm.change.kind === "upgrade" ? `¡Listo! Ya estás en el plan ${confirm.name}.` : `Listo: desde el próximo cobro pasás al plan ${confirm.name}.`
                );
                if (done) {
                  setConfirm(null);
                  setPlansOpen(false);
                }
              }}
              className={confirm?.change.kind === "upgrade" ? primaryButton : dangerButton}
            >
              {busy ? "Procesando…" : confirm?.change.kind === "upgrade" ? "Confirmar y pagar" : "Confirmar la baja"}
            </button>
          </div>
        }
      >
        {confirm?.change.kind === "upgrade" && (
          <p className="m-0 text-sm text-crm-ink-2">
            Hoy se cobra <strong>{formatMoney(confirm.change.chargeToday, sub.currency)}</strong> (la diferencia por los días que quedan del período) con{" "}
            {sub.card ? `tu ${brandName(sub.card.brand)} terminada en ${sub.card.last4}` : "tu tarjeta guardada"}. Desde el {day(sub.nextChargeOn)} pagás{" "}
            {confirm.amount !== null ? formatMoney(confirm.amount, sub.currency) : ""} por mes.
          </p>
        )}
        {confirm?.change.kind === "downgrade" && (
          <div className="text-sm text-crm-ink-2">
            <p className="m-0">
              Hoy no se cobra nada. Seguís con {sub.planName} hasta el {day(confirm.change.effectiveOn)} y desde ese cobro pagás{" "}
              {confirm.amount !== null ? formatMoney(confirm.amount, sub.currency) : ""} por mes.
            </p>
            {confirm.change.lost.length > 0 && (
              <>
                <p className="mb-1.5 mt-3 font-semibold text-crm-ink">Vas a dejar de tener:</p>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {confirm.change.lost.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-crm-error">
                      <Icon name="x" size={14} className="mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Cancelar */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="¿Cancelar la suscripción?"
        description={`Seguís usando todo hasta el ${day(sub.periodEnd)}. Después el panel y el bot se pausan y no se cobra más.`}
        maxWidth={480}
        footer={
          <div className="flex flex-wrap justify-end gap-2.5">
            <button onClick={() => setCancelOpen(false)} className={chipButton}>
              Mejor no
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                if (await post("suscripcion/cancelar", { cancel: true }, "Listo: la suscripción se cancela al fin del período.")) setCancelOpen(false);
              }}
              className={dangerButton}
            >
              Cancelar al fin del período
            </button>
          </div>
        }
      >
        <p className="m-0 text-sm text-crm-muted">Podés arrepentirte hasta ese día. Tus conversaciones y datos quedan guardados.</p>
      </Modal>

      {cardOpen && <NewCardModal accountId={account.id} amount={sub.payWithNewCard.amount} currency={sub.currency} blocked={blocked} onClose={() => setCardOpen(false)} />}
    </div>
  );
}

function PlanAction({ option, onPick }: { option: PlanOptionView; onPick: () => void }) {
  const muted = "flex h-[46px] items-center justify-center rounded-pill bg-crm-surf px-3 text-center text-sm font-semibold text-crm-muted";
  switch (option.change.kind) {
    case "current":
      return <div className={muted}>Tu plan actual</div>;
    case "unavailable":
      return <div className={muted}>No disponible en tu país</div>;
    case "pending_downgrade":
      return <div className={muted}>Programado para el {day(option.change.effectiveOn)}</div>;
    case "upgrade":
      return (
        <button onClick={onPick} className={primaryButton}>
          Mejorar · hoy {option.currency ? formatMoney(option.change.chargeToday, option.currency) : ""}
        </button>
      );
    case "downgrade":
      return (
        <button onClick={onPick} className={chipButton}>
          Bajar a {option.name}
        </button>
      );
  }
}

function PaymentsHistory({ accountId, payments }: { accountId: number; payments: BillingOverview["payments"] }) {
  return (
    <div className={card}>
      <div className="flex items-center gap-2.5">
        <Icon name="clock" size={20} className="text-crm-ink-2" />
        <h3 className="m-0 font-poppins text-[17px] font-semibold text-crm-ink">Historial de pagos</h3>
      </div>
      {payments.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-crm-muted">Todavía no hay pagos.</p>
      ) : (
        <ul className="m-0 mt-3 flex list-none flex-col p-0">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-crm-border py-3 first:border-t-0">
              <span className="w-[86px] shrink-0 text-[13px] tabular-nums text-crm-muted">{dateTime(p.date)}</span>
              <span className="min-w-[180px] flex-1 text-sm text-crm-ink">
                {p.concept}
                {p.detail && <span className="block text-[13px] text-crm-error">{p.detail}</span>}
              </span>
              <span className="text-sm font-semibold tabular-nums text-crm-ink">{formatMoney(p.amount, p.currency)}</span>
              <span className={`rounded-pill px-2.5 py-[3px] text-xs font-semibold ${PAYMENT_STATUS[p.status].className}`}>{PAYMENT_STATUS[p.status].label}</span>
              <span className="flex w-[132px] justify-end">
                {p.status === "paid" && (
                  <a
                    href={accountApi(accountId, `suscripcion/pagos/${p.id}/comprobante`)}
                    download
                    title={p.invoiceRef ? `Comprobante del pago · Factura ${p.invoiceRef}` : "Descargar el comprobante del pago (PDF)"}
                    className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-pill border border-crm-border-2 bg-crm-chip px-3 text-[13px] font-semibold text-crm-ink transition-colors hover:border-crm-primary hover:text-crm-primary"
                  >
                    <Icon name="clip" size={14} />
                    Comprobante
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewCardModal({
  accountId,
  amount,
  currency,
  blocked,
  onClose,
}: {
  accountId: number;
  amount: number;
  currency: string;
  blocked: boolean;
  onClose: () => void;
}) {
  const { user } = useCrmShell();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [starting, setStarting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({});
  const [holder, setHolder] = useState<Holder>({ firstName: "", lastName: "", documentType: "", document: "", email: user.email ?? "" });
  const cardField = useSmartFields(checkout);

  const start = async () => {
    setStarting(true);
    setError(null);
    const res = await postJson<{ checkout: Checkout }>(accountApi(accountId, "suscripcion/tarjeta"), {});
    setStarting(false);
    if (!res.ok) setError(res.message);
    else setCheckout(res.data.checkout);
  };

  const pay = async () => {
    if (!checkout) return;
    setPaying(true);
    setError(null);
    setFields({});
    const res = await payWithCard(checkout, holder, cardField);
    if (!res.ok) {
      setError(res.message);
      setFields(res.fields);
      setPaying(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Pagar con otra tarjeta"
      description={
        blocked
          ? `Pagás ${formatMoney(amount, currency)} de la deuda y la tarjeta queda guardada para los próximos cobros.`
          : `Se adelanta el próximo mes (${formatMoney(amount, currency)}) y la tarjeta nueva queda guardada para los cobros siguientes.`
      }
      maxWidth={560}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <button onClick={onClose} className={chipButton} disabled={paying}>
            Cerrar
          </button>
          {checkout ? (
            <button onClick={pay} disabled={paying || !cardField.ready} className={primaryButton}>
              {paying ? "Procesando…" : `Pagar ${formatMoney(checkout.amount, checkout.currency)}`}
            </button>
          ) : (
            <button onClick={start} disabled={starting} className={primaryButton}>
              {starting ? "Preparando…" : "Continuar"}
            </button>
          )}
        </div>
      }
    >
      {checkout ? (
        <HolderAndCard country={checkout.country} holder={holder} setHolder={setHolder} fields={fields} card={cardField} disabled={paying} classes={CARD_CLASSES} />
      ) : (
        <p className="m-0 text-sm text-crm-ink-2">
          Vas a cargar la tarjeta en el campo seguro de dLocal Go. Si el banco pide validarla (3DS), te lleva a su página y volvés solo.
        </p>
      )}
      {error && (
        <div role="alert" className="mt-4 rounded-field border border-crm-error-border bg-crm-error-bg px-3.5 py-2.5 text-sm font-semibold text-crm-error">
          {error}
        </div>
      )}
    </Modal>
  );
}
