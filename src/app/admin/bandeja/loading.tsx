import AdminShell from "@/components/admin/AdminShell";
import Skeleton from "@/components/admin/Skeleton";

// Se muestra al instante mientras el server arma la página (navegación desde otra sección).
export default function BandejaLoading() {
  return (
    <AdminShell breadcrumb="Bandeja de WhatsApp">
      <div>
        <h1 className="font-poppins text-3xl font-extrabold tracking-tight text-foreground">
          Bandeja de WhatsApp
        </h1>
        <p className="mt-2 max-w-[640px] text-muted-foreground">
          Leé y respondé las conversaciones del número del negocio. Se actualiza sola
          cada pocos segundos.
        </p>
      </div>

      <div className="mt-8 grid h-[calc(100vh-15rem)] min-h-[520px] overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-[340px_1fr]">
        <div className="border-border lg:border-r">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center gap-3 border-b border-border px-4 py-3.5">
              <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3.5 w-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="chat-pattern hidden lg:block" />
      </div>
    </AdminShell>
  );
}
