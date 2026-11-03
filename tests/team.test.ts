import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, parseSessionToken } from "@/lib/auth";
import { MemoryAccountsRepo } from "@/lib/crm/accounts-repo";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/crm/passwords";
import {
  accountPath,
  allowedChannels,
  assignableRoles,
  canAccess,
  canEnterAccount,
  canUseChannel,
  parseAccountRoute,
} from "@/lib/crm/permissions";
import { homePath, resolveSessionUser } from "@/lib/crm/session";
import {
  acceptInvite,
  authenticate,
  createSuperadmin,
  createUser,
  findInvite,
  regenerateInvite,
  sessionFor,
  TeamError,
  updateSuperadmin,
  updateUser,
  type TeamActor,
} from "@/lib/crm/team";
import { MemoryUsersRepo } from "@/lib/crm/users-repo";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const ACC = 1;
const SUPER: TeamActor = { id: 999, role: "superadmin" };

let repo: MemoryUsersRepo;
let accounts: MemoryAccountsRepo;

beforeEach(async () => {
  vi.stubEnv("ADMIN_SESSION_SECRET", "test-secret-1234567890");
  repo = new MemoryUsersRepo();
  accounts = new MemoryAccountsRepo();
  await accounts.create("Óptica Sol"); // cuenta 1
  await accounts.create("Pizzería Roma"); // cuenta 2
});
afterEach(() => vi.unstubAllEnvs());

async function activeUser(
  email: string,
  role: "admin" | "supervisor" | "agent",
  channels: string[] = ["wa"],
  accountId = ACC
) {
  const { user, inviteToken } = await createUser(repo, SUPER, accountId, { name: email.split("@")[0], email, role, channels });
  await acceptInvite(repo, inviteToken, "una-clave-larga-123");
  return (await repo.getById(user.id))!;
}

async function activeSuperadmin(email: string) {
  const { user, inviteToken } = await createSuperadmin(repo, { name: email.split("@")[0], email });
  await acceptInvite(repo, inviteToken!, "una-clave-larga-123");
  return (await repo.getById(user.id))!;
}

const payloadOf = (u: { id: number; role: never | string; accountId: number | null; sessionVersion: number }) => ({
  ...sessionFor(u as Parameters<typeof sessionFor>[0]),
  exp: Date.now() + 1e6,
});

describe("sesión firmada", () => {
  it("firma y lee uid, rol, cuenta y versión", async () => {
    const token = await createSessionToken({ uid: 7, role: "agent", acc: 3, ver: 3 });
    expect(await parseSessionToken(token)).toMatchObject({ uid: 7, role: "agent", acc: 3, ver: 3 });
  });

  it("rechaza tokens adulterados (ej. subirse el rol o cambiarse de cuenta)", async () => {
    const token = await createSessionToken({ uid: 7, role: "agent", acc: 1, ver: 1 });
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: 7, role: "superadmin", acc: null, ver: 1, exp: Date.now() + 1e6 }))
      .toString("base64url");
    expect(await parseSessionToken(`${forged}.${sig}`)).toBeNull();
    expect(await parseSessionToken("basura")).toBeNull();
  });

  it("el superadmin no tiene cuenta y el resto siempre tiene una", async () => {
    expect(await parseSessionToken(await createSessionToken({ uid: 1, role: "superadmin", acc: null, ver: 1 }))).not.toBeNull();
    expect(await parseSessionToken(await createSessionToken({ uid: 1, role: "superadmin", acc: 3, ver: 1 }))).toBeNull();
    expect(await parseSessionToken(await createSessionToken({ uid: 1, role: "admin", acc: null, ver: 1 }))).toBeNull();
  });

  it("rechaza tokens vencidos", async () => {
    vi.useFakeTimers();
    const token = await createSessionToken({ uid: 1, role: "admin", acc: 1, ver: 1 });
    vi.setSystemTime(Date.now() + 13 * 60 * 60 * 1000);
    expect(await parseSessionToken(token)).toBeNull();
    vi.useRealTimers();
  });
});

describe("contraseñas", () => {
  it("hashea con scrypt y verifica", async () => {
    const hash = await hashPassword("una-clave-larga-123");
    expect(hash).toMatch(/^scrypt\$/);
    expect(await verifyPassword("una-clave-larga-123", hash)).toBe(true);
    expect(await verifyPassword("otra-clave-larga-123", hash)).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
  });

  it("pide al menos 10 caracteres", () => {
    expect(passwordProblem("corta")).toMatch(/10/);
    expect(passwordProblem("suficientemente-larga")).toBeNull();
  });
});

