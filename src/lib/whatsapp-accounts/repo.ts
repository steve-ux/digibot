// Persistencia de las cuentas de WhatsApp (web_whatsapp_connections), las sesiones de
// Embedded Signup, la cola de webhooks pesados y los contactos sincronizados.
//
// El repo trabaja con tokens y PIN en claro; la implementación MySQL (repo-mysql.ts)
// los cifra al guardar. MemoryWaRepo sirve para tests.

import type {
  DisconnectionInfo,
  HistoryStatus,
  SessionStatus,
  SignupEventRow,
  Steps,
  WaHealth,
} from "./types";

export interface WaAccount {
  id: number;
  accountId: number;
  wabaId: string;
  phoneNumberId: string;
  businessId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  accessToken: string;
  pin: string | null;
  isCoexistence: boolean;
  // connected = vinculada a la cuenta · revoked = la desconectaron desde el panel
  status: "connected" | "revoked" | "pending" | "error";
  health: WaHealth;
  disconnectionInfo: DisconnectionInfo | null;
  steps: Steps;
  syncStateRequestId: string | null;
  historyRequestId: string | null;
  historyStatus: HistoryStatus;
  historyProgress: number;
  lastError: string | null;
  lastErrorAt: number | null;
  healthCheckedAt: number | null;
  signupSessionId: string | null;
  connectedAt: number | null;
}

export interface NewWaAccount {
  accountId: number;
  wabaId: string;
  phoneNumberId: string;
  businessId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  accessToken: string;
  isCoexistence: boolean;
  signupSessionId: string | null;
  connectedBy: number | null;
  // Reconexión: los pedidos de sincronización son de un onboarding, se pueden volver a hacer.
  resetSync: boolean;
}

export type WaAccountPatch = Partial<
  Pick<
    WaAccount,
    | "displayPhoneNumber"
    | "verifiedName"
    | "pin"
    | "health"
    | "disconnectionInfo"
    | "steps"
    | "syncStateRequestId"
    | "historyRequestId"
    | "historyStatus"
    | "historyProgress"
    | "lastError"
    | "lastErrorAt"
    | "healthCheckedAt"
    | "status"
  >
>;

export interface SignupSession {
  id: string;
  accountId: number;
  userId: number | null;
  reconnectConnectionId: number | null;
  status: SessionStatus;
  accessToken: string | null;
  codeReceivedAt: number | null;
  eventType: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  businessId: string | null;
  isCoexistence: boolean;
  metaSessionId: string | null;
  currentStep: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  connectionId: number | null;
  createdAt: number;
}

export type SignupSessionPatch = Partial<Omit<SignupSession, "id" | "accountId" | "userId" | "createdAt">>;

export interface WebhookJob {
  id: number;
  field: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  payload: unknown;
  attempts: number;
}

export interface WaRepo {
  getAccount(id: number): Promise<WaAccount | null>;
  // Cualquier estado (para reconectar el mismo número y no duplicar filas)
  findByPhone(phoneNumberId: string): Promise<WaAccount | null>;
  // Vinculadas a la cuenta (status connected), también las desconectadas por Meta
  listByAccount(accountId: number): Promise<WaAccount[]>;
  listByWaba(wabaId: string): Promise<WaAccount[]>;
  listAll(): Promise<WaAccount[]>;
  // Vinculadas, no desconectadas y sin chequear desde `beforeUnix`
  listForHealthCheck(beforeUnix: number): Promise<WaAccount[]>;
  // Crea o actualiza por phone_number_id; queda connected y active. Devuelve el id.
  upsertAccount(record: NewWaAccount): Promise<number>;
  updateAccount(id: number, patch: WaAccountPatch): Promise<void>;
  // Desconectar desde el panel (status revoked)
  revokeAccount(accountId: number, id: number): Promise<WaAccount | null>;

  createSession(session: { id: string; accountId: number; userId: number | null; reconnectConnectionId: number | null }): Promise<void>;
  getSession(id: string): Promise<SignupSession | null>;
  updateSession(id: string, patch: SignupSessionPatch): Promise<void>;
  // Marca que llegó el code (atómico): el code es de un solo uso y se canjea una vez.
  claimCode(id: string): Promise<boolean>;
  // pending -> onboarding, atómico: el code y el evento pueden llegar a la vez y el onboarding corre una sola vez.
  claimSession(id: string): Promise<boolean>;
  addSessionEvent(sessionId: string, kind: string, payload: unknown): Promise<void>;
  listSessionEvents(sessionId: string): Promise<SignupEventRow[]>;

  enqueueJob(job: { field: string; wabaId: string | null; phoneNumberId: string | null; payload: unknown }): Promise<number>;
  // Toma hasta `limit` trabajos pendientes (los marca processing).
  claimJobs(limit: number): Promise<WebhookJob[]>;
  finishJob(id: number, error: string | null): Promise<void>;

  upsertContact(phoneNumberId: string, waId: string, names: { fullName: string | null; firstName: string | null }): Promise<void>;
  removeContact(phoneNumberId: string, waId: string): Promise<void>;
}

const now = () => Math.floor(Date.now() / 1000);

// Reintentos de un trabajo de webhook antes de darlo por fallido.
export const MAX_JOB_ATTEMPTS = 5;

export class MemoryWaRepo implements WaRepo {
  accounts: WaAccount[] = [];
  sessions: SignupSession[] = [];
  events: (SignupEventRow & { sessionId: string })[] = [];
  jobs: (WebhookJob & { status: "pending" | "processing" | "done" | "failed"; error: string | null })[] = [];
  contacts: { phoneNumberId: string; waId: string; fullName: string | null; firstName: string | null; removed: boolean }[] = [];
  private nextId = 1;

  private copy(a: WaAccount | undefined) {
    return a ? structuredClone(a) : null;
  }

