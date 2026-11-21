// SDK de Facebook (JS) para el Embedded Signup de WhatsApp y Facebook Login for
// Business. Se carga una sola vez y solo en Canales. Devuelve el "code" que el
// servidor cambia por el token: el token nunca pasa por el navegador.
//
// Embedded Signup (v5): el code del callback de FB.login y el evento WA_EMBEDDED_SIGNUP
// (postMessage del popup) llegan en cualquier orden; cada uno se manda al servidor
// apenas llega y el servidor los junta por sesión.

import type { MetaClientConfig } from "@/lib/channels/types";

interface FBLoginResponse {
  status?: string;
  authResponse?: { code?: string } | null;
}

interface FBStatic {
  init(options: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }): void;
  login(callback: (response: FBLoginResponse) => void, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    FB?: FBStatic;
    fbAsyncInit?: () => void;
  }
}

let loading: Promise<FBStatic> | null = null;

export function loadFacebookSdk(config: MetaClientConfig): Promise<FBStatic> {
  if (!config.appId) return Promise.reject(new Error("Falta el id de la app de Meta."));
  if (loading) return loading;
  loading = new Promise<FBStatic>((resolve, reject) => {
    if (window.FB) {
      resolve(window.FB);
      return;
    }
    window.fbAsyncInit = () => {
      window.FB!.init({ appId: config.appId!, autoLogAppEvents: true, xfbml: true, version: config.graphVersion });
      resolve(window.FB!);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      loading = null;
      reject(new Error("No se pudo cargar Facebook. Revisá tu conexión o si un bloqueador lo está frenando."));
    };
    document.body.appendChild(script);
  });
  return loading;
}

function login(fb: FBStatic, options: Record<string, unknown>): Promise<string | null> {
  return new Promise((resolve) => {
    fb.login((response) => resolve(response.authResponse?.code ?? null), {
      response_type: "code",
      override_default_response_type: true,
      ...options,
    });
  });
}

const isFacebookOrigin = (origin: string) => {
  try {
    return new URL(origin).hostname.endsWith("facebook.com");
  } catch {
    return false;
  }
};

export interface EmbeddedSignupHandlers {
  // Callback de FB.login: hay que mandarlo ya (vence a los 30 s)
  onCode: (code: string) => void;
  // Cada mensaje WA_EMBEDDED_SIGNUP, tal cual lo mandó Meta
  onEvent: (event: unknown) => void;
}

// Cuánto se sigue escuchando el postMessage después del callback de FB.login.
const LISTEN_AFTER_LOGIN_MS = 15_000;

// Lanza el Embedded Signup. Resuelve cuando se cierra el popup: con el code, o null si
// no hubo (canceló o lo cerró). Los eventos se siguen reenviando un rato después.
// Abre Meta directo en el flujo de coexistencia (número que ya está en la app de WhatsApp Business).
const COEXISTENCE_FEATURE = "whatsapp_business_app_onboarding";

export async function launchEmbeddedSignup(
  config: MetaClientConfig,
  handlers: EmbeddedSignupHandlers,
  { coexistence = false }: { coexistence?: boolean } = {}
): Promise<string | null> {
  const fb = await loadFacebookSdk(config);
  const onMessage = (event: MessageEvent) => {
    if (!isFacebookOrigin(event.origin)) return;
    let data: unknown = event.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return; // mensajes de Facebook que no son JSON
      }
    }
    if ((data as { type?: unknown } | null)?.type !== "WA_EMBEDDED_SIGNUP") return;
    handlers.onEvent(data);
  };
  window.addEventListener("message", onMessage);
  try {
    const code = await login(fb, {
      config_id: config.whatsappConfigId,
      extras: {
        version: config.whatsappEsVersion,
        ...(coexistence ? { featureType: COEXISTENCE_FEATURE } : {}),
      },
    });
    if (code) handlers.onCode(code);
    return code;
  } finally {
    setTimeout(() => window.removeEventListener("message", onMessage), LISTEN_AFTER_LOGIN_MS);
  }
}

// Facebook Login for Business: devuelve el código o null si se canceló.
// configId: la de páginas (Messenger + comentarios) o la de Instagram (Unified Login).
export async function runFacebookLogin(config: MetaClientConfig, configId: string | null): Promise<string | null> {
  if (!configId) throw new Error("Esta conexión todavía no está habilitada.");
  const fb = await loadFacebookSdk(config);
  return login(fb, { config_id: configId });
}
