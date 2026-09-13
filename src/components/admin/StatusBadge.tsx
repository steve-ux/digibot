import type { TemplateStatus } from "@/lib/meta-whatsapp";

const STYLES: Record<TemplateStatus, string> = {
  APPROVED: "bg-secondary/15 text-green-700 dark:text-secondary border-secondary/30",
  PENDING: "bg-yellow-400/15 text-yellow-700 dark:text-yellow-400 border-yellow-400/30",
  REJECTED: "bg-destructive/15 text-destructive border-destructive/30",
  PAUSED: "bg-muted text-muted-foreground border-border",
  DISABLED: "bg-muted text-muted-foreground border-border",
};

const LABELS: Record<TemplateStatus, string> = {
  APPROVED: "Aprobada",
  PENDING: "Pendiente",
  REJECTED: "Rechazada",
  PAUSED: "Pausada",
  DISABLED: "Deshabilitada",
};

export default function StatusBadge({ status }: { status: TemplateStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STYLES[status] ?? STYLES.PAUSED}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