  async getAccount(id: number) {
    return this.copy(this.accounts.find((a) => a.id === id));
  }
  async findByPhone(phoneNumberId: string) {
    return this.copy(this.accounts.find((a) => a.phoneNumberId === phoneNumberId));
  }
  async listByAccount(accountId: number) {
    return this.accounts.filter((a) => a.accountId === accountId && a.status === "connected").map((a) => structuredClone(a));
  }
  async listByWaba(wabaId: string) {
    return this.accounts.filter((a) => a.wabaId === wabaId && a.status === "connected").map((a) => structuredClone(a));
  }
  async listAll() {
    return this.accounts.map((a) => structuredClone(a));
  }
  async listForHealthCheck(beforeUnix: number) {
    return this.accounts
      .filter((a) => a.status === "connected" && a.health !== "disconnected" && (a.healthCheckedAt ?? 0) < beforeUnix)
      .map((a) => structuredClone(a));
  }
  async upsertAccount(r: NewWaAccount) {
    const existing = this.accounts.find((a) => a.phoneNumberId === r.phoneNumberId);
    const base = {
      accountId: r.accountId,
      wabaId: r.wabaId,
      phoneNumberId: r.phoneNumberId,
      businessId: r.businessId,
      displayPhoneNumber: r.displayPhoneNumber,
      verifiedName: r.verifiedName,
      accessToken: r.accessToken,
      isCoexistence: r.isCoexistence,
      signupSessionId: r.signupSessionId,
      status: "connected" as const,
      health: "active" as const,
      disconnectionInfo: null,
      lastError: null,
      lastErrorAt: null,
      connectedAt: now(),
    };
    if (existing) {
      Object.assign(existing, base, {
        displayPhoneNumber: r.displayPhoneNumber ?? existing.displayPhoneNumber,
        verifiedName: r.verifiedName ?? existing.verifiedName,
        steps: {},
      });
      if (r.resetSync) {
        Object.assign(existing, { syncStateRequestId: null, historyRequestId: null, historyStatus: "none", historyProgress: 0 });
      }
      return existing.id;
    }
    const id = this.nextId++;
    this.accounts.push({
      ...base,
      id,
      pin: null,
      steps: {},
      syncStateRequestId: null,
      historyRequestId: null,
      historyStatus: "none",
      historyProgress: 0,
      healthCheckedAt: null,
    });
    return id;
  }
  async updateAccount(id: number, patch: WaAccountPatch) {
    const a = this.accounts.find((x) => x.id === id);
    if (a) Object.assign(a, structuredClone(patch));
  }
  async revokeAccount(accountId: number, id: number) {
    const a = this.accounts.find((x) => x.id === id && x.accountId === accountId && x.status === "connected");
    if (!a) return null;
    a.status = "revoked";
    return structuredClone(a);
  }

  async createSession(s: { id: string; accountId: number; userId: number | null; reconnectConnectionId: number | null }) {
    this.sessions.push({
      ...s,
      status: "pending",
      accessToken: null,
      codeReceivedAt: null,
      eventType: null,
      wabaId: null,
      phoneNumberId: null,
      businessId: null,
      isCoexistence: false,
      metaSessionId: null,
      currentStep: null,
      errorCode: null,
      errorMessage: null,
      connectionId: null,
      createdAt: now(),
    });
  }
  async getSession(id: string) {
    const s = this.sessions.find((x) => x.id === id);
    return s ? structuredClone(s) : null;
  }
  async updateSession(id: string, patch: SignupSessionPatch) {
    const s = this.sessions.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
  }
  async claimCode(id: string) {
    const s = this.sessions.find((x) => x.id === id);
    if (!s || s.status !== "pending" || s.codeReceivedAt !== null) return false;
    s.codeReceivedAt = now();
    return true;
  }
  async claimSession(id: string) {
    const s = this.sessions.find((x) => x.id === id);
    if (!s || s.status !== "pending") return false;
    s.status = "onboarding";
    return true;
  }
  async addSessionEvent(sessionId: string, kind: string, payload: unknown) {
    this.events.push({ id: this.nextId++, sessionId, kind, payload: structuredClone(payload), at: now() });
  }
  async listSessionEvents(sessionId: string) {
    return this.events.filter((e) => e.sessionId === sessionId).map(({ sessionId: _s, ...e }) => e);
  }

  async enqueueJob(job: { field: string; wabaId: string | null; phoneNumberId: string | null; payload: unknown }) {
    const id = this.nextId++;
    this.jobs.push({ ...job, payload: structuredClone(job.payload), id, attempts: 0, status: "pending", error: null });
    return id;
  }
  async claimJobs(limit: number) {
    const picked = this.jobs.filter((j) => j.status === "pending").slice(0, limit);
    for (const j of picked) {
      j.status = "processing";
      j.attempts += 1;
    }
    return picked.map(({ status: _s, error: _e, ...j }) => structuredClone(j));
  }
  async finishJob(id: number, error: string | null) {
    const j = this.jobs.find((x) => x.id === id);
    if (!j) return;
    j.error = error;
    j.status = error === null ? "done" : j.attempts >= MAX_JOB_ATTEMPTS ? "failed" : "pending";
  }

  async upsertContact(phoneNumberId: string, waId: string, names: { fullName: string | null; firstName: string | null }) {
    const c = this.contacts.find((x) => x.phoneNumberId === phoneNumberId && x.waId === waId);
    if (c) Object.assign(c, names, { removed: false });
    else this.contacts.push({ phoneNumberId, waId, ...names, removed: false });
  }
  async removeContact(phoneNumberId: string, waId: string) {
    const c = this.contacts.find((x) => x.phoneNumberId === phoneNumberId && x.waId === waId);
    if (c) c.removed = true;
  }
}
