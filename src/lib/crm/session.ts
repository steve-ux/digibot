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
  // Cuenta suspendida por falta de pago: el admin solo puede entrar a pagar
  // (Configuración → Suscripción). El resto del panel y de las APIs queda cerrado.
  billingLocked?: boolean;
}

export const BOOTSTRAP_USER_ID = 0;

// La única pantalla que ve una cuenta suspendida por falta de pago.
export const billingPagePath = (accountId: number) => accountPath(accountId, "configuracion?tab=suscripcion");

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

// ¿La cuenta está suspendida por el cobro (y no a mano por el equipo)? Ver migración 0018.
export async function isBillingSuspended(accountId: number): Promise<boolean> {
  if (!isDbConfigured()) return false;
  try {
    const { getPool } = await import("../db");
    const [rows] = await getPool().query<import("mysql2").RowDataPacket[]>(
      `SELECT bot_disabled_reason FROM web_clients WHERE id = ? AND status = 'suspended'`,
      [accountId]
    );
    return ["billing_suspended", "subscription_ended"].includes(String(rows[0]?.bot_disabled_reason ?? ""));
  } catch {
    return false;
  }
}

export async function resolveSessionUser(
  payload: SessionPayload | null,
  repo: UsersRepo | null = usersRepo(),
  accounts: AccountsRepo | null = accountsRepo(),
  billingSuspended: (accountId: number) => Promise<boolean> = isBillingSuspended
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
    let billingLocked = false;
    if (user.role !== "superadmin") {
      if (accountId === null || accountId !== payload.acc) return null;
      const account = accounts ? await accounts.get(accountId) : null;
      if (accounts && !account) return null;
      if (account?.status === "suspended") {
        // Suspendida por falta de pago: solo el admin entra, y solo a pagar.
        if (user.role !== "admin" || !(await billingSuspended(accountId))) return null;
        billingLocked = true;
      }
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountId,
      channels: user.role === "agent" ? user.channels : [...CHANNEL_IDS],
      ...(billingLocked ? { billingLocked: true } : {}),
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
export function homePath(user: Pick<CrmUser, "role" | "accountId" | "billingLocked">) {
  if (user.billingLocked && user.accountId !== null) return billingPagePath(user.accountId);
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
