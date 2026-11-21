"use client";

// SmartFields de dLocal Go compartido (checkout de alta y "Pagar con otra tarjeta").
// El número, vencimiento y CVV se cargan en un iframe de dLocal Go: DigiBot solo
// recibe un cardToken de un solo uso.

import { useEffect, useRef, useState } from "react";
import { BILLING_COUNTRIES, DOCUMENT_LABELS, isBillingCountry } from "@/lib/billing/config";

interface SmartField {
  mount(el: HTMLElement): void;
  on?(event: string, cb: (e: { brand?: string }) => void): void;
  destroy?(): void;
  unmount?(): void;
}

interface DlocalGoSdk {
  initialize(apiKey: string, checkoutToken: string): Promise<unknown>;
  fields(): { create(type: "card", options: { style: Record<string, unknown> }): SmartField };
  createCardToken(field: SmartField, data: { name: string }): Promise<{ token: string }>;
}

declare global {
  interface Window {
    dlocalGo?: DlocalGoSdk;
  }
}

export interface Checkout {
  ref: string;
  checkoutToken: string;
  smartFieldsKey: string;
  sdkUrl: string;
  amount: number;
  currency: string;
  country: string;
}

export type Fields = Record<string, string | undefined>;

export interface Holder {
  firstName: string;
  lastName: string;
  documentType: string;
  document: string;
  email: string;
}

function loadSdk(src: string): Promise<DlocalGoSdk> {
  if (window.dlocalGo) return Promise.resolve(window.dlocalGo);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-dlocalgo]");
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => (window.dlocalGo ? resolve(window.dlocalGo) : reject(new Error("sdk"))));
    script.addEventListener("error", () => reject(new Error("sdk")));
    if (!existing) {
      script.src = src;
      script.async = true;
      script.dataset.dlocalgo = "1";
      document.head.appendChild(script);
    }
  });
}

// Colores del tema actual. La landing usa variables HSL (--foreground); el panel, --crm-*.
function fieldStyle() {
  const css = getComputedStyle(document.documentElement);
  const pick = (crm: string, hslVar: string, fallback: string) => {
    const direct = css.getPropertyValue(crm).trim();
    if (direct) return direct;
    const hsl = css.getPropertyValue(hslVar).trim();
    return hsl ? `hsl(${hsl})` : fallback;
  };
  const ink = pick("--crm-ink", "--foreground", "#1c1c1c");
  return {
    base: {
      fontSize: "16px",
      // Sin lineHeight el SDK arma el campo de 18px y corta el texto por abajo.
      lineHeight: "26px",
      fontFamily: "Inter, system-ui, sans-serif",
      color: ink,
      fontSmoothing: "antialiased",
      "::placeholder": { color: pick("--crm-muted", "--muted-foreground", "#4d5566") },
    },
    focus: { color: ink },
    invalid: { color: pick("--crm-error", "--destructive", "#ff5c5c") },
  };
}

// Monta el campo de tarjeta para un checkout. tokenize() devuelve el cardToken (o lanza).
export function useSmartFields(checkout: Checkout | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const field = useRef<SmartField | null>(null);
  const sdk = useRef<DlocalGoSdk | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);

  useEffect(() => {
    if (!checkout || !containerRef.current) return;
    let cancelled = false;
    setReady(false);
    setError(null);
    (async () => {
      try {
        const lib = await loadSdk(checkout.sdkUrl);
        await lib.initialize(checkout.smartFieldsKey, checkout.checkoutToken);
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        const f = lib.fields().create("card", { style: fieldStyle() });
        f.mount(containerRef.current);
        f.on?.("brand", (e) => setBrand(e.brand ?? null));
        field.current = f;
        sdk.current = lib;
        setReady(true);
      } catch {
        if (!cancelled) setError("No se pudo cargar el formulario seguro de la tarjeta. Recargá la página.");
      }
    })();
    return () => {
      cancelled = true;
      try {
        if (field.current?.destroy) field.current.destroy();
        else field.current?.unmount?.();
      } catch {
        /* el SDK puede no tener destroy */
      }
      field.current = null;
    };
  }, [checkout]);

  const tokenize = async (name: string) => {
    if (!field.current || !sdk.current) throw new Error("not_ready");
    return (await sdk.current.createCardToken(field.current, { name })).token;
  };

  return { containerRef, ready, error, brand, tokenize };
}

export async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string; fields: Fields }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, message: data.message || "No pudimos procesar el pago.", fields: data.fields ?? {} };
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, message: "Sin conexión. Revisá tu internet y probá de nuevo.", fields: {} };
  }
}

