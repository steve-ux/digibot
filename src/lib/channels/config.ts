// Credenciales de la app de Meta para conectar canales. Server-only.
//
//   META_APP_ID, META_APP_SECRET    -> la app de Meta (el secreto ya se usa para los webhooks)
//   META_ES_CONFIG_ID               -> configuración del Embedded Signup de WhatsApp (META_WA_CONFIG_ID también sirve)
//   WHATSAPP_ES_VERSION             -> versión del Embedded Signup (v5: coexistencia activada por defecto)
//   META_FB_IG_CONFIG_ID            -> Facebook Login for Business para páginas (Messenger + comentarios).
//                                      META_LOGIN_CONFIG_ID también sirve (nombre anterior)
//   META_IG_CONFIG_ID               -> Facebook Login for Business de Instagram API with Unified Login
//   META_HUMAN_AGENT_ENABLED        -> on: Messenger/Instagram de 24 h a 7 días con la etiqueta HUMAN_AGENT
//                                      (requiere el permiso aprobado). Apagado por defecto.
//   THREADS_APP_ID, THREADS_APP_SECRET -> el producto Threads de la app (tiene id y secreto propios)
//   APP_URL                          -> https://digibotlatam.com (para el redirect de Threads)
//   TIKTOK_APP_ID, TIKTOK_APP_SECRET -> la app de TikTok for Business (My Apps > App Detail > Basic Information)
//   TIKTOK_REDIRECT_URI              -> opcional: la "TikTok account holder redirect URL" exacta si no es
//                                       <APP_URL>/integraciones/tiktok/cuenta/callback (ej. el túnel para probar)
//   TIKTOK_SCOPES                    -> opcional: permisos separados por coma (por defecto, los aprobados)
//
// Mientras falte algo, el botón de ese canal se muestra deshabilitado con el motivo.

import type { MetaClientConfig, ProviderAvailability, ProviderId } from "./types";

export const graphVersion = () => process.env.META_GRAPH_API_VERSION || "v23.0";
// Versión del Embedded Signup que se pide en extras.version de FB.login.
export const embeddedSignupVersion = () => process.env.WHATSAPP_ES_VERSION || "v5";
export const whatsappConfigId = () => process.env.META_ES_CONFIG_ID || process.env.META_WA_CONFIG_ID || null;
export const threadsVersion = () => process.env.THREADS_API_VERSION || "v1.0";
export const facebookConfigId = () => process.env.META_FB_IG_CONFIG_ID || process.env.META_LOGIN_CONFIG_ID || null;
export const instagramConfigId = () => process.env.META_IG_CONFIG_ID || null;
export const humanAgentEnabled = () => process.env.META_HUMAN_AGENT_ENABLED?.toLowerCase() === "on";

// Falta alguna variable en el servidor (texto para el cliente: no nombra variables).
const PENDING_META = "Esta conexión todavía no está habilitada. Escribinos y la activamos.";

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

export function tiktokAppCredentials() {
  const appId = process.env.TIKTOK_APP_ID || null;
  const appSecret = process.env.TIKTOK_APP_SECRET || null;
  return appId && appSecret ? { appId, appSecret } : null;
}

export function metaClientConfig(): MetaClientConfig {
  return {
    appId: process.env.META_APP_ID || null,
    graphVersion: graphVersion(),
    whatsappConfigId: whatsappConfigId(),
    whatsappEsVersion: embeddedSignupVersion(),
    loginConfigId: facebookConfigId(),
    instagramConfigId: instagramConfigId(),
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
    instagram: meta && client.instagramConfigId ? ok : pending,
    threads: threadsAppCredentials() ? ok : pending,
    tiktok: tiktokAppCredentials() ? ok : pending,
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

// Tiene que coincidir con la "TikTok account holder redirect URL" registrada en la app.
export const TIKTOK_CALLBACK_PATH = "/integraciones/tiktok/cuenta/callback";
// Los permisos aprobados de "TikTok accounts" (los mismos que trae la URL de autorización de la app).
const TIKTOK_DEFAULT_SCOPES = [
  "user.info.basic",
  "user.info.username",
  "user.info.stats",
  "user.info.profile",
  "user.account.type",
  "user.insights",
  "video.list",
  "video.insights",
  "biz.spark.auth",
  "comment.list",
  "comment.list.manage",
];
export function tiktokScopes() {
  const custom = process.env.TIKTOK_SCOPES?.split(",").map((s) => s.trim()).filter(Boolean);
  return custom?.length ? custom : TIKTOK_DEFAULT_SCOPES;
}
export function tiktokRedirectUri(headers?: Headers) {
  return process.env.TIKTOK_REDIRECT_URI || `${publicBaseUrl(headers)}${TIKTOK_CALLBACK_PATH}`;
}
