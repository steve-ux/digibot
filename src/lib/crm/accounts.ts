// Alta y edición de cuentas (solo superadmin). Server-only.
// Una cuenta nueva nace con las etiquetas que propone la plataforma y, si se
// indica, con su primer administrador invitado.

import type { AccountsRepo, AccountStatus } from "./accounts-repo";
import type { SettingsRepo } from "./settings-repo";
import { createUser, TeamError, validateEmail, validateName, type TeamActor } from "./team";
import type { UsersRepo } from "./users-repo";

export type AccountFieldErrors = Partial<Record<"name" | "adminName" | "adminEmail" | "status" | "form", string>>;

export class AccountError extends Error {
  constructor(
    public readonly fields: AccountFieldErrors,
    public readonly httpStatus = 400
  ) {
    super(Object.values(fields)[0] ?? "Datos inválidos.");
  }
}

const STATUSES: AccountStatus[] = ["onboarding", "active", "suspended"];

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function accountNameProblem(name: string) {
  if (name.length < 2) return "Escribí el nombre del negocio.";
  if (name.length > 120) return "El nombre es demasiado largo.";
  return null;
}

export async function createAccount(
  repos: { accounts: AccountsRepo; users: UsersRepo; settings: SettingsRepo },
  actor: TeamActor,
  body: unknown
) {
  const data = (body ?? {}) as Record<string, unknown>;
  const name = cleanName(data.name);
  const adminName = cleanName(data.adminName);
  const adminEmail = typeof data.adminEmail === "string" ? data.adminEmail.trim().toLowerCase() : "";
  const withAdmin = Boolean(adminName || adminEmail);

  const errors: AccountFieldErrors = {};
  const nameProblem = accountNameProblem(name);
  if (nameProblem) errors.name = nameProblem;
  if (withAdmin) {
    const adminNameProblem = validateName(adminName);
    const adminEmailProblem = validateEmail(adminEmail);
    if (adminNameProblem) errors.adminName = adminNameProblem;
    if (adminEmailProblem) errors.adminEmail = adminEmailProblem;
  }
  if (Object.keys(errors).length) throw new AccountError(errors);
  // Se revisa antes de crear la cuenta para no dejar una cuenta a medias.
  if (withAdmin && (await repos.users.getByEmail(adminEmail))) {
    throw new AccountError({ adminEmail: "Ya hay una persona con ese email." }, 409);
  }

  const accountId = await repos.accounts.create(name);
  await repos.settings.seedDefaultLabels(accountId);

  let admin: Awaited<ReturnType<typeof createUser>> | null = null;
  if (withAdmin) {
    try {
      admin = await createUser(repos.users, actor, accountId, {
        name: adminName,
        email: adminEmail,
        role: "admin",
        channels: [],
      });
    } catch (err) {
      if (err instanceof TeamError) {
        throw new AccountError({ adminEmail: err.fields.email, adminName: err.fields.name, form: err.fields.form }, err.httpStatus);
      }
      throw err;
    }
  }
  const account = (await repos.accounts.get(accountId))!;
  return { account, admin: admin?.user ?? null, inviteToken: admin?.inviteToken ?? null };
}

export async function updateAccount(repo: AccountsRepo, id: number, body: unknown) {
  const current = await repo.get(id);
  if (!current) throw new AccountError({ form: "La cuenta no existe." }, 404);
  const data = (body ?? {}) as Record<string, unknown>;
  const patch: { name?: string; status?: AccountStatus } = {};
  if (data.name !== undefined) {
    const name = cleanName(data.name);
    const problem = accountNameProblem(name);
    if (problem) throw new AccountError({ name: problem });
    patch.name = name;
  }
  if (data.status !== undefined) {
    if (!STATUSES.includes(data.status as AccountStatus)) throw new AccountError({ status: "Estado inválido." });
    patch.status = data.status as AccountStatus;
  }
  await repo.update(id, patch);
  return (await repo.get(id))!;
}
