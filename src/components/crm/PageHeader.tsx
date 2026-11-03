// Encabezado de las pantallas de página del CRM (Métricas, Equipo, Canales).
export default function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-[240px] flex-1">
        <h1 className="m-0 font-poppins text-[26px] font-bold tracking-[-.8px] text-crm-ink md:text-[30px]">
          {title}
        </h1>
        {description && <p className="mb-0 mt-1.5 text-[15px] text-crm-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function PageBody({ children, maxWidth = 1100 }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <div className="crm-scroll flex-1 overflow-y-auto">
      <div
        style={{ maxWidth }}
        className="mx-auto flex flex-col gap-[22px] px-4 pb-16 pt-6 md:px-[clamp(20px,3vw,40px)] md:pt-9"
      >
        {children}
      </div>
    </div>
  );
}
