// Credenciales de la app de Meta para conectar canales. Server-only.
//
//   META_APP_ID, META_APP_SECRET    -> la app de Meta (el secreto ya se usa para los webhooks)
//   META_WA_CONFIG_ID               -> configuración del Embedded Signup de WhatsApp
//   META_LOGIN_CONFIG_ID            -> configuración de Facebook Login for Business (páginas e Instagram)
//   THREADS_APP_ID, THREADS_APP_SECRET -> el producto Threads de la app (tiene id y secreto propios)
//   APP_URL                          -> https://digibotlatam.com (para el redirect de Threads)
//
// Mientras falte algo, el botón de ese canal se muestra deshabilitado con el motivo.

import type { MetaClientConfig, ProviderAvailability, ProviderId } from "./types";

export const graphVersion = () => process.env.META_GRAPH_API_VERSION || "v23.0";
export const threadsVersion = () => process.env.THREADS_API_VERSION || "v1.0";

const PENDING_META =
  "Disponible cuando Meta apruebe a DigiBot como Tech Provider. Mientras tanto, lo configuramos nosotros.";

export function metaAppCredentials() {
  const appId = process.env.META_APP_ID || null;
  const appSecret = process.env.META_APP_SECRET || null;
  return appId && appSecret ? { appId, appSecret } : null;
}

export function threadsAppCredentials() {
  const appId = process.env.THREADS_APP_ID || null;
  const appSecret = process.env.THREADS_APP_SECRET || null;
  return appId && appSecret ? { appId, appSecret } : null;
}

export function metaClientConfig(): MetaClientConfig {
  return {
    appId: process.env.META_APP_ID || null,
    graphVersion: graphVersion(),
    whatsappConfigId: process.env.META_WA_CONFIG_ID || null,
    loginConfigId: process.env.META_LOGIN_CONFIG_ID || null,
  };
}

export function providerAvailability(): Record<ProviderId, ProviderAvailability> {
  const meta = metaAppCredentials();
  const client = metaClientConfig();
  const ok: ProviderAvailability = { available: true, reason: null };
  const pending: ProviderAvailability = { available: false, reason: PENDING_META };
  return {
    whatsapp: meta && client.whatsappConfigId ? ok : pending,
    facebook: meta && client.loginConfigId ? ok : pending,
    instagram: meta && client.loginConfigId ? ok : pending,
    threads: threadsAppCredentials() ? ok : pending,
  };
}

// URL pública del panel (para el redirect de Threads, que tiene que coincidir exacto con el de la app).
export function publicBaseUrl(headers?: Headers) {
  const configured = process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = headers?.get("x-forwarded-host") ?? headers?.get("host");
  const proto = headers?.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

export const THREADS_CALLBACK_PATH = "/api/admin/canales/threads/callback";
export const THREADS_SCOPES = ["threads_basic", "threads_read_replies", "threads_manage_replies"];
