// Plantillas que se pueden mandar desde la bandeja cuando la ventana de 24 h está
// cerrada. Reusa listTemplates() de /admin/plantillas y se queda con las APROBADAS
// que solo tienen variables de texto ({{n}} en encabezado y cuerpo).

import { listTemplates, type WhatsAppTemplate } from "../meta-whatsapp";
import { extractTemplateVariables, type InboxTemplate } from "./types";

// Meta puede devolver componentes que el tipo WhatsAppTemplate no contempla
// (encabezados con imagen, botones URL con variable): esas plantillas se omiten.
type LooseComponent = { type: string; format?: string; text?: string; buttons?: { type: string; url?: string }[] };

function toInboxTemplate(template: WhatsAppTemplate): InboxTemplate | null {
  const components = template.components as LooseComponent[];
  const header = components.find((c) => c.type === "HEADER");
  const body = components.find((c) => c.type === "BODY");
  const footer = components.find((c) => c.type === "FOOTER");
  const buttons = components.find((c) => c.type === "BUTTONS");

  if (!body?.text) return null;
  if (header && header.format !== "TEXT") return null;
  if (buttons?.buttons?.some((b) => b.url?.includes("{{"))) return null;

  return {
    name: template.name,
    language: template.language,
    category: template.category,
    header: header?.text ?? null,
    body: body.text,
    footer: footer?.text ?? null,
    headerVars: header?.text ? extractTemplateVariables(header.text) : [],
    bodyVars: extractTemplateVariables(body.text),
  };
}

export async function listApprovedInboxTemplates(): Promise<InboxTemplate[]> {
  const templates = await listTemplates();
  return templates
    .filter((t) => t.status === "APPROVED")
    .map(toInboxTemplate)
    .filter((t): t is InboxTemplate => t !== null);
}
