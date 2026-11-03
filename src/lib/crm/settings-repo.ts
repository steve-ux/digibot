// Persistencia de etiquetas y atributos propios de cada cuenta. MemorySettingsRepo
// es para tests y para el modo demo; la de MySQL está en settings-mysql.ts.

import type { AttributeInput, CustomAttribute } from "./attributes";
import { DEFAULT_LABELS, type Label, type LabelInput } from "./labels";

export interface SettingsRepo {
  listLabels(accountId: number): Promise<Label[]>;
  createLabel(accountId: number, input: LabelInput): Promise<number>;
  updateLabel(accountId: number, id: number, patch: Partial<LabelInput>): Promise<void>;
  deleteLabel(accountId: number, id: number): Promise<void>;
  // Las etiquetas que propone la plataforma, para una cuenta recién creada.
  seedDefaultLabels(accountId: number): Promise<void>;

  listAttributes(accountId: number): Promise<CustomAttribute[]>;
  createAttribute(accountId: number, input: AttributeInput): Promise<number>;
  updateAttribute(
    accountId: number,
    id: number,
    patch: Partial<Pick<CustomAttribute, "label" | "options" | "description" | "sortOrder">>
  ): Promise<void>;
  deleteAttribute(accountId: number, id: number): Promise<void>;
}

type Stored<T> = T & { accountId: number };

export class MemorySettingsRepo implements SettingsRepo {
  labels: Stored<Label>[] = [];
  attributes: Stored<CustomAttribute>[] = [];
  private nextId = 1;

  async listLabels(accountId: number) {
    return this.labels
      .filter((l) => l.accountId === accountId)
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map(({ accountId: _a, ...l }) => l);
  }
  async createLabel(accountId: number, input: LabelInput) {
    const id = this.nextId++;
    this.labels.push({ ...input, id, accountId });
    return id;
  }
  async updateLabel(accountId: number, id: number, patch: Partial<LabelInput>) {
    const l = this.labels.find((x) => x.id === id && x.accountId === accountId);
    if (l) Object.assign(l, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
  }
  async deleteLabel(accountId: number, id: number) {
    this.labels = this.labels.filter((l) => !(l.id === id && l.accountId === accountId));
  }
  async seedDefaultLabels(accountId: number) {
    for (const label of DEFAULT_LABELS) {
      if (!this.labels.some((l) => l.accountId === accountId && l.name === label.name)) {
        await this.createLabel(accountId, label);
      }
    }
  }

  async listAttributes(accountId: number) {
    return this.attributes
      .filter((a) => a.accountId === accountId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map(({ accountId: _a, ...a }) => ({ ...a, options: [...a.options] }));
  }
  async createAttribute(accountId: number, input: AttributeInput) {
    const id = this.nextId++;
    const sortOrder = Math.max(0, ...this.attributes.filter((a) => a.accountId === accountId).map((a) => a.sortOrder)) + 1;
    this.attributes.push({ ...input, id, sortOrder, accountId });
    return id;
  }
  async updateAttribute(
    accountId: number,
    id: number,
    patch: Partial<Pick<CustomAttribute, "label" | "options" | "description" | "sortOrder">>
  ) {
    const a = this.attributes.find((x) => x.id === id && x.accountId === accountId);
    if (a) Object.assign(a, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
  }
  async deleteAttribute(accountId: number, id: number) {
    this.attributes = this.attributes.filter((a) => !(a.id === id && a.accountId === accountId));
  }
}
