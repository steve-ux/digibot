import PageHeader, { PageBody } from "@/components/crm/PageHeader";

// Provisorio (etapa 1): la pantalla completa llega en la etapa 6.
export default function Page() {
  return (
    <PageBody>
      <PageHeader title="Canales" description="Conectá tus cuentas y todos los mensajes llegan a la misma bandeja." />
      <div className="rounded-card border border-dashed border-crm-border-2 bg-crm-card px-6 py-16 text-center">
        <div className="font-poppins text-base font-semibold text-crm-ink">Estamos armando esta sección</div>
        <p className="mt-1.5 text-sm text-crm-muted">Muy pronto vas a poder usarla desde acá.</p>
      </div>
    </PageBody>
  );
}
