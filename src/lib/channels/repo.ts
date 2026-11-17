// Persistencia de páginas, Instagram y Threads conectados (WhatsApp vive en
// src/lib/whatsapp-accounts/repo.ts). El repo trabaja con tokens en claro;
// la implementación MySQL (repo-mysql.ts) los cifra al guardar. MemoryChannelsRepo
// sirve para tests.

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

export type NewSocial = Omit<SocialRecord, "id" | "connectedAt"> & { connectedBy: number | null };

export interface ChannelsRepo {
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
  social: (SocialRecord & { active: boolean })[] = [];
  private nextId = 1;

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
