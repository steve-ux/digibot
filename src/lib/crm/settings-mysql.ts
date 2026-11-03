// SettingsRepo sobre web_labels y web_custom_attributes (migración 0009). Server-only.

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "../db";
import type { AttributeInput, AttributeType, CustomAttribute } from "./attributes";
import { DEFAULT_LABELS, isLabelColor, type Label, type LabelInput } from "./labels";
import type { SettingsRepo } from "./settings-repo";

interface LabelRow extends RowDataPacket {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

interface AttributeRow extends RowDataPacket {
  id: number;
  attr_key: string;
  label: string;
  type: AttributeType;
  options: unknown;
  description: string | null;
  sort_order: number;
}

function parseOptions(value: unknown): string[] {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === "string") : [];
}

const mapLabel = (r: LabelRow): Label => ({
  id: r.id,
  name: r.name,
  color: isLabelColor(r.color) ? r.color : "gray",
  description: r.description,
});

const mapAttribute = (r: AttributeRow): CustomAttribute => ({
  id: r.id,
  key: r.attr_key,
  label: r.label,
  type: r.type,
  options: parseOptions(r.options),
  description: r.description,
  sortOrder: Number(r.sort_order),
});

function setClause(patch: Record<string, unknown>, columns: Record<string, string>) {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || !columns[key]) continue;
    sets.push(`${columns[key]} = ?`);
    params.push(key === "options" ? JSON.stringify(value) : value);
  }
  return { sets, params };
}

class MySqlSettingsRepo implements SettingsRepo {
  async listLabels(accountId: number) {
    const [rows] = await getPool().query<LabelRow[]>(
      `SELECT id, name, color, description FROM web_labels WHERE client_id = ? ORDER BY name`,
      [accountId]
    );
    return rows.map(mapLabel);
  }

  async createLabel(accountId: number, input: LabelInput) {
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO web_labels (client_id, name, color, description) VALUES (?, ?, ?, ?)`,
      [accountId, input.name, input.color, input.description]
    );
    return result.insertId;
  }

  async updateLabel(accountId: number, id: number, patch: Partial<LabelInput>) {
    const { sets, params } = setClause(patch, { name: "name", color: "color", description: "description" });
    if (!sets.length) return;
    await getPool().query(`UPDATE web_labels SET ${sets.join(", ")} WHERE id = ? AND client_id = ?`, [
      ...params,
      id,
      accountId,
    ]);
  }

  async deleteLabel(accountId: number, id: number) {
    await getPool().query(`DELETE FROM web_labels WHERE id = ? AND client_id = ?`, [id, accountId]);
  }

  async seedDefaultLabels(accountId: number) {
    for (const label of DEFAULT_LABELS) {
      await getPool().query(
        `INSERT IGNORE INTO web_labels (client_id, name, color, description) VALUES (?, ?, ?, ?)`,
        [accountId, label.name, label.color, label.description]
      );
    }
  }

  async listAttributes(accountId: number) {
    const [rows] = await getPool().query<AttributeRow[]>(
      `SELECT id, attr_key, label, type, options, description, sort_order
       FROM web_custom_attributes WHERE client_id = ? ORDER BY sort_order, id`,
      [accountId]
    );
    return rows.map(mapAttribute);
  }

  async createAttribute(accountId: number, input: AttributeInput) {
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO web_custom_attributes (client_id, attr_key, label, type, options, description, sort_order)
       SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1 FROM web_custom_attributes WHERE client_id = ?`,
      [accountId, input.key, input.label, input.type, JSON.stringify(input.options), input.description, accountId]
    );
    return result.insertId;
  }

  async updateAttribute(
    accountId: number,
    id: number,
    patch: Partial<Pick<CustomAttribute, "label" | "options" | "description" | "sortOrder">>
  ) {
    const { sets, params } = setClause(patch, {
      label: "label",
      options: "options",
      description: "description",
      sortOrder: "sort_order",
    });
    if (!sets.length) return;
    await getPool().query(`UPDATE web_custom_attributes SET ${sets.join(", ")} WHERE id = ? AND client_id = ?`, [
      ...params,
      id,
      accountId,
    ]);
  }

  async deleteAttribute(accountId: number, id: number) {
    await getPool().query(`DELETE FROM web_custom_attributes WHERE id = ? AND client_id = ?`, [id, accountId]);
  }
}

let repo: SettingsRepo | null = null;
export function getMySqlSettingsRepo(): SettingsRepo {
  repo ??= new MySqlSettingsRepo();
  return repo;
}
