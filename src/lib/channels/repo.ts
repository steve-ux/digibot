// Persistencia de los canales conectados. El repo trabaja con tokens en claro;
// la implementación MySQL (repo-mysql.ts) los cifra al guardar. MemoryChannelsRepo
// sirve para tests.

export interface WhatsAppRecord {
  id: number;
  accountId: number;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  accessToken: string;
  connectedAt: number;
}

export type SocialKind = "fb" | "ig" | "th";

export interface SocialRecord {
  id: number;
  accountId: number;
  channel: SocialKind;
  // page_id (fb) · ig_user_id (ig) · threads user id (th): el entry.id de los webhooks
  externalId: string;
  // Página que envía (fb e ig); Threads no tiene
  pageId: string | null;
  displayName: string | null;
  accessToken: string;
  tokenExpiresAt: number | null;
  pictureUrl: string | null;
  // Para Instagram: nombre de la página vinculada
  pageName: string | null;
  connectedAt: number;
}

// pin: el de verificación en dos pasos con el que se registró el número (se guarda cifrado)
export type NewWhatsApp = Omit<WhatsAppRecord, "id" | "connectedAt"> & { connectedBy: number | null; pin: string | null };
export type NewSocial = Omit<SocialRecord, "id" | "connectedAt"> & { connectedBy: number | null };

export interface ChannelsRepo {
  listWhatsApp(accountId: number): Promise<WhatsAppRecord[]>;
  // Conectado en cualquier cuenta (para no conectar el mismo número dos veces)
  findWhatsAppByPhone(phoneNumberId: string): Promise<WhatsAppRecord | null>;
  saveWhatsApp(record: NewWhatsApp): Promise<number>;
  disconnectWhatsApp(accountId: number, id: number): Promise<WhatsAppRecord | null>;

  listSocial(accountId: number): Promise<SocialRecord[]>;
  findSocial(channel: SocialKind, externalId: string): Promise<SocialRecord | null>;
  saveSocial(record: NewSocial): Promise<number>;
  disconnectSocial(accountId: number, id: number): Promise<SocialRecord | null>;
  updateSocialToken(id: number, accessToken: string, expiresAt: number | null): Promise<void>;
  // Tokens de Threads que vencen antes de `beforeUnix` (para renovarlos)
  listExpiring(channel: SocialKind, beforeUnix: number): Promise<SocialRecord[]>;
}

const now = () => Math.floor(Date.now() / 1000);

export class MemoryChannelsRepo implements ChannelsRepo {
  whatsapp: (WhatsAppRecord & { active: boolean })[] = [];
  social: (SocialRecord & { active: boolean })[] = [];
  private nextId = 1;

  async listWhatsApp(accountId: number) {
    return this.whatsapp.filter((w) => w.active && w.accountId === accountId).map(({ active: _a, ...w }) => w);
  }
  async findWhatsAppByPhone(phoneNumberId: string) {
    const w = this.whatsapp.find((x) => x.active && x.phoneNumberId === phoneNumberId);
    if (!w) return null;
    const { active: _a, ...rest } = w;
    return rest;
  }
  async saveWhatsApp({ connectedBy: _c, pin: _p, ...record }: NewWhatsApp) {
    const existing = this.whatsapp.find((x) => x.phoneNumberId === record.phoneNumberId);
    if (existing) {
      Object.assign(existing, record, { active: true, connectedAt: now() });
      return existing.id;
    }
    const id = this.nextId++;
    this.whatsapp.push({ ...record, id, connectedAt: now(), active: true });
    return id;
  }
  async disconnectWhatsApp(accountId: number, id: number) {
    const w = this.whatsapp.find((x) => x.id === id && x.accountId === accountId && x.active);
    if (!w) return null;
    w.active = false;
    const { active: _a, ...rest } = w;
    return rest;
  }

  async listSocial(accountId: number) {
    return this.social.filter((s) => s.active && s.accountId === accountId).map(({ active: _a, ...s }) => s);
  }
  async findSocial(channel: SocialKind, externalId: string) {
    const s = this.social.find((x) => x.active && x.channel === channel && x.externalId === externalId);
    if (!s) return null;
    const { active: _a, ...rest } = s;
    return rest;
  }
  async saveSocial({ connectedBy: _c, ...record }: NewSocial) {
    const existing = this.social.find((x) => x.channel === record.channel && x.externalId === record.externalId);
    if (existing) {
      Object.assign(existing, record, { active: true, connectedAt: now() });
      return existing.id;
    }
    const id = this.nextId++;
    this.social.push({ ...record, id, connectedAt: now(), active: true });
    return id;
  }
  async disconnectSocial(accountId: number, id: number) {
    const s = this.social.find((x) => x.id === id && x.accountId === accountId && x.active);
    if (!s) return null;
    s.active = false;
    const { active: _a, ...rest } = s;
    return rest;
  }
  async updateSocialToken(id: number, accessToken: string, expiresAt: number | null) {
    const s = this.social.find((x) => x.id === id);
    if (s) Object.assign(s, { accessToken, tokenExpiresAt: expiresAt });
  }
  async listExpiring(channel: SocialKind, beforeUnix: number) {
    return this.social
      .filter((s) => s.active && s.channel === channel && s.tokenExpiresAt !== null && s.tokenExpiresAt < beforeUnix)
      .map(({ active: _a, ...s }) => s);
  }
}
