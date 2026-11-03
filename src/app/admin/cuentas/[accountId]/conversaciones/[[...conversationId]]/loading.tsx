// Se muestra al instante mientras el server arma la bandeja (navegación desde otra sección).
export default function BandejaLoading() {
  return (
    <div className="flex min-h-0 flex-1" aria-busy aria-label="Cargando la bandeja">
      <div className="flex w-full shrink-0 flex-col gap-3.5 border-r border-crm-border bg-crm-side px-5 pt-[22px] md:w-[320px] lg:w-[360px]">
        <div className="h-7 w-32 animate-pulse rounded-lg bg-crm-surf" />
        <div className="h-11 animate-pulse rounded-pill bg-crm-surf" />
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 w-20 animate-pulse rounded-pill bg-crm-surf" />
          ))}
        </div>
        <div className="h-[42px] animate-pulse rounded-field bg-crm-surf" />
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex items-start gap-3 py-1.5">
            <div className="h-[46px] w-[46px] shrink-0 animate-pulse rounded-full bg-crm-surf" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 w-2/3 animate-pulse rounded-md bg-crm-surf" />
              <div className="h-3.5 w-full animate-pulse rounded-md bg-crm-surf" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden flex-1 bg-crm-bg md:block" />
    </div>
  );
}
