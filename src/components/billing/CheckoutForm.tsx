"use client";

// Checkout propio de DigiBot con SmartFields de dLocal Go.
//
//   1. País (+ datos del negocio si es un cliente nuevo) -> el backend crea el pago
//      y devuelve el merchant_checkout_token.
//   2. Se monta el campo de tarjeta (iframe de dLocal Go: el número, vencimiento y CVV
//      nunca pasan por DigiBot).
//   3. Al pagar: createCardToken -> el backend confirma -> resultado, o 3DS (redirect).

import { useState } from "react";
import { BILLING_COUNTRIES, formatMoney, type BillingCountry } from "@/lib/billing/config";
import type { CheckoutMode, CountryPrices } from "@/lib/billing/page-data";
import { HolderAndCard, payWithCard, postJson, useSmartFields, type Checkout, type Fields, type Holder } from "./card";

const input =
  "h-12 w-full rounded-xl border border-border bg-background px-4 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary disabled:opacity-70";
const label = "mb-1.5 block text-sm font-semibold text-foreground";
const fieldError = "mt-1 text-[13px] text-destructive";
const primaryBtn =
  "flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary font-poppins text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const CLASSES = {
  input,
  label,
  error: fieldError,
  cardBox: "flex min-h-[52px] flex-col justify-center rounded-xl border border-border bg-background px-4 py-2.5",
  hint: "mt-1.5 text-[13px] text-muted-foreground",
};

