import { WA_LINKS } from "@/lib/whatsapp";
import { getPlans } from "@/lib/pricing-plans";

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
                  data-track="whatsapp"
                  data-location={`plan_${plan.planKey}`}
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
                  data-track="whatsapp"
                  data-location={`plan_${plan.planKey}`}
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
            data-track="whatsapp"
            data-location="contactar_ventas"
            className="rounded-full bg-destructive px-6 py-3.5 font-poppins text-[15px] font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
          >
            Contactar ventas
          </a>
        </div>
      </div>
    </section>
  );
}
