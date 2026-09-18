import { WA_LINKS } from "@/lib/whatsapp";
import { getPool, isDbConfigured } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

type Plan = {
  planKey: string;
  name: string;
  tagline: string;
  price: string;
  currency: string;
  billingPeriod: string;
  ctaLabel: string;
  featured: boolean;
  features: string[];
};

// Se usa solo si la DB no está configurada o la consulta falla, para que la
// sección de precios nunca desaparezca de la web.
const FALLBACK_PLANS: Plan[] = [
  {
    planKey: "basico",
    name: "Básico",
    tagline: "Perfecto para empezar",
    price: "$99",
    currency: "ARS",
    billingPeriod: "/mes",
    ctaLabel: "Elegir Básico",
    featured: false,
    features: [
      "Hasta 1.000 mensajes/mes",
      "WhatsApp Business",
      "Panel de control básico",
      "Soporte por email",
      "Entrenamiento básico de IA",
    ],
  },
  {
    planKey: "premium",
    name: "Premium",
    tagline: "Ideal para marcas en crecimiento",
    price: "$199",
    currency: "ARS",
    billingPeriod: "/mes",
    ctaLabel: "Elegir Premium",
    featured: true,
    features: [
      "Hasta 5.000 mensajes/mes",
      "WhatsApp + Instagram + Facebook",
      "Panel de control avanzado",
      "Soporte prioritario",
      "IA personalizada avanzada",
      "Estadísticas detalladas",
      "Integración con CRM",
      "Soporta audios e imágenes",
    ],
  },
  {
    planKey: "plus",
    name: "Plus+",
    tagline: "Para empresas grandes",
    price: "$399",
    currency: "ARS",
    billingPeriod: "/mes",
    ctaLabel: "Elegir Plus+",
    featured: false,
    features: [
      "Mensajes ilimitados",
      "WhatsApp + Instagram + Facebook",
      "Panel empresarial completo",
      "Soporte 24/7",
      "IA ultra personalizada",
      "Analytics avanzados",
      "Genera links de ventas",
      "Soporta audios e imágenes",
      "Entrenamiento personalizado",
    ],
  },
];

interface PlanRow extends RowDataPacket {
  plan_key: string;
  name: string;
  tagline: string;
  price: string | number;
  currency: string;
  billing_period: string;
  cta_label: string;
  is_featured: number;
  features: string | string[];
}

function formatPrice(price: string | number) {
  const value = typeof price === "string" ? Number(price) : price;
  if (!Number.isFinite(value)) return String(price);
  // Sin decimales cuando es un número redondo (ej: $99 en vez de $99,00).
  const hasDecimals = value % 1 !== 0;
  return `$${value.toLocaleString("es-AR", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

async function getPlans(): Promise<Plan[]> {
  if (!isDbConfigured()) return FALLBACK_PLANS;

  try {
    const pool = getPool();
    const [rows] = await pool.query<PlanRow[]>(
      `SELECT plan_key, name, tagline, price, currency, billing_period, cta_label, is_featured, features
       FROM web_pricing_plans
       WHERE is_active = 1
       ORDER BY sort_order ASC, id ASC`
    );

    if (!rows.length) return FALLBACK_PLANS;

    return rows.map((row) => ({
      planKey: row.plan_key,
      name: row.name,
      tagline: row.tagline,
      price: formatPrice(row.price),
      currency: row.currency,
      billingPeriod: row.billing_period,
      ctaLabel: row.cta_label,
      featured: Boolean(row.is_featured),
      features: typeof row.features === "string" ? JSON.parse(row.features) : row.features,
    }));
  } catch (err) {
    console.error("Error obteniendo planes de precios de la base:", err);
    return FALLBACK_PLANS;
  }
}

function planHref(planKey: string) {
  return WA_LINKS[planKey as keyof typeof WA_LINKS] || WA_LINKS.general;
}

export default async function Pricing() {
  const plans = await getPlans();

  return (
    <section id="planes" className="bg-muted px-5 py-16 sm:px-8 md:py-24">
      <div className="mx-auto max-w-[1200px]">
        <div className="max-w-[620px]">
          <h2 className="font-poppins text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-[44px]">
            Nuestros planes
          </h2>
          <p className="mt-3.5 text-lg text-muted-foreground">
            Elegí el plan que mejor se adapte a las necesidades de tu negocio.
            Un único monto de configuración inicial y después, la suscripción.
          </p>
        </div>

        <div className="mt-12 grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) =>
            plan.featured ? (
              <div
                key={plan.planKey}
                className="relative rounded-3xl bg-primary p-9 shadow-[0_30px_60px_-28px_rgba(0,102,255,0.55)]"
              >
                <div className="absolute -top-3 left-9 rounded-full bg-secondary px-3.5 py-1.5 font-poppins text-xs font-bold tracking-wide text-secondary-foreground">
                  MÁS POPULAR
                </div>
                <div className="font-poppins text-[22px] font-bold text-white">
                  {plan.name}
                </div>
                <div className="mt-1 text-[15px] text-white/80">{plan.tagline}</div>
                <div className="my-7 flex items-baseline gap-1.5">
                  <span className="font-poppins text-[46px] font-extrabold tracking-tight text-white">
                    {plan.price}
                  </span>
                  <span className="font-poppins text-base font-semibold text-white/80">
                    {plan.currency}
                  </span>
                  <span className="text-base text-white/80">{plan.billingPeriod}</span>
                </div>
                <a
                  href={planHref(plan.planKey)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block rounded-full bg-white py-3.5 text-center font-poppins text-[15px] font-bold text-primary transition-colors hover:bg-secondary hover:text-secondary-foreground"
                >
                  {plan.ctaLabel}
                </a>
                <div className="mt-7 flex flex-col gap-3 border-t border-white/20 pt-6">
                  {plan.features.map((feature) => (
                    <div key={feature} className="text-[15px] text-white">
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                key={plan.planKey}
                className="rounded-3xl border border-border bg-card p-9"
              >
                <div className="font-poppins text-[22px] font-bold text-foreground">
                  {plan.name}
                </div>
                <div className="mt-1 text-[15px] text-muted-foreground">{plan.tagline}</div>
                <div className="my-7 flex items-baseline gap-1.5">
                  <span className="font-poppins text-[46px] font-extrabold tracking-tight text-foreground">
                    {plan.price}
                  </span>
                  <span className="font-poppins text-base font-semibold text-muted-foreground">
                    {plan.currency}
                  </span>
                  <span className="text-base text-muted-foreground">{plan.billingPeriod}</span>
                </div>
                <a
                  href={planHref(plan.planKey)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block rounded-full border border-border bg-muted py-3.5 text-center font-poppins text-[15px] font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  {plan.ctaLabel}
                </a>
                <div className="mt-7 flex flex-col gap-3 border-t border-border pt-6">
                  {plan.features.map((feature) => (
                    <div key={feature} className="text-[15px] text-muted-foreground">
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-6 rounded-[20px] border border-border bg-card p-7">
          <div className="font-poppins text-lg font-semibold text-foreground">
            ¿Necesitás un plan personalizado?
          </div>
          <div className="flex-1 text-base text-muted-foreground">
            Contactanos y te armamos una solución a medida.
          </div>
          <a
            href={WA_LINKS.ventas}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-full bg-destructive px-6 py-3.5 font-poppins text-[15px] font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
          >
            Contactar ventas
          </a>
        </div>
      </div>
    </section>
  );
}
