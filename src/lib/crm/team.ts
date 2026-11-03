// Reglas de Equipo: alta por invitación, edición, desactivación y login.
// Server-only (usa scrypt); recibe el repositorio para poder testearse en memoria.
//
// Cada persona pertenece a una cuenta, salvo el superadmin (equipo de DigiBot),
// que entra a todas. Solo un superadmin da o saca el rol de administrador.

import { CHANNEL_IDS, type ChannelId } from "./channels";
import { hashInviteToken, hashPassword, newInviteToken, passwordProblem, verifyPassword } from "./passwords";
import { assignableRoles, isAccountRole, type AccountRole, type CrmRole } from "./permissions";
import type { UserRecord, UsersRepo, UserStatus } from "./users-repo";

export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Lo que viaja al navegador (sin hashes ni tokens).
export interface TeamUser {
  id: number;
  accountId: number | null;
  name: string;
  email: string;
  role: CrmRole;
  channels: ChannelId[];
  status: UserStatus;
  inviteExpiresAt: number | null;
  lastLoginAt: number | null;
}

// Quién hace el cambio.
export interface TeamActor {
  id: number;
  role: CrmRole;
}

export function toTeamUser(u: UserRecord): TeamUser {
  return {
    id: u.id,
    accountId: u.accountId,
    name: u.name,
    email: u.email,
    role: u.role,
    channels: u.role === "agent" ? u.channels : [...CHANNEL_IDS],
    status: u.status,
    inviteExpiresAt: u.inviteExpiresAt,
    lastLoginAt: u.lastLoginAt,
  };
}

export type FieldErrors = Partial<Record<"name" | "email" | "role" | "channels" | "password" | "form", string>>;

export class TeamError extends Error {
  constructor(
    public readonly fields: FieldErrors,
    public readonly httpStatus = 400
  ) {
    super(Object.values(fields)[0] ?? "Datos inválidos.");
  }
}

export interface UserInput {
  name: string;
  email: string;
  role: AccountRole;
  channels: ChannelId[];
}

const nowUnix = () => Math.floor(Date.now() / 1000);
const DUPLICATE_EMAIL = "Ya hay una persona con ese email.";
const NOT_FOUND = () => new TeamError({ form: "La persona no existe." }, 404);

export function parseUserInput(body: unknown, partial = false): Partial<UserInput> {
  const data = (body ?? {}) as Record<string, unknown>;
  const out: Partial<UserInput> = {};
  if (typeof data.name === "string") out.name = data.name.trim().replace(/\s+/g, " ");
  if (typeof data.email === "string") out.email = data.email.trim().toLowerCase();
  if (isAccountRole(data.role)) out.role = data.role;
  if (Array.isArray(data.channels)) out.channels = CHANNEL_IDS.filter((c) => (data.channels as unknown[]).includes(c));
  if (!partial) {
    out.name ??= "";
    out.email ??= "";
  }
  return out;
}

export function validateName(name: string | undefined) {
  if (!name || name.length < 2) return "Escribí el nombre (al menos 2 letras).";
  if (name.length > 120) return "El nombre es demasiado largo.";
  return null;
}

export function validateEmail(email: string | undefined) {
  return !email || !EMAIL_RE.test(email) || email.length > 191 ? "Revisá el email." : null;
}

export function validateUserInput(input: Partial<UserInput>, partial = false): FieldErrors {
  const errors: FieldErrors = {};
  if (!partial || input.name !== undefined) {
    const problem = validateName(input.name);
    if (problem) errors.name = problem;
  }
  if (!partial || input.email !== undefined) {
    const problem = validateEmail(input.email);
    if (problem) errors.email = problem;
  }
  if (!partial && !input.role) errors.role = "Elegí qué puede hacer.";
  if ((input.role ?? "agent") === "agent" && (!partial || input.channels !== undefined)) {
    if (!input.channels || input.channels.length === 0) errors.channels = "Elegí al menos un canal.";
  }
  return errors;
}

function isDuplicate(err: unknown) {
  return (err as { code?: string })?.code === "ER_DUP_ENTRY";
}

function assertCanGrant(actor: TeamActor, role: AccountRole) {
  if (!assignableRoles(actor.role).includes(role)) {
    throw new TeamError({ role: "Solo un superadmin puede crear administradores." }, 403);
  }
}

// La persona tiene que ser de esta cuenta, y quien la toca tiene que poder manejar su rol.
async function loadMember(repo: UsersRepo, actor: TeamActor, accountId: number, id: number) {
  const user = await repo.getById(id);
  if (!user || user.role === "superadmin" || user.accountId !== accountId) throw NOT_FOUND();
  if (user.id !== actor.id && isAccountRole(user.role) && !assignableRoles(actor.role).includes(user.role)) {
    throw new TeamError({ form: "Solo un superadmin puede modificar a un administrador." }, 403);
  }
  return user;
}

