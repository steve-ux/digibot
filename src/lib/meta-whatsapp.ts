// Cliente server-only para la WhatsApp Business Management API (Graph API de Meta).
// El access token nunca llega al navegador: solo se usa acá, desde las rutas API.
//
// Cada llamada usa la conexión que corresponde (ver whatsapp-connections.ts):
//   - plantillas: la conexión de la cuenta (su WABA)
//   - envíos: la conexión dueña del número de la conversación

import { deleteTemplateRecord, upsertTemplateRecord } from "./templates-store";
import {
  getConnectionByPhoneNumberId,
  getConnectionForAccount,
  type WhatsAppConnection,
} from "./whatsapp-connections";

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
    public readonly title: string | null,
    // error_subcode de Meta (Messenger/Instagram lo usan para, ej., la ventana de 24 h)
    public readonly subcode: number | null = null
  ) {
    super(message);
  }
}

const NOT_CONNECTED = "Esta cuenta todavía no tiene WhatsApp conectado. Conectalo desde Canales.";

async function connectionForAccount(accountId: number) {
  const connection = await getConnectionForAccount(accountId);
  if (!connection) throw new MetaConfigError(NOT_CONNECTED);
  return connection;
}

export async function graphRequest(
  connection: Pick<WhatsAppConnection, "accessToken" | "apiVersion">,
  path: string,
  init?: RequestInit
) {
  const url = `https://graph.facebook.com/${connection.apiVersion}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
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
      error?.error_user_title || error?.message || null,
      typeof error?.error_subcode === "number" ? error.error_subcode : null
    );
  }

  return data;
}

// La lista de plantillas (por WABA) se sirve desde memoria (stale-while-revalidate):
// si el cache está vencido se devuelve igual y se refresca contra Meta en segundo plano.
// `fresh: true` fuerza ir a Meta (lo usa el panel para revalidar después de pintar).
const TEMPLATES_TTL_MS = 30_000;
interface TemplatesCache {
  at: number;
  templates: WhatsAppTemplate[] | null;
  inflight: Promise<WhatsAppTemplate[]> | null;
  // Se incrementa al crear/borrar: descarta respuestas de Meta que salieron antes del cambio.
  generation: number;
}
const templatesCache = new Map<string, TemplatesCache>();

function cacheFor(wabaId: string) {
  let entry = templatesCache.get(wabaId);
  if (!entry) {
    entry = { at: 0, templates: null, inflight: null, generation: 0 };
    templatesCache.set(wabaId, entry);
  }
  return entry;
}

export function invalidateTemplatesCache(wabaId?: string) {
  const entries = wabaId ? [cacheFor(wabaId)] : [...templatesCache.values()];
  for (const entry of entries) {
    entry.templates = null;
    entry.inflight = null;
    entry.generation++;
  }
}

export async function listTemplates({
  accountId,
  fresh = false,
}: {
  accountId: number;
  fresh?: boolean;
}): Promise<WhatsAppTemplate[]> {
  const connection = await connectionForAccount(accountId);
  const entry = cacheFor(connection.wabaId);
  if (entry.templates && !fresh) {
    if (Date.now() - entry.at > TEMPLATES_TTL_MS) {
      refreshTemplates(connection).catch((err) => console.error("No se pudieron refrescar las plantillas:", err));
    }
    return entry.templates;
  }
  return refreshTemplates(connection);
}

function refreshTemplates(connection: WhatsAppConnection) {
  const entry = cacheFor(connection.wabaId);
  if (entry.inflight) return entry.inflight;
  const generation = entry.generation;
  const promise = fetchTemplatesFromMeta(connection)
    .then((templates) => {
      if (generation === entry.generation) {
        entry.templates = templates;
        entry.at = Date.now();
      }
      return templates;
    })
    .finally(() => {
      if (entry.inflight === promise) entry.inflight = null;
    });
  entry.inflight = promise;
  return promise;
}

async function fetchTemplatesFromMeta(connection: WhatsAppConnection): Promise<WhatsAppTemplate[]> {
  const data = await graphRequest(
    connection,
    `/${connection.wabaId}/message_templates?fields=id,name,language,category,status,components&limit=100`
  );
  const templates: WhatsAppTemplate[] = data.data ?? [];

  // La sincronización con la base no bloquea la respuesta: va en paralelo y en segundo plano.
  if (connection.id > 0) {
    for (const template of templates) {
      upsertTemplateRecord(connection.id, {
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

export async function createTemplate(accountId: number, input: CreateTemplateInput) {
  const connection = await connectionForAccount(accountId);
  const result = await graphRequest(connection, `/${connection.wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  invalidateTemplatesCache(connection.wabaId);

  if (connection.id > 0) {
    try {
      await upsertTemplateRecord(connection.id, {
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

export async function deleteTemplate(accountId: number, name: string) {
  const connection = await connectionForAccount(accountId);
  const result = await graphRequest(
    connection,
    `/${connection.wabaId}/message_templates?name=${encodeURIComponent(name)}`,
    { method: "DELETE" }
  );
  invalidateTemplatesCache(connection.wabaId);

  if (connection.id > 0) {
    try {
      await deleteTemplateRecord(connection.id, name);
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

// Envía un mensaje desde el número `phoneNumberId` (Cloud API), con el token de su conexión.
export async function sendWhatsAppMessage(
  to: string,
  message: OutgoingMessage,
  phoneNumberId?: string | null
): Promise<SendMessageResult> {
  const connection = await getConnectionByPhoneNumberId(phoneNumberId);
  if (!connection) {
    throw new MetaConfigError("No hay ningún número de WhatsApp conectado. Conectalo desde Canales.");
  }
  const fromId = phoneNumberId || connection.phoneNumberId;
  if (!fromId) {
    throw new MetaConfigError("Falta el número de WhatsApp desde el que se envía. Reconectalo desde Canales.");
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

  return graphRequest(connection, `/${fromId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      ...payload,
    }),
  });
}

// ¿La cuenta tiene WhatsApp conectado?
export async function isMetaConfigured(accountId: number) {
  return (await getConnectionForAccount(accountId)) !== null;
}

export { MetaApiError, MetaConfigError };
