// Persistencia de usuarios del panel. La implementación MySQL es server-only
// (getMySqlUsersRepo); MemoryUsersRepo sirve para tests y no toca la base.

import type { ChannelId } from "./channels";
import type { CrmRole } from "./permissions";

export type UserStatus = "invited" | "active" | "disabled";

export interface UserRecord {
  id: number;
  // Cuenta a la que pertenece (web_clients.id). null = superadmin.
  accountId: number | null;
  name: string;
  email: string;
  role: CrmRole;
  channels: ChannelId[];
  status: UserStatus;
  passwordHash: string | null;
  inviteTokenHash: string | null;
  // unix (segundos)
  inviteExpiresAt: number | null;
  sessionVersion: number;
  lastLoginAt: number | null;
  createdAt: number;
}

export type NewUser = Pick<
  UserRecord,
  "accountId" | "name" | "email" | "role" | "channels" | "inviteTokenHash" | "inviteExpiresAt"
>;

export type UserPatch = Partial<
  Pick<
    UserRecord,
    | "accountId"
    | "name"
    | "email"
    | "role"
    | "channels"
    | "status"
    | "passwordHash"
    | "inviteTokenHash"
    | "inviteExpiresAt"
    | "sessionVersion"
    | "lastLoginAt"
  >
>;

export interface UsersRepo {
  // Personas de una cuenta (sin superadmins).
  listByAccount(accountId: number): Promise<UserRecord[]>;
  listSuperadmins(): Promise<UserRecord[]>;
  getById(id: number): Promise<UserRecord | null>;
  getByEmail(email: string): Promise<UserRecord | null>;
  getByInviteHash(hash: string): Promise<UserRecord | null>;
  create(user: NewUser): Promise<number>;
  update(id: number, patch: UserPatch): Promise<void>;
  countActiveAdmins(accountId: number): Promise<number>;
  countActiveSuperadmins(): Promise<number>;
}

const STATUS_ORDER: Record<UserStatus, number> = { active: 0, invited: 1, disabled: 2 };
const byStatusThenName = (a: UserRecord, b: UserRecord) =>
  STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name);

export class MemoryUsersRepo implements UsersRepo {
  users: UserRecord[] = [];

  async listByAccount(accountId: number) {
    return this.users
      .filter((u) => u.accountId === accountId && u.role !== "superadmin")
      .sort(byStatusThenName)
      .map((u) => ({ ...u }));
  }
  async listSuperadmins() {
    return this.users
      .filter((u) => u.role === "superadmin")
      .sort(byStatusThenName)
      .map((u) => ({ ...u }));
  }
  async getById(id: number) {
    const u = this.users.find((x) => x.id === id);
    return u ? { ...u } : null;
  }
  async getByEmail(email: string) {
    const u = this.users.find((x) => x.email === email.toLowerCase());
    return u ? { ...u } : null;
  }
  async getByInviteHash(hash: string) {
    const u = this.users.find((x) => x.inviteTokenHash === hash);
    return u ? { ...u } : null;
  }
  async create(user: NewUser) {
    if (this.users.some((u) => u.email === user.email)) {
      throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
    }
    const id = this.users.length + 1;
    this.users.push({
      ...user,
      id,
      status: "invited",
      passwordHash: null,
      sessionVersion: 1,
      lastLoginAt: null,
      createdAt: Math.floor(Date.now() / 1000),
    });
    return id;
  }
  async update(id: number, patch: UserPatch) {
    const u = this.users.find((x) => x.id === id);
    if (u) Object.assign(u, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
  }
  async countActiveAdmins(accountId: number) {
    return this.users.filter((u) => u.accountId === accountId && u.role === "admin" && u.status === "active").length;
  }
  async countActiveSuperadmins() {
    return this.users.filter((u) => u.role === "superadmin" && u.status === "active").length;
  }
}