export async function createUser(repo: UsersRepo, actor: TeamActor, accountId: number, body: unknown) {
  const input = parseUserInput(body) as UserInput;
  const errors = validateUserInput(input);
  if (Object.keys(errors).length) throw new TeamError(errors);
  assertCanGrant(actor, input.role);
  if (await repo.getByEmail(input.email)) throw new TeamError({ email: DUPLICATE_EMAIL }, 409);

  const invite = newInviteToken();
  try {
    const id = await repo.create({
      accountId,
      name: input.name,
      email: input.email,
      role: input.role,
      channels: input.role === "agent" ? input.channels : [...CHANNEL_IDS],
      inviteTokenHash: invite.hash,
      inviteExpiresAt: nowUnix() + INVITE_TTL_SECONDS,
    });
    const user = await repo.getById(id);
    if (!user) throw new Error("No se encontró el usuario recién creado.");
    return { user: toTeamUser(user), inviteToken: invite.token };
  } catch (err) {
    if (isDuplicate(err)) throw new TeamError({ email: DUPLICATE_EMAIL }, 409);
    throw err;
  }
}

// Que una cuenta no se quede sin un administrador activo. El superadmin puede
// saltearse la regla (por ejemplo, para cambiar al dueño de una cuenta).
async function assertKeepsAnAdmin(
  repo: UsersRepo,
  actor: TeamActor,
  current: UserRecord,
  nextRole: CrmRole,
  nextStatus: UserStatus
) {
  if (actor.role === "superadmin" || current.accountId === null) return;
  const wasActiveAdmin = current.role === "admin" && current.status === "active";
  const staysActiveAdmin = nextRole === "admin" && nextStatus === "active";
  if (wasActiveAdmin && !staysActiveAdmin && (await repo.countActiveAdmins(current.accountId)) <= 1) {
    throw new TeamError({ form: "Tiene que quedar al menos un administrador activo." }, 409);
  }
}

function nextStatusFor(current: UserRecord, requested: unknown): UserStatus {
  if (requested === "disabled") return "disabled";
  // Reactivar: vuelve a "activo" si ya tenía contraseña; si no, sigue invitado.
  if (requested === "active" && current.status === "disabled") return current.passwordHash ? "active" : "invited";
  return current.status;
}

export async function updateUser(repo: UsersRepo, actor: TeamActor, accountId: number, id: number, body: unknown) {
  const current = await loadMember(repo, actor, accountId, id);
  const input = parseUserInput(body, true);
  const data = (body ?? {}) as Record<string, unknown>;

  const role = (input.role ?? current.role) as AccountRole;
  if (role !== current.role) {
    assertCanGrant(actor, role);
    if (id === actor.id) throw new TeamError({ role: "No podés cambiar tu propio rol." });
  }
  const merged = { ...input, role };
  if (role === "agent" && input.channels === undefined && current.role !== "agent") {
    // Pasa a agente sin elegir canales: se le exige elegirlos.
    merged.channels = [];
  }
  const errors = validateUserInput(merged, true);
  if (Object.keys(errors).length) throw new TeamError(errors);

  if (input.email && input.email !== current.email) {
    if (current.status !== "invited") {
      throw new TeamError({ email: "El email solo se puede cambiar antes de que acepte la invitación." });
    }
    if (await repo.getByEmail(input.email)) throw new TeamError({ email: DUPLICATE_EMAIL }, 409);
  }

  const nextStatus = nextStatusFor(current, data.status);
  if (id === actor.id && nextStatus === "disabled") {
    throw new TeamError({ form: "No podés desactivar tu propio acceso." });
  }
  await assertKeepsAnAdmin(repo, actor, current, role, nextStatus);

  try {
    await repo.update(id, {
      name: input.name,
      email: input.email,
      role,
      channels: role === "agent" ? (merged.channels ?? current.channels) : [...CHANNEL_IDS],
      status: nextStatus,
      // Desactivar o cambiar el rol corta las sesiones abiertas.
      sessionVersion:
        nextStatus !== current.status || role !== current.role ? current.sessionVersion + 1 : undefined,
    });
  } catch (err) {
    if (isDuplicate(err)) throw new TeamError({ email: DUPLICATE_EMAIL }, 409);
    throw err;
  }
  return toTeamUser((await repo.getById(id))!);
}

// Link nuevo: para quien todavía no aceptó la invitación, o para restablecer la
// contraseña de alguien activo que se la olvidó. El link anterior deja de servir.
async function issueInvite(repo: UsersRepo, user: UserRecord) {
  if (user.status === "disabled") throw new TeamError({ form: "Primero reactivá el acceso de esta persona." }, 409);
  const invite = newInviteToken();
  await repo.update(user.id, { inviteTokenHash: invite.hash, inviteExpiresAt: nowUnix() + INVITE_TTL_SECONDS });
  return { inviteToken: invite.token };
}

