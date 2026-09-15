// Cliente server-only para la WhatsApp Business Management API (Graph API de Meta).
// El access token nunca debe llegar al navegador: solo se usa acá, dentro de las
// rutas API (src/app/api/templates/*), que corren en el servidor.
//
// La conexión (WABA ID + access token) se resuelve primero desde la base de datos
// (tabla web_whatsapp_connections, pensada para multi-tenant a futuro) y si no hay
// nada configurado ahí, cae a las variables de entorno WHATSAPP_WABA_ID /
// WHATSAPP_ACCESS_TOKEN (modo actual, de transición).

import { deleteTemplateRecord, upsertTemplateRecord } from "./templates-store";
import { getDefaultConnection } from "./whatsapp-connections";

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type TemplateStatus = "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED";

export type TemplateButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string };

export type TemplateComponent =
  | { type: "HEADER"; format: "TEXT"; text: string }
  | { type: "BODY"; text: string; example?: { body_text: string[][] } }
  | { type: "FOOTER"; text: string }
  | { type: "BUTTONS"; buttons: TemplateButton[] };

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  components: TemplateComponent[];
}

export interface CreateTemplateInput {
  name: string;
  language: string;
  category: TemplateCategory;
  components: TemplateComponent[];
}

class MetaConfigError extends Error {}

interface ResolvedConfig {
  wabaId: string;
  accessToken: string;
  apiVersion: string;
  connectionId: number | null;
}

async function getConfig(): Promise<ResolvedConfig> {
  const connection = await getDefaultConnection().catch(() => null);
  if (connection) {
    return {
      wabaId: connection.wabaId,
      accessToken: connection.accessToken,
      apiVersion: connection.apiVersion,
      connectionId: connection.id,
    };
  }

  const wabaId = process.env.WHATSAPP_WABA_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";

  if (!wabaId || !accessToken) {
    throw new MetaConfigError(
      "Faltan WHATSAPP_WABA_ID y/o WHATSAPP_ACCESS_TOKEN en las variables de entorno. " +
        "Configuralos en .env.local con las credenciales de tu WhatsApp Business Account."
    );
  }

  return { wabaId, accessToken, apiVersion, connectionId: null };
}

async function graphFetch(path: string, init?: RequestInit) {
  const { accessToken, apiVersion } = await getConfig();
  const url = `https://graph.facebook.com/${apiVersion}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.error?.message || `Error ${res.status} al llamar a la API de Meta`;
    throw new Error(message);
  }

  return data;
}

export async function listTemplates(): Promise<WhatsAppTemplate[]> {
  const { wabaId, connectionId } = await getConfig();
  const data = await graphFetch(
    `/${wabaId}/message_templates?fields=id,name,language,category,status,components&limit=100`
  );
  const templates: WhatsAppTemplate[] = data.data ?? [];

  if (connectionId !== null) {
    for (const template of templates) {
      try {
        await upsertTemplateRecord(connectionId, {
          metaTemplateId: template.id,
          name: template.name,
          language: template.language,
          category: template.category,
          status: template.status,
          components: template.components,
        });
      } catch (err) {
        console.error("No se pudo sincronizar una plantilla con la base de datos:", err);
      }
    }
  }

  return templates;
}

export async function createTemplate(input: CreateTemplateInput) {
  const { wabaId, connectionId } = await getConfig();
  const result = await graphFetch(`/${wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify(input),
  });

  if (connectionId !== null) {
    try {
      await upsertTemplateRecord(connectionId, {
        metaTemplateId: result?.id,
        name: input.name,
        language: input.language,
        category: input.category,
        status: (result?.status as TemplateStatus) ?? "PENDING",
        components: input.components,
      });
    } catch (err) {
      console.error("No se pudo guardar la plantilla nueva en la base de datos:", err);
    }
  }

  return result;
}

export async function deleteTemplate(name: string) {
  const { wabaId, connectionId } = await getConfig();
  const result = await graphFetch(`/${wabaId}/message_templates?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  });

  if (connectionId !== null) {
    try {
      await deleteTemplateRecord(connectionId, name);
    } catch (err) {
      console.error("No se pudo borrar la plantilla de la base de datos:", err);
    }
  }

  return result;
}

export async function isMetaConfigured() {
  const connection = await getDefaultConnection().catch(() => null);
  if (connection) return true;
  return Boolean(process.env.WHATSAPP_WABA_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

export { MetaConfigError };