export default function CheckoutForm({
  plan,
  prices,
  mode,
}: {
  plan: { planKey: string; name: string; tagline: string; features: string[] };
  prices: CountryPrices;
  mode: Exclude<CheckoutMode, { kind: "forbidden" }>;
}) {
  const countries = (Object.keys(BILLING_COUNTRIES) as BillingCountry[]).filter((c) => prices[c]);
  const [country, setCountry] = useState<BillingCountry>(countries.includes("AR") ? "AR" : countries[0]);
  const [signup, setSignup] = useState({ businessName: "", name: "", email: "" });
  const [holder, setHolder] = useState<Holder>({ firstName: "", lastName: "", documentType: "", document: "", email: "" });
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [step, setStep] = useState<"details" | "loading" | "card" | "paying">("details");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({});
  const card = useSmartFields(checkout);
  const price = prices[country];

  const start = async () => {
    setError(null);
    setFields({});
    setStep("loading");
    const res = await postJson<{ checkout: Checkout }>("/api/billing/checkout", {
      planKey: plan.planKey,
      country,
      accountId: mode.kind === "account" ? mode.accountId : undefined,
      signup: mode.kind === "signup" ? signup : undefined,
    });
    if (!res.ok) {
      setError(res.message);
      setFields(res.fields);
      setStep("details");
      return;
    }
    setCheckout(res.data.checkout);
    if (mode.kind === "signup") setHolder((h) => ({ ...h, email: h.email || signup.email }));
    setStep("card");
  };

  const reset = () => {
    setCheckout(null);
    setStep("details");
  };

  const pay = async () => {
    if (!checkout) return;
    setError(null);
    setFields({});
    setStep("paying");
    const res = await payWithCard(checkout, holder, card);
    if (!res.ok) {
      setError(res.message);
      setFields(res.fields);
      setStep("card");
    }
  };

  const busy = step === "loading" || step === "paying";
  const err = (k: string) => fields[k] && <p className={fieldError}>{fields[k]}</p>;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
      <section className="min-w-0 rounded-3xl border border-border bg-card p-6 sm:p-8">
        <h1 className="font-poppins text-2xl font-extrabold tracking-tight sm:text-[28px]">Suscribite al plan {plan.name}</h1>
        <p className="mt-1 text-muted-foreground">
          {mode.kind === "account" ? `Para la cuenta ${mode.accountName}.` : "Creá tu cuenta y empezá hoy."} Se cobra todos los meses el mismo día;
          podés cancelar cuando quieras.
        </p>

        {/* Paso 1 */}
        <fieldset disabled={step !== "details"} className="m-0 mt-7 grid min-w-0 gap-4 border-0 p-0">
          <div>
            <label className={label} htmlFor="country">
              País de facturación
            </label>
            <select id="country" className={input} value={country} onChange={(e) => setCountry(e.target.value as BillingCountry)}>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {BILLING_COUNTRIES[c].name} ({BILLING_COUNTRIES[c].currency})
                </option>
              ))}
            </select>
            {err("country")}
          </div>
          {mode.kind === "signup" && (
            <>
              <div>
                <label className={label} htmlFor="businessName">
                  Nombre de tu negocio
                </label>
                <input
                  id="businessName"
                  className={input}
                  value={signup.businessName}
                  onChange={(e) => setSignup({ ...signup, businessName: e.target.value })}
                  autoComplete="organization"
                />
                {err("businessName")}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="name">
                    Tu nombre
                  </label>
                  <input id="name" className={input} value={signup.name} onChange={(e) => setSignup({ ...signup, name: e.target.value })} autoComplete="name" />
                  {err("name")}
                </div>
                <div>
                  <label className={label} htmlFor="email">
                    Email (para entrar al panel)
                  </label>
                  <input id="email" type="email" className={input} value={signup.email} onChange={(e) => setSignup({ ...signup, email: e.target.value })} autoComplete="email" />
                  {err("email")}
                </div>
              </div>
              <p className="m-0 text-[13px] text-muted-foreground">
                ¿Ya tenés cuenta?{" "}
                <a className="font-semibold text-primary" href={`/admin/login?next=${encodeURIComponent(`/suscripcion/${plan.planKey}`)}`}>
                  Iniciá sesión
                </a>
              </p>
            </>
          )}
        </fieldset>

        {step === "details" || step === "loading" ? (
          <button type="button" onClick={start} disabled={busy} className={`${primaryBtn} mt-6`}>
            {step === "loading" ? "Preparando el pago…" : "Continuar al pago"}
          </button>
        ) : (
          <div className="mt-8 border-t border-border pt-7">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="m-0 font-poppins text-lg font-bold">Datos del titular de la tarjeta</h2>
              <button type="button" onClick={reset} disabled={busy} className="text-sm font-semibold text-primary disabled:opacity-50">
                Cambiar país o datos
              </button>
            </div>
            <HolderAndCard country={country} holder={holder} setHolder={setHolder} fields={fields} card={card} disabled={busy} classes={CLASSES} />
            <button type="button" onClick={pay} disabled={busy || !card.ready} className={`${primaryBtn} mt-6`}>
              {step === "paying" ? "Procesando el pago…" : checkout ? `Pagar ${formatMoney(checkout.amount, checkout.currency)}` : "Pagar"}
            </button>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            {error}
          </div>
        )}
      </section>

      {/* Resumen */}
      <aside className="rounded-3xl bg-primary p-7 text-white shadow-[0_30px_60px_-28px_rgba(0,102,255,0.55)] lg:sticky lg:top-24">
        <div className="text-sm font-semibold uppercase tracking-wider text-white/75">Resumen</div>
        <div className="mt-1 font-poppins text-[22px] font-bold">Plan {plan.name}</div>
        <div className="text-[15px] text-white/80">{plan.tagline}</div>
        <div className="my-6 flex items-baseline gap-1.5">
          <span className="font-poppins text-[40px] font-extrabold tracking-tight">{price ? formatMoney(price.amount, price.currency).replace(/ \w+$/, "") : "-"}</span>
          <span className="font-poppins font-semibold text-white/80">{price?.currency}</span>
          <span className="text-white/80">/mes</span>
        </div>
        <ul className="m-0 flex list-none flex-col gap-2.5 border-t border-white/20 p-0 pt-5 text-[15px]">
          {plan.features.map((f) => (
            <li key={f} className="flex gap-2">
              <span aria-hidden>✓</span>
              {f}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