export async function regenerateInvite(repo: UsersRepo, actor: TeamActor, accountId: number, id: number) {
  return issueInvite(repo, await loadMember(repo, actor, accountId, id));
}

// ---------- Superadmins (equipo de DigiBot) ----------

// Alta de un superadmin. Si el email ya existe (por ejemplo, el administrador que
// creaste con la cuenta inicial), se lo pasa a superadmin y conserva su contraseña.
export async function createSuperadmin(repo: UsersRepo, body: unknown) {
  const input = parseUserInput(body);
  const errors: FieldErrors = {};
  const nameProblem = validateName(input.name);
  const emailProblem = validateEmail(input.email);
  if (nameProblem) errors.name = nameProblem;
  if (emailProblem) errors.email = emailProblem;
  if (Object.keys(errors).length) throw new TeamError(errors);

  const existing = await repo.getByEmail(input.email!);
  if (existing) {
    if (existing.role === "superadmin") throw new TeamError({ email: "Esa persona ya es superadmin." }, 409);
    await repo.update(existing.id, {
      role: "superadmin",
      accountId: null,
      channels: [...CHANNEL_IDS],
      sessionVersion: existing.sessionVersion + 1,
    });
    const promoted = (await repo.getById(existing.id))!;
    const inviteToken = promoted.status === "invited" ? (await issueInvite(repo, promoted)).inviteToken : null;
    return { user: toTeamUser(promoted), inviteToken, promoted: true };
  }

  const invite = newInviteToken();
  const id = await repo.create({
    accountId: null,
    name: input.name!,
    email: input.email!,
    role: "superadmin",
    channels: [...CHANNEL_IDS],
    inviteTokenHash: invite.hash,
    inviteExpiresAt: nowUnix() + INVITE_TTL_SECONDS,
  });
  return { user: toTeamUser((await repo.getById(id))!), inviteToken: invite.token, promoted: false };
}

async function loadSuperadmin(repo: UsersRepo, id: number) {
  const user = await repo.getById(id);
  if (!user || user.role !== "superadmin") throw NOT_FOUND();
  return user;
}

export async function updateSuperadmin(repo: UsersRepo, actor: TeamActor, id: number, body: unknown) {
  const current = await loadSuperadmin(repo, id);
  const data = (body ?? {}) as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim().replace(/\s+/g, " ") : undefined;
  if (name !== undefined) {
    const problem = validateName(name);
    if (problem) throw new TeamError({ name: problem });
  }
  const nextStatus = nextStatusFor(current, data.status);
  if (nextStatus === "disabled" && current.status !== "disabled") {
    if (id === actor.id) throw new TeamError({ form: "No podés desactivar tu propio acceso." });
    if (current.status === "active" && (await repo.countActiveSuperadmins()) <= 1) {
      throw new TeamError({ form: "Tiene que quedar al menos un superadmin activo." }, 409);
    }
  }
  await repo.update(id, {
    name,
    status: nextStatus,
    sessionVersion: nextStatus !== current.status ? current.sessionVersion + 1 : undefined,
  });
  return toTeamUser((await repo.getById(id))!);
}

export async function regenerateSuperadminInvite(repo: UsersRepo, id: number) {
  return issueInvite(repo, await loadSuperadmin(repo, id));
}

// ---------- Invitación y login ----------

export async function findInvite(repo: UsersRepo, token: string) {
  if (!token || token.length > 200) return null;
  const user = await repo.getByInviteHash(hashInviteToken(token));
  if (!user || user.status === "disabled" || !user.inviteExpiresAt || user.inviteExpiresAt < nowUnix()) return null;
  return user;
}

export async function acceptInvite(repo: UsersRepo, token: string, password: string) {
  const user = await findInvite(repo, token);
  if (!user) throw new TeamError({ form: "El link venció o ya se usó. Pedile a un administrador uno nuevo." }, 410);
  const problem = passwordProblem(password);
  if (problem) throw new TeamError({ password: problem });
  await repo.update(user.id, {
    passwordHash: await hashPassword(password),
    status: "active",
    inviteTokenHash: null,
    inviteExpiresAt: null,
    sessionVersion: user.sessionVersion + 1,
    lastLoginAt: nowUnix(),
  });
  return (await repo.getById(user.id))!;
}

export async function authenticate(repo: UsersRepo, email: string, password: string) {
  const user = await repo.getByEmail(email.trim().toLowerCase());
  // Se verifica igual aunque no exista, para no revelar qué emails existen por el tiempo de respuesta.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || user.status !== "active") return null;
  await repo.update(user.id, { lastLoginAt: nowUnix() });
  return user;
}

// Datos de la sesión firmada para una persona.
export function sessionFor(user: UserRecord) {
  return { uid: user.id, role: user.role, acc: user.role === "superadmin" ? null : user.accountId, ver: user.sessionVersion };
}

const DUMMY_HASH =
  "scrypt$16384$8$1$00000000000000000000000000000000$" + "0".repeat(128);
