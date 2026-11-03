// Usuario actual del panel y equipo. Server-only.
//
// La cookie trae {uid, role, acc, ver}; acá se confirma contra la base que la
// persona siga activa, en la misma cuenta, y que la sesión no haya sido
// invalidada (session_version). Si la cuenta está suspendida, solo entra el superadmin.
// uid 0 = acceso inicial (contraseña compartida): es un superadmin y solo vale
// mientras no exista ningún superadmin activo, para poder crear el primero.

import { cookies } from "next/headers";
import { parseSessionToken, SESSION_COOKIE, type SessionPayload } from "../auth";
import { isDbConfigured } from "../db";
import type { AccountsRepo } from "./accounts-repo";
import { getMySqlAccountsRepo } from "./accounts-mysql";
import { CHANNEL_IDS, type ChannelId } from "./channels";
import { accountPath, ROLE_LABELS, type CrmRole } from "./permissions";
import { getMySqlUsersRepo } from "./users-mysql";
import type { UsersRepo } from "./users-repo";

export type { CrmRole };
export { ROLE_LABELS };

export interface CrmUser {
  id: number;
  name: string;
  email: string | null;
  role: CrmRole;
  // Cuenta de la persona; null para el superadmin (entra a todas).
  accountId: number | null;
  channels: ChannelId[];
  // Acceso inicial con la contraseña compartida (sin usuario en web_users)
  bootstrap?: boolean;
}

export const BOOTSTRAP_USER_ID = 0;

function bootstrapUser(): CrmUser {
  return {
    id: BOOTSTRAP_USER_ID,
    name: process.env.ADMIN_DISPLAY_NAME || "DigiBot",
    email: null,
    role: "superadmin",
    accountId: null,
    channels: [...CHANNEL_IDS],
    bootstrap: true,
  };
}

function usersRepo(): UsersRepo | null {
  return isDbConfigured() ? getMySqlUsersRepo() : null;
}

function accountsRepo(): AccountsRepo | null {
  return isDbConfigured() ? getMySqlAccountsRepo() : null;
}

// ¿Se puede entrar con la contraseña compartida? Solo si no hay superadmins activos.
export async function isBootstrapMode(repo: UsersRepo | null = usersRepo()) {
  if (!repo) return true;
  try {
    return (await repo.countActiveSuperadmins()) === 0;
  } catch (err) {
    // Sin las tablas (migraciones 0008/0009 sin correr) se sigue con el acceso inicial.
    console.error("[crm] No se pudo consultar web_users:", (err as Error).message);
    return true;
  }
}

export async function resolveSessionUser(
  payload: SessionPayload | null,
  repo: UsersRepo | null = usersRepo(),
  accounts: AccountsRepo | null = accountsRepo()
): Promise<CrmUser | null> {
  if (!payload) return null;
  if (payload.uid === BOOTSTRAP_USER_ID) {
    return payload.role === "superadmin" && (await isBootstrapMode(repo)) ? bootstrapUser() : null;
  }
  if (!repo) return null;
  try {
    const user = await repo.getById(payload.uid);
    if (!user || user.status !== "active" || user.sessionVersion !== payload.ver || user.role !== payload.role) {
      return null;
    }
    const accountId = user.role === "superadmin" ? null : user.accountId;
    if (user.role !== "superadmin") {
      if (accountId === null || accountId !== payload.acc) return null;
      const account = accounts ? await accounts.get(accountId) : null;
      if (accounts && (!account || account.status === "suspended")) return null;
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountId,
      channels: user.role === "agent" ? user.channels : [...CHANNEL_IDS],
    };
  } catch (err) {
    console.error("[crm] No se pudo validar la sesión:", (err as Error).message);
    return null;
  }
}

export async function getCurrentUser(): Promise<CrmUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSessionUser(await parseSessionToken(token));
}

// A dónde va cada persona al entrar: el superadmin, al listado de cuentas; el resto, a su bandeja.
export function homePath(user: Pick<CrmUser, "role" | "accountId">) {
  return user.role === "superadmin" || user.accountId === null ? "/admin/cuentas" : accountPath(user.accountId);
}

// Personas activas de la cuenta a las que se puede asignar una conversación.
// Si quien mira es superadmin, también aparece (puede tomar conversaciones).
export async function getTeam(accountId: number, current?: CrmUser | null): Promise<{ id: number; name: string }[]> {
  const me = current ?? (await getCurrentUser());
  const team: { id: number; name: string }[] = [];
  const repo = usersRepo();
  if (repo) {
    try {
      for (const u of await repo.listByAccount(accountId)) {
        if (u.status === "active") team.push({ id: u.id, name: u.name });
      }
    } catch (err) {
      console.error("[crm] No se pudo listar el equipo:", (err as Error).message);
    }
  }
  if (me && !team.some((m) => m.id === me.id)) team.unshift({ id: me.id, name: me.name });
  return team;
}
