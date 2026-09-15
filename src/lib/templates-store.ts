// Guarda en la base de datos las plantillas que se crean y su estado en Meta.
// Es un registro de respaldo (write-through): Meta sigue siendo la fuente de verdad
// para el estado de aprobación, pero acá queda el historial persistido.

import { getPool, isDbConfigured } from "./db";
import type { TemplateCategory, TemplateStatus } from "./meta-whatsapp";

interface TemplateRecordInput {
  metaTemplateId?: string;
  name: string;
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  components: unknown;
}

export async function upsertTemplateRecord(connectionId: number, template: TemplateRecordInput) {
  if (!isDbConfigured()) return;

  const pool = getPool();
  await pool.query(
    `INSERT INTO web_templates
       (connection_id, meta_template_id, name, language, category, status, components, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       meta_template_id = VALUES(meta_template_id),
       category = VALUES(category),
       status = VALUES(status),
       components = VALUES(components),
       last_synced_at = NOW()`,
    [
      connectionId,
      template.metaTemplateId ?? null,
      template.name,
      template.language,
      template.category,
      template.status,
      JSON.stringify(template.components),
    ]
  );
}

export async function deleteTemplateRecord(connectionId: number, name: string) {
  if (!isDbConfigured()) return;

  const pool = getPool();
  await pool.query(`DELETE FROM web_templates WHERE connection_id = ? AND name = ?`, [
    connectionId,
    name,
  ]);
}