describe("Equipo", () => {
  it("crea a la persona en la cuenta, invitada y con un link de un solo uso", async () => {
    const { user, inviteToken } = await createUser(repo, SUPER, ACC, {
      name: "  Sofía   Rivas ",
      email: "Sofia@OpticaSol.com",
      role: "agent",
      channels: ["wa", "ig", "x"],
    });
    expect(user).toMatchObject({ accountId: ACC, name: "Sofía Rivas", email: "sofia@opticasol.com", status: "invited", channels: ["wa", "ig"] });
    expect(repo.users[0].inviteTokenHash).not.toBe(inviteToken); // se guarda el hash, no el token

    const accepted = await acceptInvite(repo, inviteToken, "una-clave-larga-123");
    expect(accepted).toMatchObject({ status: "active", inviteTokenHash: null });
    await expect(acceptInvite(repo, inviteToken, "una-clave-larga-123")).rejects.toMatchObject({ httpStatus: 410 });
  });

  it("valida los datos y no repite emails (ni entre cuentas)", async () => {
    await expect(createUser(repo, SUPER, ACC, { name: "A", email: "mal", role: "agent", channels: [] })).rejects.toMatchObject({
      fields: { name: expect.any(String), email: expect.any(String), channels: expect.any(String) },
    });
    await createUser(repo, SUPER, ACC, { name: "Sofía", email: "sofia@x.com", role: "supervisor", channels: [] });
    await expect(
      createUser(repo, SUPER, 2, { name: "Otra", email: "SOFIA@x.com", role: "agent", channels: ["wa"] })
    ).rejects.toMatchObject({ fields: { email: "Ya hay una persona con ese email." } });
  });

  it("solo un superadmin crea administradores", async () => {
    const admin = await activeUser("admin@x.com", "admin");
    const actor: TeamActor = { id: admin.id, role: "admin" };
    await expect(
      createUser(repo, actor, ACC, { name: "Otro admin", email: "otro@x.com", role: "admin", channels: [] })
    ).rejects.toMatchObject({ httpStatus: 403 });
    const { user } = await createUser(repo, actor, ACC, { name: "Diego", email: "d@x.com", role: "supervisor", channels: [] });
    expect(user.role).toBe("supervisor");
    // Tampoco puede ascender a alguien a administrador ni tocar a otro administrador.
    await expect(updateUser(repo, actor, ACC, user.id, { role: "admin" })).rejects.toMatchObject({ httpStatus: 403 });
    const other = await activeUser("admin2@x.com", "admin");
    await expect(updateUser(repo, actor, ACC, other.id, { name: "Cambio" })).rejects.toMatchObject({ httpStatus: 403 });
    expect(assignableRoles("admin")).toEqual(["supervisor", "agent"]);
  });

  it("no se puede tocar a alguien de otra cuenta", async () => {
    const ajena = await activeUser("roma@x.com", "agent", ["wa"], 2);
    await expect(updateUser(repo, SUPER, ACC, ajena.id, { name: "X" })).rejects.toMatchObject({ httpStatus: 404 });
    await expect(regenerateInvite(repo, SUPER, ACC, ajena.id)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it("los administradores y supervisores ven todos los canales", async () => {
    const { user } = await createUser(repo, SUPER, ACC, { name: "Diego", email: "d@x.com", role: "supervisor", channels: [] });
    expect(user.channels).toHaveLength(6);
  });

  it("los links vencen a los 7 días", async () => {
    const { inviteToken } = await createUser(repo, SUPER, ACC, { name: "Ana", email: "a@x.com", role: "agent", channels: ["wa"] });
    repo.users[0].inviteExpiresAt = Math.floor(Date.now() / 1000) - 1;
    expect(await findInvite(repo, inviteToken)).toBeNull();
  });

  it("una cuenta no se queda sin administrador (salvo que lo haga un superadmin)", async () => {
    const admin = await activeUser("admin@x.com", "admin");
    const actor: TeamActor = { id: admin.id, role: "admin" };
    await expect(updateUser(repo, actor, ACC, admin.id, { status: "disabled" })).rejects.toBeInstanceOf(TeamError);

    const helper = await activeUser("helper@x.com", "supervisor");
    const helperActor: TeamActor = { id: helper.id, role: "supervisor" };
    // Un supervisor no puede ni tocar administradores.
    await expect(updateUser(repo, helperActor, ACC, admin.id, { status: "disabled" })).rejects.toMatchObject({ httpStatus: 403 });

    // El superadmin sí puede (por ejemplo, para cambiar al dueño de la cuenta).
    const demoted = await updateUser(repo, SUPER, ACC, admin.id, { role: "agent", channels: ["fb"] });
    expect(demoted).toMatchObject({ role: "agent", channels: ["fb"] });
  });

  it("no podés quitarte el acceso ni cambiarte el rol", async () => {
    const me = await activeUser("a2@x.com", "admin");
    const actor: TeamActor = { id: me.id, role: "admin" };
    await expect(updateUser(repo, actor, ACC, me.id, { status: "disabled" })).rejects.toMatchObject({
      fields: { form: "No podés desactivar tu propio acceso." },
    });
    await expect(updateUser(repo, actor, ACC, me.id, { role: "agent", channels: ["wa"] })).rejects.toBeInstanceOf(TeamError);
    // Su nombre sí lo puede cambiar.
    expect(await updateUser(repo, actor, ACC, me.id, { name: "Nuevo nombre" })).toMatchObject({ name: "Nuevo nombre" });
  });

  it("quitar el acceso o cambiar el rol corta las sesiones abiertas", async () => {
    const agent = await activeUser("sofia@x.com", "agent");
    const before = agent.sessionVersion;
    await updateUser(repo, SUPER, ACC, agent.id, { role: "supervisor" });
    expect((await repo.getById(agent.id))!.sessionVersion).toBe(before + 1);
    await updateUser(repo, SUPER, ACC, agent.id, { status: "disabled" });
    expect((await repo.getById(agent.id))!.sessionVersion).toBe(before + 2);
  });

  it("el email solo se cambia mientras está invitado", async () => {
    const agent = await activeUser("sofia@x.com", "agent");
    await expect(updateUser(repo, SUPER, ACC, agent.id, { email: "nuevo@x.com" })).rejects.toBeInstanceOf(TeamError);
  });

  it("un link nuevo sirve para restablecer la contraseña de alguien activo", async () => {
    const agent = await activeUser("sofia@x.com", "agent");
    const { inviteToken } = await regenerateInvite(repo, SUPER, ACC, agent.id);
    await acceptInvite(repo, inviteToken, "otra-clave-nueva-456");
    expect(await authenticate(repo, "sofia@x.com", "otra-clave-nueva-456")).not.toBeNull();
    expect(await authenticate(repo, "sofia@x.com", "una-clave-larga-123")).toBeNull();
  });

  it("solo entran las personas activas con la contraseña correcta", async () => {
    const agent = await activeUser("sofia@x.com", "agent");
    expect(await authenticate(repo, " SOFIA@x.com ", "una-clave-larga-123")).toMatchObject({ id: agent.id });
    expect(await authenticate(repo, "sofia@x.com", "mala-clave-123456")).toBeNull();
    expect(await authenticate(repo, "nadie@x.com", "una-clave-larga-123")).toBeNull();
    await updateUser(repo, SUPER, ACC, agent.id, { status: "disabled" });
    expect(await authenticate(repo, "sofia@x.com", "una-clave-larga-123")).toBeNull();
  });
});

describe("Superadmins", () => {
  it("se crean sin cuenta y entran a todas", async () => {
    const sa = await activeSuperadmin("esteban@digibot.com");
    expect(sa).toMatchObject({ role: "superadmin", accountId: null });
    expect(sessionFor(sa)).toMatchObject({ role: "superadmin", acc: null });
    expect(canEnterAccount({ role: "superadmin", acc: null }, 2)).toBe(true);
    expect(canEnterAccount({ role: "admin", acc: 1 }, 2)).toBe(false);
    expect(homePath({ role: "superadmin", accountId: null })).toBe("/admin/cuentas");
    expect(homePath({ role: "agent", accountId: 7 })).toBe("/admin/cuentas/7/conversaciones");
  });

  it("si el email ya existe, esa persona pasa a superadmin y conserva su contraseña", async () => {
    const admin = await activeUser("esteban@digibot.com", "admin");
    const { user, inviteToken, promoted } = await createSuperadmin(repo, { name: "Esteban", email: "ESTEBAN@digibot.com" });
    expect(promoted).toBe(true);
    expect(inviteToken).toBeNull();
    expect(user).toMatchObject({ id: admin.id, role: "superadmin", accountId: null });
    expect(await authenticate(repo, "esteban@digibot.com", "una-clave-larga-123")).not.toBeNull();
    // Su sesión anterior (de admin) deja de valer.
    expect((await repo.getById(admin.id))!.sessionVersion).toBe(admin.sessionVersion + 1);
  });

  it("siempre queda al menos un superadmin activo", async () => {
    const a = await activeSuperadmin("ana@digibot.com");
    const b = await activeSuperadmin("beto@digibot.com");
    await expect(updateSuperadmin(repo, { id: a.id, role: "superadmin" }, a.id, { status: "disabled" })).rejects.toBeInstanceOf(TeamError);
    await updateSuperadmin(repo, { id: a.id, role: "superadmin" }, b.id, { status: "disabled" });
    expect((await repo.getById(b.id))!.status).toBe("disabled");
    // a es el único activo: b no lo puede desactivar (además, b ya no tiene acceso).
    await expect(updateSuperadmin(repo, { id: b.id, role: "superadmin" }, a.id, { status: "disabled" })).rejects.toMatchObject({
      fields: { form: "Tiene que quedar al menos un superadmin activo." },
    });
  });
});

describe("resolveSessionUser", () => {
  it("valida contra la base: activo, misma versión y misma cuenta", async () => {
    const agent = await activeUser("sofia@x.com", "agent", ["ig"]);
    const payload = payloadOf(agent);
    expect(await resolveSessionUser(payload, repo, accounts)).toMatchObject({ id: agent.id, role: "agent", accountId: ACC, channels: ["ig"] });

    // Un token de otra cuenta no vale (aunque la firma sea buena).
    expect(await resolveSessionUser({ ...payload, acc: 2 }, repo, accounts)).toBeNull();

    await updateUser(repo, SUPER, ACC, agent.id, { status: "disabled" });
    expect(await resolveSessionUser(payload, repo, accounts)).toBeNull();
  });

  it("si la cuenta está suspendida, solo entra el superadmin", async () => {
    const agent = await activeUser("sofia@x.com", "agent");
    const sa = await activeSuperadmin("sa@digibot.com");
    await accounts.update(ACC, { status: "suspended" });
    expect(await resolveSessionUser(payloadOf(agent), repo, accounts)).toBeNull();
    expect(await resolveSessionUser(payloadOf(sa), repo, accounts)).toMatchObject({ role: "superadmin" });
  });

  it("el acceso inicial es superadmin y solo vale mientras no haya superadmins activos", async () => {
    const bootstrap = { uid: 0, role: "superadmin" as const, acc: null, ver: 0, exp: Date.now() + 1e6 };
    expect(await resolveSessionUser(bootstrap, repo, accounts)).toMatchObject({ id: 0, bootstrap: true, role: "superadmin" });
    // Un administrador de cuenta no lo cierra: hace falta un superadmin.
    await activeUser("admin@x.com", "admin");
    expect(await resolveSessionUser(bootstrap, repo, accounts)).not.toBeNull();
    await activeSuperadmin("sa@digibot.com");
    expect(await resolveSessionUser(bootstrap, repo, accounts)).toBeNull();
  });

  it("un token uid 0 con otro rol no vale", async () => {
    expect(await resolveSessionUser({ uid: 0, role: "admin", acc: 1, ver: 0, exp: Date.now() + 1e6 }, repo, accounts)).toBeNull();
  });
});

describe("permisos", () => {
  it("cada rol accede a lo suyo", () => {
    expect(canAccess("agent", "inbox")).toBe(true);
    expect(canAccess("agent", "metrics")).toBe(false);
    expect(canAccess("supervisor", "metrics")).toBe(true);
    expect(canAccess("supervisor", "team")).toBe(false);
    expect(canAccess("supervisor", "settings")).toBe(false);
    expect(canAccess("admin", "settings")).toBe(true);
    expect(canAccess("admin", "accounts")).toBe(false);
    expect(canAccess("superadmin", "accounts")).toBe(true);
  });

  it("los agentes solo usan sus canales", () => {
    const agent = { role: "agent" as const, channels: ["wa" as const] };
    expect(canUseChannel(agent, "wa")).toBe(true);
    expect(canUseChannel(agent, "ig")).toBe(false);
    expect(allowedChannels({ role: "supervisor", channels: [] })).toHaveLength(6);
  });

  it("desarma las rutas por cuenta", () => {
    expect(parseAccountRoute("/admin/cuentas/7/conversaciones/11")).toEqual({ accountId: 7, segment: "conversaciones", section: "inbox" });
    expect(parseAccountRoute("/admin/cuentas/7/configuracion")).toMatchObject({ section: "settings" });
    expect(parseAccountRoute("/api/admin/cuentas/7/equipo/3")).toMatchObject({ accountId: 7, section: "team" });
    expect(parseAccountRoute("/api/admin/cuentas/7/plantillas-aprobadas")).toMatchObject({ section: "inbox" });
    expect(parseAccountRoute("/api/admin/cuentas/7")).toMatchObject({ accountId: 7, section: "accounts" });
    expect(parseAccountRoute("/admin/cuentas")).toMatchObject({ accountId: null, section: "accounts" });
    expect(parseAccountRoute("/admin/cuentas/abc/equipo")).toBeNull();
    expect(parseAccountRoute("/admin/cuentas/7/inventado")).toMatchObject({ section: null });
    expect(parseAccountRoute("/admin/login")).toBeUndefined();
    expect(accountPath(7)).toBe("/admin/cuentas/7/conversaciones");
  });
});
