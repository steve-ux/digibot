import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import CheckoutForm from "@/components/billing/CheckoutForm";
import { loadCheckoutPage } from "@/lib/billing/page-data";
import { WA_LINKS } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Suscripción | DigiBot",
  robots: { index: false },
};

// Alta de un plan: resumen, datos del titular y tarjeta (SmartFields de dLocal Go).
export default async function SuscripcionPage({
  params,
  searchParams,
}: {
  params: Promise<{ plan: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ plan: planKey }, query] = await Promise.all([params, searchParams]);
  const data = await loadCheckoutPage(planKey, typeof query.cuenta === "string" ? query.cuenta : undefined);
  if (!data) notFound();

  return (
    <main className="min-h-screen bg-muted text-foreground">
      <Header />
      <div className="mx-auto max-w-[1100px] px-5 py-12 sm:px-8 md:py-16">
        {data.sandbox && (
          <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Modo de prueba (sandbox de dLocal Go): no se cobra nada real. Usá las tarjetas de prueba.
          </div>
        )}
        {data.mode.kind === "forbidden" ? (
          <Notice title="No podés contratar desde esta cuenta" body={data.mode.message} />
        ) : !data.available ? (
          <Notice
            title={`El plan ${data.plan.name} todavía no se puede contratar online`}
            body="Escribinos por WhatsApp y lo activamos con vos."
            cta={{ href: WA_LINKS[data.plan.planKey as keyof typeof WA_LINKS] ?? WA_LINKS.ventas, label: "Hablar por WhatsApp" }}
          />
        ) : (
          <CheckoutForm
            plan={{ planKey: data.plan.planKey, name: data.plan.name, tagline: data.plan.tagline, features: data.plan.features }}
            prices={data.prices}
            mode={data.mode}
          />
        )}
      </div>
      <Footer />
    </main>
  );
}

function Notice({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return (
    <div className="mx-auto max-w-[620px] rounded-3xl border border-border bg-card p-8 text-center">
      <h1 className="font-poppins text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-muted-foreground">{body}</p>
      {cta && (
        <a
          href={cta.href}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-6 inline-block rounded-full bg-primary px-7 py-3 font-poppins text-[15px] font-bold text-white hover:opacity-90"
        >
          {cta.label}
        </a>
      )}
    </div>
  );
}
