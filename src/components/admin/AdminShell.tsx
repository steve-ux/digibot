// Contenedor de las pantallas "de página" del panel (Plantillas, etc.).
// La navegación, el tema y el cierre de sesión ahora viven en CrmShell
// (app/admin/(crm)/layout.tsx); acá solo se da el área con scroll y márgenes.

export default function AdminShell({
  breadcrumb,
  children,
}: {
  breadcrumb: string;
  children: React.ReactNode;
}) {
  return (
    <div className="crm-scroll flex-1 overflow-y-auto">
      <section
        aria-label={breadcrumb}
        className="mx-auto max-w-[1200px] px-4 pb-16 pt-6 md:px-[clamp(20px,3vw,40px)] md:pt-9"
      >
        {children}
      </section>
    </div>
  );
}
