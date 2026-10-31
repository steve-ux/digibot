// Bloque gris animado para los estados de carga del panel (en vez de "Cargando…").
export default function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-muted ${className}`} />;
}
