"use client";

// Configuración → Suscripción (solo quien administra la cuenta): plan actual,
// mejorar plan, método de pago y cancelar.
//
// Los cobros van a ser con dLocal Go: la tarjeta la carga el cliente en su
// página segura y nunca pasa por DigiBot. Hasta tener la integración aprobada
// (ONLINE_BILLING = false), los cambios se piden por WhatsApp a soporte.

import { useState } from "react";
import Icon from "@/components/crm/Icon";
import { Modal } from "@/components/crm/Modal";
import type { SubscriptionStatus } from "@/lib/crm/subscription";
import { waLink } from "@/lib/whatsapp";

const ONLINE_BILLING = false;

export interface PlanOption {
  planKey: string;
  name: string;
  tagline: string;
  price: string;
  currency: string;
  billingPeriod: string;
  featured: boolean;
  features: string[];
}

export interface SubscriptionView {
  planKey: string;
  status: SubscriptionStatus;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  paymentMethod: { brand: string; last4: string } | null;
}

const card = "rounded-card border border-crm-border bg-crm-card px-5 py-5 md:px-[22px]";
const chipButton =
  "flex h-[46px] items-center justify-center gap-2 rounded-pill border border-crm-border-2 bg-crm-chip px-5 font-poppins text-sm font-semibold text-crm-ink transition-colors hover:border-crm-primary hover:text-crm-primary";
const primaryButton =
  "flex h-[46px] items-center justify-center gap-2 rounded-pill bg-crm-primary px-[22px] font-poppins text-[15px] font-semibold text-white transition-colors hover:bg-crm-primary-hover";

const STATUS: Record<SubscriptionStatus, { label: string; className: string }> = {
  active: { label: "Activa", className: "border-crm-success bg-crm-success-bg text-crm-success-ink" },
  trial: { label: "Prueba gratis", className: "border-crm-tint-border bg-crm-tint text-crm-primary" },
  past_due: { label: "Pago pendiente", className: "border-crm-warn-border bg-crm-warn-bg text-crm-warn-ink" },
  canceled: { label: "Cancelada", className: "border-crm-border-2 bg-crm-surf text-crm-muted" },
};

