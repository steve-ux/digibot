// Cuentas del CRM (tabla web_clients). Una cuenta = un negocio con su equipo,
// sus canales, conversaciones, etiquetas y atributos. MemoryAccountsRepo es para
// tests; la implementación MySQL está en accounts-mysql.ts (server-only).

export type AccountStatus = "onboarding" | "active" | "suspended";

export interface Account {
  id: number;
  name: string;
  status: AccountStatus;
  createdAt: number;
}

// Para el listado de Cuentas del superadmin.
export interface AccountSummary extends Account {
  users: number;
  conversations: number;
}

export interface AccountsRepo {
  list(): Promise<AccountSummary[]>;
  get(id: number): Promise<Account | null>;
  create(name: string): Promise<number>;
  update(id: number, patch: Partial<Pick<Account, "name" | "status">>): Promise<void>;
}

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  onboarding: "Configurando",
  active: "Activa",
  suspended: "Suspendida",
};

export class MemoryAccountsRepo implements AccountsRepo {
  accounts: Account[] = [];

  async list() {
    return this.accounts.map((a) => ({ ...a, users: 0, conversations: 0 }));
  }
  async get(id: number) {
    const a = this.accounts.find((x) => x.id === id);
    return a ? { ...a } : null;
  }
  async create(name: string) {
    const id = this.accounts.length + 1;
    this.accounts.push({ id, name, status: "active", createdAt: Math.floor(Date.now() / 1000) });
    return id;
  }
  async update(id: number, patch: Partial<Pick<Account, "name" | "status">>) {
    const a = this.accounts.find((x) => x.id === id);
    if (a) Object.assign(a, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
  }
}
