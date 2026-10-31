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

// Error de la Graph API con el código y título que devuelve Meta (ej: 131047
// "Re-engagement message"), para guardarlos en el mensaje fallido y mostrarlos en la UI.
class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly code: number | null,
    public readonly title: string | null
  ) {
    super(message);
  }
}

interface ResolvedConfig {
  wabaId: string;
  phoneNumberId: string | null;
  accessToken: string;
  apiVersion: string;
  connectionId: number | null;
}

async function getConfig(): Promise<ResolvedConfig> {
  const envPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || null;

  const connection = await getDefaultConnection().catch(() => null);
  if (connection) {
    return {
      wabaId: connection.wabaId,
      phoneNumberId: connection.phoneNumberId || envPhoneNumberId,
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

  return { wabaId, phoneNumberId: envPhoneNumberId, accessToken, apiVersion, connectionId: null };
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
    const error = data?.error;
    const message = error?.message || `Error ${res.status} al llamar a la API de Meta`;
    throw new MetaApiError(
      message,
      res.status,
      typeof error?.code === "number" ? error.code : null,
      error?.error_user_title || error?.message || null
    );
  }

  return data;
}

// La lista de plantillas se sirve desde memoria (stale-while-revalidate): si el
// cache está vencido se devuelve igual y se refresca contra Meta en segundo plano.
// `fresh: true` fuerza ir a Meta (lo usa el panel para revalidar después de pintar).
const TEMPLATES_TTL_MS = 30_000;
let templatesCache: { at: number; templates: WhatsAppTemplate[] } | null = null;
let templatesInflight: Promise<WhatsAppTemplate[]> | null = null;
// Se incrementa al crear/borrar: descarta respuestas de Meta que salieron antes del cambio.
let templatesGeneration = 0;

export function invalidateTemplatesCache() {
  templatesCache = null;
  templatesInflight = null;
  templatesGeneration++;
}

export async function listTemplates({ fresh = false }: { fresh?: boolean } = {}): Promise<WhatsAppTemplate[]> {
  if (templatesCache && !fresh) {
    if (Date.now() - templatesCache.at > TEMPLATES_TTL_MS) {
      refreshTemplates().catch((err) => console.error("No se pudieron refrescar las plantillas:", err));
    }
    return templatesCache.templates;
  }
  return refreshTemplates();
}

function refreshTemplates() {
  if (templatesInflight) return templatesInflight;
  const generation = templatesGeneration;
  const promise = fetchTemplatesFromMeta()
    .then((templates) => {
      if (generation === templatesGeneration) templatesCache = { at: Date.now(), templates };
      return templates;
    })
    .finally(() => {
      if (templatesInflight === promise) templatesInflight = null;
    });
  templatesInflight = promise;
  return promise;
}

async function fetchTemplatesFromMeta(): Promise<WhatsAppTemplate[]> {
  const { wabaId, connectionId } = await getConfig();
  const data = await graphFetch(
    `/${wabaId}/message_templates?fields=id,name,language,category,status,components&limit=100`
  );
  const templates: WhatsAppTemplate[] = data.data ?? [];

  // La sincronización con la base no bloquea la respuesta: va en paralelo y en segundo plano.
  if (connectionId !== null) {
    for (const template of templates) {
      upsertTemplateRecord(connectionId, {
        metaTemplateId: template.id,
        name: template.name,
        language: template.language,
        category: template.category,
        status: template.status,
        components: template.components,
      }).catch((err) => console.error("No se pudo sincronizar una plantilla con la base de datos:", err));
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
  invalidateTemplatesCache();

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
  invalidateTemplatesCache();

  if (connectionId !== null) {
    try {
      await deleteTemplateRecord(connectionId, name);
    } catch (err) {
      console.error("No se pudo borrar la plantilla de la base de datos:", err);
    }
  }

  return result;
}

export interface SendMessageResult {
  messaging_product: "whatsapp";
  contacts?: { input: string; wa_id: string }[];
  messages: { id: string; message_status?: string }[];
}

export interface TemplateMessageInput {
  name: string;
  language: string;
  components: {
    type: "header" | "body";
    parameters: { type: "text"; text: string }[];
  }[];
}

export type OutgoingMessage =
  | { type: "text"; text: string }
  | { type: "template"; template: TemplateMessageInput };

// Envía un mensaje desde el número `phoneNumberId` (Cloud API). Si no se pasa,
// usa el phone_number_id de la conexión o WHATSAPP_PHONE_NUMBER_ID.
export async function sendWhatsAppMessage(
  to: string,
  message: OutgoingMessage,
  phoneNumberId?: string | null
): Promise<SendMessageResult> {
  const config = await getConfig();
  const fromId = phoneNumberId || config.phoneNumberId;
  if (!fromId) {
    throw new MetaConfigError(
      "Falta WHATSAPP_PHONE_NUMBER_ID en las variables de entorno para poder enviar mensajes."
    );
  }

  const payload =
    message.type === "text"
      ? { type: "text", text: { preview_url: false, body: message.text } }
      : {
          type: "template",
          template: {
            name: message.template.name,
            language: { code: message.template.language },
            components: message.template.components,
          },
        };

  return graphFetch(`/${fromId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      ...payload,
    }),
  });
}

export async function isMetaConfigured() {
  const connection = await getDefaultConnection().catch(() => null);
  if (connection) return true;
  return Boolean(process.env.WHATSAPP_WABA_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

export { MetaApiError, MetaConfigError };