// Paga: tokeniza, confirma y redirige (3DS o página de resultado).
export async function payWithCard(
  checkout: Checkout,
  holder: Holder,
  card: ReturnType<typeof useSmartFields>
): Promise<{ ok: true } | { ok: false; message: string; fields: Fields }> {
  const name = `${holder.firstName} ${holder.lastName}`.trim();
  if (!holder.firstName.trim()) return { ok: false, message: "Completá el nombre del titular.", fields: { firstName: "Escribí el nombre como figura en la tarjeta." } };
  let token: string;
  try {
    token = await card.tokenize(name);
  } catch {
    return { ok: false, message: "Revisá el número, el vencimiento y el código de seguridad de la tarjeta.", fields: {} };
  }
  const res = await postJson<{ status: "paid" | "pending" | "redirect"; redirectUrl?: string }>("/api/billing/checkout/confirm", {
    ref: checkout.ref,
    cardToken: token,
    brand: card.brand,
    ...holder,
  });
  if (!res.ok) return { ok: false, message: res.message, fields: res.fields };
  window.location.href =
    res.data.status === "redirect" && res.data.redirectUrl ? res.data.redirectUrl : `/suscripcion/resultado?ref=${checkout.ref}`;
  return { ok: true };
}

export function documentsFor(country: string): readonly string[] {
  return isBillingCountry(country) ? BILLING_COUNTRIES[country].documents : [];
}

// Datos del titular + campo de tarjeta. Las clases se pasan para usar el estilo de la landing o del panel.
export function HolderAndCard({
  country,
  holder,
  setHolder,
  fields,
  card,
  disabled,
  classes,
}: {
  country: string;
  holder: Holder;
  setHolder: (h: Holder) => void;
  fields: Fields;
  card: ReturnType<typeof useSmartFields>;
  disabled: boolean;
  classes: { input: string; label: string; error: string; cardBox: string; hint: string };
}) {
  const docs = documentsFor(country);
  useEffect(() => {
    if (!docs.includes(holder.documentType) && docs[0]) setHolder({ ...holder, documentType: docs[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);
  const err = (k: string) => fields[k] && <p className={classes.error}>{fields[k]}</p>;
  return (
    <fieldset disabled={disabled} className="m-0 grid min-w-0 gap-4 border-0 p-0">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={classes.label} htmlFor="h-first">
            Nombre
          </label>
          <input id="h-first" className={classes.input} value={holder.firstName} onChange={(e) => setHolder({ ...holder, firstName: e.target.value })} autoComplete="cc-given-name" />
          {err("firstName")}
        </div>
        <div>
          <label className={classes.label} htmlFor="h-last">
            Apellido
          </label>
          <input id="h-last" className={classes.input} value={holder.lastName} onChange={(e) => setHolder({ ...holder, lastName: e.target.value })} autoComplete="cc-family-name" />
          {err("lastName")}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[170px_1fr]">
        <div>
          <label className={classes.label} htmlFor="h-doctype">
            Documento
          </label>
          <select id="h-doctype" className={classes.input} value={holder.documentType} onChange={(e) => setHolder({ ...holder, documentType: e.target.value })}>
            {docs.map((d) => (
              <option key={d} value={d}>
                {DOCUMENT_LABELS[d] ?? d}
              </option>
            ))}
          </select>
          {err("documentType")}
        </div>
        <div>
          <label className={classes.label} htmlFor="h-doc">
            Número
          </label>
          <input id="h-doc" className={classes.input} value={holder.document} onChange={(e) => setHolder({ ...holder, document: e.target.value })} />
          {err("document")}
        </div>
      </div>
      <div>
        <label className={classes.label} htmlFor="h-email">
          Email del titular
        </label>
        <input id="h-email" type="email" className={classes.input} value={holder.email} onChange={(e) => setHolder({ ...holder, email: e.target.value })} autoComplete="email" />
        {err("email")}
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className={`${classes.label} !mb-0`}>Tarjeta de crédito o débito</span>
          <span className="flex items-center gap-1.5" aria-label="Aceptamos Visa y Mastercard">
            {/* Los PNG tienen margen transparente: se recortan con object-cover para que se vean del mismo tamaño */}
            <img src="/visa.png" alt="Visa" width={40} height={26} className="h-[26px] w-[40px] object-cover" />
            <img src="/mastercard.png" alt="Mastercard" width={40} height={26} className="h-[26px] w-[40px] object-cover" />
          </span>
        </div>
        <div className={`${classes.cardBox} mt-1.5`} ref={card.containerRef} />
        {!card.ready && !card.error && <p className={classes.hint}>Cargando el formulario seguro…</p>}
        {card.error && <p className={classes.error}>{card.error}</p>}
        <p className={`${classes.hint} flex items-start gap-1.5`}>
          <img src="/candado.png" alt="" width={14} height={14} className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            <strong className="font-semibold">Pago 100% seguro.</strong> Los datos de tu tarjeta viajan cifrados directo a dLocal Go, nuestro procesador
            de pagos, y nunca pasan por los servidores de DigiBot. Solo guardamos la marca y los últimos 4 números para mostrártela.
          </span>
        </p>
      </div>
    </fieldset>
  );
}
