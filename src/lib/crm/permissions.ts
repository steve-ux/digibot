// Roles y permisos del panel. Sin imports de servidor: lo usan las APIs, el
// middleware (Edge) y la UI (para no mostrar lo que no se puede usar).
// La UI solo oculta: el control real está en el middleware y en cada API.

import { CHANNEL_IDS, type ChannelId } from "./channels";

// superadmin = equipo de DigiBot: no pertenece a ninguna cuenta y entra a todas.
export type CrmRole = "superadmin" | "admin" | "supervisor" | "agent";

// Roles que se asignan dentro de una cuenta (pantalla Equipo).
export type AccountRole = Exclude<CrmRole, "superadmin">;

export const ROLES: { id: AccountRole; label: string; description: string }[] = [
  {
    id: "admin",
    label: "Administrador",
    description: "Ve todo, crea supervisores y agentes, y configura la cuenta.",
  },
  {
    id: "supervisor",
    label: "Supervisor",
    description: "Ve todas las conversaciones y las métricas. No toca la configuración.",
  },
  { id: "agent", label: "Agente", description: "Responde solo los canales que le asignes." },
];

export const ROLE_LABELS: Record<CrmRole, string> = {
  superadmin: "Superadmin",
  admin: "Administrador",
  supervisor: "Supervisor",
  agent: "Agente",
};

// accounts = alta y gestión de cuentas (solo superadmin) · settings = etiquetas y atributos
export type Section = "inbox" | "metrics" | "team" | "channels" | "templates" | "settings" | "accounts";

const ACCESS: Record<Section, CrmRole[]> = {
  inbox: ["superadmin", "admin", "supervisor", "agent"],
  metrics: ["superadmin", "admin", "supervisor"],
  team: ["superadmin", "admin"],
  channels: ["superadmin", "admin"],
  templates: ["superadmin", "admin"],
  settings: ["superadmin", "admin"],
  accounts: ["superadmin"],
};

export function canAccess(role: CrmRole, section: Section) {
  return ACCESS[section].includes(role);
}

// Quién puede dar (o sacar) cada rol en Equipo. Solo un superadmin crea administradores.
export function assignableRoles(actor: CrmRole): AccountRole[] {
  if (actor === "superadmin") return ["admin", "supervisor", "agent"];
  if (actor === "admin") return ["supervisor", "agent"];
  return [];
}

export function isAccountRole(role: unknown): role is AccountRole {
  return role === "admin" || role === "supervisor" || role === "agent";
}

// ---------- Rutas ----------
// Páginas: /admin/cuentas/:cuenta/<sección>/...   APIs: /api/admin/cuentas/:cuenta/<sección>/...

export const ACCOUNT_PAGE_SECTIONS: Record<string, Section> = {
  conversaciones: "inbox",
  metricas: "metrics",
  equipo: "team",
  canales: "channels",
  plantillas: "templates",
  configuracion: "settings",
};

// Las etiquetas y atributos se leen desde la bandeja (inbox); para modificarlos,
// la API exige además "settings".
export const ACCOUNT_API_SECTIONS: Record<string, Section> = {
  conversaciones: "inbox",
  resumen: "inbox",
  "plantillas-aprobadas": "inbox",
  etiquetas: "inbox",
  atributos: "inbox",
  metricas: "metrics",
  equipo: "team",
  canales: "channels",
  plantillas: "templates",
};

export interface AccountRoute {
  // null = /admin/cuentas o /api/admin/cuentas (listado de cuentas)
  accountId: number | null;
  // null = la raíz de la cuenta (/admin/cuentas/7)
  segment: string | null;
  section: Section | null;
}

const ACCOUNT_PATH = /^\/(api\/)?admin\/cuentas(?:\/([^/]+))?(?:\/([^/]+))?/;

// Desarma /admin/cuentas/7/equipo -> { accountId: 7, segment: "equipo", section: "team" }.
// Devuelve undefined si la ruta no es de cuentas, o null si el id no es válido.
export function parseAccountRoute(pathname: string): AccountRoute | null | undefined {
  const match = ACCOUNT_PATH.exec(pathname);
  if (!match) return undefined;
  const [, api, rawId, segment] = match;
  if (rawId === undefined) return { accountId: null, segment: null, section: "accounts" };
  const accountId = Number(rawId);
  if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(accountId) || accountId <= 0) return null;
  if (segment === undefined) {
    // PATCH /api/admin/cuentas/7 edita la cuenta; /admin/cuentas/7 redirige a la bandeja.
    return { accountId, segment: null, section: api ? "accounts" : "inbox" };
  }
  const table = api ? ACCOUNT_API_SECTIONS : ACCOUNT_PAGE_SECTIONS;
  return { accountId, segment, section: table[segment] ?? null };
}

export function accountPath(accountId: number, path = "conversaciones") {
  return `/admin/cuentas/${accountId}/${path.replace(/^\//, "")}`;
}

export function accountApi(accountId: number, path: string) {
  return `/api/admin/cuentas/${accountId}/${path.replace(/^\//, "")}`;
}

// Rutas anteriores a las cuentas (/admin/bandeja?c=12 -> /admin/cuentas/7/conversaciones/12).
export const LEGACY_PAGES: Record<string, string> = {
  bandeja: "conversaciones",
  metricas: "metricas",
  equipo: "equipo",
  canales: "canales",
  plantillas: "plantillas",
};

// ¿Puede esta sesión entrar a esta cuenta? El superadmin entra a todas.
export function canEnterAccount(session: { role: CrmRole; acc: number | null }, accountId: number) {
  return session.role === "superadmin" || session.acc === accountId;
}

// ---------- Canales ----------

export interface ChannelScoped {
  role: CrmRole;
  channels: ChannelId[];
}

// Administradores y supervisores ven todos los canales; los agentes, los asignados.
export function allowedChannels(user: ChannelScoped): ChannelId[] {
  if (user.role !== "agent") return [...CHANNEL_IDS];
  return CHANNEL_IDS.filter((c) => user.channels.includes(c));
}

export function canUseChannel(user: ChannelScoped, channel: ChannelId) {
  return allowedChannels(user).includes(channel);
}

export function parseChannels(value: unknown): ChannelId[] {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return CHANNEL_IDS.filter((c) => parsed.includes(c));
}