function formatDay(unix: number | null) {
  if (!unix) return null;
  return new Date(unix * 1000).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

// Datos de ejemplo para el modo demo.
export function demoSubscription(): SubscriptionView {
  return {
    planKey: "premium",
    status: "active",
    currentPeriodEnd: Math.floor(Date.now() / 1000) + 18 * 86400,
    cancelAtPeriodEnd: false,
    paymentMethod: { brand: "Visa", last4: "4242" },
  };
}

export function SubscriptionPanel({
  account,
  subscription,
  plans,
}: {
  account: { id: number; name: string };
  subscription: SubscriptionView | null;
  plans: PlanOption[];
}) {
  const [plansOpen, setPlansOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const current = subscription ? plans.find((p) => p.planKey === subscription.planKey) ?? null : null;
  const active = subscription && subscription.status !== "canceled";
  const periodEnd = formatDay(subscription?.currentPeriodEnd ?? null);
  const who = `${account.name} (cuenta #${account.id})`;

  const renewal = !subscription
    ? null
    : subscription.status === "canceled"
      ? periodEnd && `Terminó el ${periodEnd}`
      : subscription.cancelAtPeriodEnd
        ? periodEnd && `Se cancela el ${periodEnd}. Hasta ese día seguís usando todo.`
        : subscription.status === "trial"
          ? periodEnd && `La prueba termina el ${periodEnd}`
          : subscription.status === "past_due"
            ? "No pudimos cobrar el último pago. Revisá tu método de pago."
            : periodEnd && `Próximo cobro: ${periodEnd}`;

  return (
    <div className="flex flex-col gap-4 pt-2">
      {/* Plan actual */}
      <div className={`${card} flex flex-col gap-4`}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-[220px] flex-1">
            <div className="text-[13px] font-semibold uppercase tracking-[1px] text-crm-muted">Tu plan</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
              <span className="font-poppins text-[26px] font-bold tracking-[-.5px] text-crm-ink">
                {current?.name ?? (subscription ? subscription.planKey : "Sin plan")}
              </span>
              {subscription && (
                <span className={`rounded-pill border px-2.5 py-[3px] text-xs font-semibold ${STATUS[subscription.status].className}`}>
                  {STATUS[subscription.status].label}
                </span>
              )}
            </div>
            {current && (
              <div className="text-sm text-crm-muted">
                <strong className="text-crm-ink">{current.price}</strong> {current.currency}
                {current.billingPeriod} · {current.tagline}
              </div>
            )}
            {!subscription && (
              <div className="text-sm text-crm-muted">Todavía no tenés un plan asignado. Elegí uno para empezar.</div>
            )}
            {renewal && <div className="mt-1.5 text-sm font-semibold text-crm-ink-2">{renewal}</div>}
          </div>
          <button onClick={() => setPlansOpen(true)} className={primaryButton}>
            <Icon name="chart" size={18} />
            {subscription ? "Mejorar plan" : "Elegir plan"}
          </button>
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
      <div className={`${card} flex flex-wrap items-center gap-4`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-crm-surf text-crm-ink-2">
          <Icon name="card" size={22} />
        </span>
        <div className="min-w-[200px] flex-1">
          <div className="text-[15px] font-semibold text-crm-ink">Método de pago</div>
          <div className="text-sm text-crm-muted">
            {subscription?.paymentMethod
              ? `${subscription.paymentMethod.brand} terminada en ${subscription.paymentMethod.last4}`
              : "Todavía no cargaste un método de pago."}
          </div>
        </div>
        <button
          disabled={!ONLINE_BILLING}
          title={ONLINE_BILLING ? undefined : "Muy pronto"}
          className="h-[46px] cursor-not-allowed rounded-pill bg-crm-surf px-5 font-poppins text-sm font-semibold text-crm-muted"
        >
          {subscription?.paymentMethod ? "Cambiar tarjeta" : "Agregar método de pago"}
        </button>
        <p className="m-0 flex w-full items-start gap-1.5 text-xs leading-[1.4] text-crm-muted">
          <Icon name="lock" size={14} className="mt-px shrink-0" />
          {ONLINE_BILLING
            ? "La tarjeta se carga en la página segura de dLocal Go: tus datos nunca pasan por DigiBot."
            : "Muy pronto vas a poder cargar tu tarjeta acá, en la página segura de dLocal Go (tus datos nunca pasan por DigiBot). Mientras tanto, los pagos los coordinamos por WhatsApp."}
        </p>
      </div>

      {/* Cancelar */}
      {subscription && subscription.status !== "canceled" && !subscription.cancelAtPeriodEnd && (
        <div className="flex flex-wrap items-center gap-3 px-1">
          <p className="m-0 min-w-[220px] flex-1 text-[13px] text-crm-muted">
            Si cancelás, seguís usando el panel y el bot hasta el final del período que ya pagaste.
          </p>
          <button
            onClick={() => setCancelOpen(true)}
            className="flex h-[46px] items-center rounded-pill bg-crm-error px-6 font-poppins text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Cancelar suscripción
          </button>
        </div>
      )}

      <Modal
        open={plansOpen}
        onClose={() => setPlansOpen(false)}
        title={subscription ? "Mejorá tu plan" : "Elegí tu plan"}
        description={
          ONLINE_BILLING
            ? "El cambio se cobra proporcional a los días que quedan del mes."
            : "Por ahora el cambio de plan lo hacemos nosotros: elegí uno y nos escribís por WhatsApp."
        }
        maxWidth={900}
      >
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
          {plans.map((p) => {
            const isCurrent = Boolean(active && p.planKey === subscription?.planKey);
            return (
              <div
                key={p.planKey}
                className={`flex flex-col gap-3 rounded-card border p-5 ${
                  p.featured ? "border-crm-primary" : "border-crm-border"
                } bg-crm-card`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-poppins text-lg font-bold text-crm-ink">{p.name}</span>
                    {p.featured && (
                      <span className="rounded-pill bg-crm-primary px-2 py-px text-[11px] font-bold text-white">Más elegido</span>
                    )}
                  </div>
                  <div className="text-[13px] text-crm-muted">{p.tagline}</div>
                </div>
                <div className="font-poppins text-[26px] font-bold text-crm-ink">
                  {p.price}
                  <span className="text-sm font-semibold text-crm-muted">
                    {" "}
                    {p.currency}
                    {p.billingPeriod}
                  </span>
                </div>
                <ul className="m-0 flex flex-1 list-none flex-col gap-1.5 p-0 text-[13px] text-crm-ink-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Icon name="check" size={14} className="mt-0.5 shrink-0 text-crm-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <div className="flex h-[46px] items-center justify-center rounded-pill bg-crm-surf text-sm font-semibold text-crm-muted">
                    Tu plan actual
                  </div>
                ) : (
                  <a
                    href={waLink(`Hola! Quiero pasar al plan ${p.name}. Cuenta: ${who}`)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={p.featured ? primaryButton : chipButton}
                  >
                    Pasar a {p.name}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="¿Cancelar la suscripción?"
        description={
          periodEnd
            ? `Seguís usando todo hasta el ${periodEnd}. Después el bot deja de responder y no se cobra más.`
            : "Al final del período pago el bot deja de responder y no se cobra más."
        }
        maxWidth={480}
        footer={
          <div className="flex flex-wrap justify-end gap-2.5">
            <button onClick={() => setCancelOpen(false)} className={chipButton}>
              Mejor no
            </button>
            <a
              href={waLink(`Hola! Quiero cancelar la suscripción de ${who}.`)}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => setCancelOpen(false)}
              className="flex h-[46px] items-center rounded-pill bg-crm-error px-6 font-poppins text-sm font-semibold text-white"
            >
              Pedir la cancelación
            </a>
          </div>
        }
      >
        <p className="m-0 text-sm text-crm-muted">
          {ONLINE_BILLING
            ? "Podés volver a activarla cuando quieras."
            : "Por ahora la cancelación la hacemos nosotros: te abrimos WhatsApp con el pedido listo para mandar. Tus conversaciones y datos quedan guardados."}
        </p>
      </Modal>
    </div>
  );
}
