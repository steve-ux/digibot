// Íconos monocromos del CRM (public/crm/icons/*.svg). Se pintan con máscara
// CSS para que tomen el color del texto (currentColor) en claro y oscuro.

export type IconName =
  | "alert"
  | "bot"
  | "building"
  | "chart"
  | "check"
  | "clip"
  | "clock"
  | "copy"
  | "settings"
  | "tag"
  | "trash"
  | "heart"
  | "inbox"
  | "lock"
  | "logout"
  | "mail"
  | "moon"
  | "panel"
  | "plug"
  | "plus"
  | "retry"
  | "search"
  | "send"
  | "sun"
  | "template"
  | "users"
  | "x";

export default function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`crm-icon ${className}`}
      style={{ width: size, height: size, ["--icon" as string]: `url(/crm/icons/${name}.svg)` }}
    />
  );
}
