import AdminShell from "@/components/admin/AdminShell";
import Skeleton from "@/components/admin/Skeleton";

// Se muestra al instante mientras el server arma la página (navegación desde otra sección).
export default function PlantillasLoading() {
  return (
    <AdminShell breadcrumb="Plantillas de WhatsApp">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-poppins text-3xl font-extrabold tracking-tight text-foreground">
            Plantillas de WhatsApp
          </h1>
          <p className="mt-2 max-w-[640px] text-muted-foreground">
            Creá y administrá las plantillas de mensajes que tus bots usan para
            iniciar conversaciones por WhatsApp. Las plantillas nuevas se envían
            a Meta para su aprobación antes de poder usarse.
          </p>
        </div>
        <Skeleton className="h-11 w-56 rounded-full" />
      </div>

      <Skeleton className="mt-8 h-11 max-w-[420px] rounded-full" />

      <div className="mt-6 overflow-hidden rounded-2xl border border-border">
        <div className="h-11 border-b border-border bg-muted" />
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-6 border-b border-border px-5 py-4 last:border-0">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
