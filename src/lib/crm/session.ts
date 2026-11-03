// Usuario actual del panel y equipo. Server-only.
//
// PROVISORIO (hasta la etapa de Equipo): el panel tiene una sola cuenta con
// contraseña compartida, así que hay un único usuario (id 1, administrador).
// Cuando exista web_users, estas dos funciones pasan a leer la sesión y la tabla;
// el resto del código ya trabaja con ids de usuario.

export type CrmRole = "admin" | "supervisor" | "agent";

export interface CrmUser {
  id: number;
  name: string;
  role: CrmRole;
}

export const ROLE_LABELS: Record<CrmRole, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  agent: "Agente",
};

const SINGLE_USER_ID = 1;

export async function getCurrentUser(): Promise<CrmUser> {
  return {
    id: SINGLE_USER_ID,
    name: process.env.ADMIN_DISPLAY_NAME || "Administrador",
    role: "admin",
  };
}

// Personas activas a las que se puede asignar una conversación.
export async function getTeam(): Promise<CrmUser[]> {
  return [await getCurrentUser()];
}
