import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { formatMoney } from "@/lib/billing/config";
import { getBillingDeps } from "@/lib/billing/runtime";
import { getCheckoutResult, type CheckoutResult } from "@/lib/billing/service";
import { getPlans } from "@/lib/pricing-plans";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Resultado del pago | DigiBot",
  robots: { index: false },
};

// success_url de dLocal Go (también después de 3DS). El estado se confirma con
// GET /v1/payments/{id}: lo que diga la URL no cuenta.
export default async function ResultadoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const ref = typeof query.ref === "string" ? query.ref : "";
  const deps = getBillingDeps();
  let result: CheckoutResult | null = null;
  if (deps && ref) {
    try {
      result = await getCheckoutResult(deps, ref);
    } catch (err) {
      console.error("[billing] resultado:", (err as Error).message);
    }
  }
  const planName = result ? ((await getPlans()).find((p) => p.planKey === result.planKey)?.name ?? result.planKey) : "";
  const waiting = result && (result.status === "pending" || result.status === "unknown" || result.status === "created");

  return (
    <main className="min-h-screen bg-muted text-foreground">
      {waiting && <meta httpEquiv="refresh" content="5" />}
      <Header />
      <div className="mx-auto max-w-[620px] px-5 py-16 sm:px-8">
        <div className="rounded-3xl border border-border bg-card p-8 text-center">
          {!result ? (
            <>
              <h1 className="font-poppins text-2xl font-bold">No encontramos ese pago</h1>
              <p className="mt-3 text-muted-foreground">Si te cobraron, escribinos y lo revisamos.</p>
            </>
          ) : result.status === "paid" ? (
            <>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-2xl text-secondary-foreground">✓</div>
              <h1 className="mt-4 font-poppins text-2xl font-bold">
                {result.kind === "card_update" ? "¡Listo! Pago recibido y tarjeta actualizada" : `¡Listo! Tu plan ${planName} está activo`}
              </h1>
              <p className="mt-3 text-muted-foreground">
                Cobramos {formatMoney(result.amount, result.currency)}. Te mandamos el comprobante por mail.
                {result.kind === "card_update" && " La tarjeta nueva quedó guardada para los próximos cobros."}
              </p>
              {result.inviteToken ? (
                <>
                  <p className="mt-3 text-muted-foreground">Ahora creá tu contraseña para entrar al panel (también te llegó el link por mail).</p>
                  <a
                    href={`/admin/invitacion/${encodeURIComponent(result.inviteToken)}`}
                    className="mt-6 inline-block rounded-full bg-primary px-7 py-3 font-poppins text-[15px] font-bold text-white hover:opacity-90"
                  >
                    Crear mi contraseña
                  </a>
                </>
              ) : (
                result.accountId !== null && (
                  <a
                    href={`/admin/cuentas/${result.accountId}/configuracion?tab=suscripcion`}
                    className="mt-6 inline-block rounded-full bg-primary px-7 py-3 font-poppins text-[15px] font-bold text-white hover:opacity-90"
                  >
                    Ir al panel
                  </a>
                )
              )}
            </>
          ) : waiting ? (
            <>
              <h1 className="font-poppins text-2xl font-bold">Estamos confirmando tu pago…</h1>
              <p className="mt-3 text-muted-foreground">Puede tardar unos segundos. Esta página se actualiza sola.</p>
            </>
          ) : (
            <>
              <h1 className="font-poppins text-2xl font-bold">No pudimos cobrar</h1>
              <p className="mt-3 text-muted-foreground">{result.message ?? "El pago no se completó."}</p>
              <a
                href={`/suscripcion/${encodeURIComponent(result.planKey)}`}
                className="mt-6 inline-block rounded-full bg-primary px-7 py-3 font-poppins text-[15px] font-bold text-white hover:opacity-90"
              >
                Probar de nuevo
              </a>
            </>
          )}
        </div>
      </div>
      <Footer />
    </main>
  );
}
