// SDK de Facebook (JS) para el Embedded Signup de WhatsApp y Facebook Login for
// Business. Se carga una sola vez y solo en Canales. Devuelve el "code" que el
// servidor cambia por el token: el token nunca pasa por el navegador.

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
      window.FB!.init({ appId: config.appId!, autoLogAppEvents: true, xfbml: false, version: config.graphVersion });
      resolve(window.FB!);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/es_LA/sdk.js";
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

export interface EmbeddedSignupResult {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

// Embedded Signup: el popup de Meta avisa por postMessage qué WABA y número eligió la
// persona, y el login devuelve el código. Hacen falta las dos cosas.
export async function runEmbeddedSignup(config: MetaClientConfig): Promise<EmbeddedSignupResult | "cancel"> {
  const fb = await loadFacebookSdk(config);
  let session: { wabaId: string; phoneNumberId: string } | null = null;
  let cancelled = false;
  const onMessage = (event: MessageEvent) => {
    if (!isFacebookOrigin(event.origin)) return;
    try {
      const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "FINISH" && data.data?.waba_id && data.data?.phone_number_id) {
        session = { wabaId: String(data.data.waba_id), phoneNumberId: String(data.data.phone_number_id) };
      } else if (data.event === "CANCEL") {
        cancelled = true;
      }
    } catch {
      // Mensajes de Facebook que no son del Embedded Signup.
    }
  };
  window.addEventListener("message", onMessage);
  try {
    const code = await login(fb, {
      config_id: config.whatsappConfigId,
      extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
    });
    // El postMessage puede llegar un instante después del callback del login.
    for (let i = 0; i < 20 && !session && !cancelled && code; i++) await new Promise((r) => setTimeout(r, 150));
    const finished = session as { wabaId: string; phoneNumberId: string } | null;
    if (!code || !finished) return "cancel";
    return { code, ...finished };
  } finally {
    window.removeEventListener("message", onMessage);
  }
}

// Facebook Login for Business (páginas e Instagram): devuelve el código o null si se canceló.
export async function runFacebookLogin(config: MetaClientConfig): Promise<string | null> {
  const fb = await loadFacebookSdk(config);
  return login(fb, { config_id: config.loginConfigId });
}
