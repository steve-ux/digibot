// Íconos monocromos del CRM (public/crm/icons/*.svg). Se pintan con máscara
// CSS para que tomen el color del texto (currentColor) en claro y oscuro.

export type IconName =
  | "alert"
  | "bell"
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
  | "info"
  | "lock"
  | "logout"
  | "mail"
  | "moon"
  | "panel"
  | "play"
  | "plug"
  | "plus"
  | "retry"
  | "search"
  | "send"
  | "sun"
  | "template"
  | "user"
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
