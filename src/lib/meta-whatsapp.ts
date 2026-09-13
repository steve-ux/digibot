// Cliente server-only para la WhatsApp Business Management API (Graph API de Meta).
// El access token nunca debe llegar al navegador: solo se usa acá, dentro de las
// rutas API (src/app/api/templates/*), que corren en el servidor.

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

function getConfig() {
  const wabaId = process.env.WHATSAPP_WABA_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";

  if (!wabaId || !accessToken) {
    throw new MetaConfigError(
      "Faltan WHATSAPP_WABA_ID y/o WHATSAPP_ACCESS_TOKEN en las variables de entorno. " +
        "Configuralos en .env.local con las credenciales de tu WhatsApp Business Account."
    );
  }

  return { wabaId, accessToken, apiVersion };
}

async function graphFetch(path: string, init?: RequestInit) {
  const { accessToken, apiVersion } = getConfig();
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
  const { wabaId } = getConfig();
  const data = await graphFetch(
    `/${wabaId}/message_templates?fields=id,name,language,category,status,components&limit=100`
  );
  return data.data ?? [];
}

export async function createTemplate(input: CreateTemplateInput) {
  const { wabaId } = getConfig();
  return graphFetch(`/${wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteTemplate(name: string) {
  const { wabaId } = getConfig();
  return graphFetch(`/${wabaId}/message_templates?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export function isMetaConfigured() {
  return Boolean(process.env.WHATSAPP_WABA_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

export { MetaConfigError };
