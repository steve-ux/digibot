// Salud de las conexiones de Facebook e Instagram: active · needs_attention · disconnected. Server-only.
// Mismo modelo que WhatsApp (src/lib/whatsapp-accounts/health.ts).
//
// Se entera por tres lados:
//   - errores de Graph con el token guardado (reportSocialTokenError, lo llaman graph.ts y el sincronizador de IG)
//       190       -> disconnected en el acto (token revocado: quitaron DigiBot, cambió la contraseña, etc.)
//       200 / 10  -> needs_attention y se verifica con debug_token: inválido o sin permisos -> disconnected
//   - el chequeo diario (runSocialHealthSweep) con debug_token, aunque no haya tráfico
//   - Meta avisa que alguien quitó la app o pidió borrar sus datos (deauthorize / data deletion):
//     se verifican todas las conexiones en el momento (checkAllMetaConnections)
//
// Una conexión desconectada sigue en Canales con el botón "Reconectar" (volver a conectar
// la misma cuenta la deja sana otra vez). No se sigue llamando a Meta con ese token.

import { metaAppCredentials } from "./config";
import { INSTAGRAM_SCOPES } from "./meta-connect";
import type { ChannelsRepo, SocialHealth, SocialKind, SocialRecord } from "./repo";
import { debugToken, type DebugTokenData } from "../whatsapp-accounts/graph";

// Lo mínimo para recibir y responder. Instagram viejo (por página) usa el token de la página.
const FACEBOOK_REQUIRED = ["pages_messaging", "pages_manage_metadata"];
const PERMISSION_CODES = new Set([200, 10]);
const DAY = 24 * 3600;
const now = () => Math.floor(Date.now() / 1000);
const LOG = "[canales-salud]";

export interface SocialHealthDeps {
  repo: ChannelsRepo;
  debugToken?: (token: string) => Promise<DebugTokenData>;
}

function requiredScopes(account: SocialRecord) {
  if (account.channel === "ig" && account.authType === "ig_unified") return INSTAGRAM_SCOPES;
  if (account.channel === "fb") return FACEBOOK_REQUIRED;
  return [];
}

async function markDisconnected(deps: SocialHealthDeps, account: SocialRecord, reason: string, source: "graph_error" | "token_check", detail: string | null) {
  if (account.health === "disconnected") return false;
  const at = now();
  await deps.repo.updateSocialHealth(account.id, {
    health: "disconnected",
    disconnectionInfo: { reason, source, at },
    lastError: detail ?? reason,
    lastErrorAt: at,
  });
  console.warn(`${LOG} ${account.channel} ${account.externalId} (${account.displayName ?? ""}) desconectada: ${reason} · ${source}`);
  return true;
}

// debug_token del token guardado. Devuelve la salud resultante.
export async function verifySocialToken(
  deps: SocialHealthDeps,
  account: SocialRecord,
  { afterPermissionError = false }: { afterPermissionError?: boolean } = {}
): Promise<SocialHealth> {
  const current = account.health ?? "active";
  const app = metaAppCredentials();
  if (!account.accessToken || (!app && !deps.debugToken)) return current;
  const source = afterPermissionError ? "graph_error" : "token_check";

  let data: DebugTokenData;
  try {
    data = await (deps.debugToken ?? ((t: string) => debugToken(t, app!)))(account.accessToken);
  } catch (err) {
    // Meta no contestó: no se decide nada, se reintenta en el próximo chequeo.
    await deps.repo.updateSocialHealth(account.id, { lastError: `No se pudo verificar el token: ${(err as Error).message}`, lastErrorAt: now() });
    return current;
  }

  if (data.is_valid === false) {
    await markDisconnected(deps, account, "TOKEN_INVALID", source, data.error?.message ?? null);
    return "disconnected";
  }
  const scopes = new Set([...(data.scopes ?? []), ...(data.granular_scopes ?? []).map((g) => g.scope)]);
  const missing = requiredScopes(account).filter((s) => !scopes.has(s));
  if (missing.length > 0) {
    await markDisconnected(deps, account, "PERMISSIONS_MISSING", source, `Faltan: ${missing.join(", ")}`);
    return "disconnected";
  }

  await deps.repo.updateSocialHealth(account.id, { healthCheckedAt: now() });
  // Token sano: un "sin permiso" puntual queda en needs_attention hasta el próximo chequeo diario.
  if (!afterPermissionError && current === "needs_attention") {
    await deps.repo.updateSocialHealth(account.id, { health: "active", lastError: null, lastErrorAt: null, disconnectionInfo: null });
    return "active";
  }
  return afterPermissionError ? "needs_attention" : current;
}

// La llaman los clientes de Graph cuando una llamada con el token de una cuenta falla.
// Nunca tira: el error original de la llamada es el que importa.
export async function reportSocialTokenError(
  channel: SocialKind,
  externalId: string,
  code: number | null,
  message: string,
  injected?: SocialHealthDeps
) {
  if (channel !== "fb" && channel !== "ig") return;
  if (code !== 190 && (code === null || !PERMISSION_CODES.has(code))) return;
  try {
    const deps = injected ?? (await defaultDeps());
    if (!deps) return;
    const account = await deps.repo.findSocial(channel, externalId);
    if (!account || account.health === "disconnected") return;
    if (code === 190) {
      await markDisconnected(deps, account, "TOKEN_INVALID", "graph_error", message);
      return;
    }
    if ((account.health ?? "active") === "active") {
      await deps.repo.updateSocialHealth(account.id, { health: "needs_attention", lastError: `(#${code}) ${message}`, lastErrorAt: now() });
    }
    await verifySocialToken(deps, { ...account, health: "needs_attention" }, { afterPermissionError: true });
  } catch (err) {
    console.error(`${LOG} No se pudo procesar el error de token:`, (err as Error).message);
  }
}

// Chequeo de cada cuenta de Facebook / Instagram que no se verificó desde `at - DAY`.
// Con `at` en el futuro verifica todas (lo usa el aviso de Meta de app quitada).
export async function runSocialHealthSweep(injected?: SocialHealthDeps, at = now()) {
  const deps = injected ?? (await defaultDeps());
  if (!deps) return { checked: 0, disconnected: 0 };
  const due = await deps.repo.listSocialForHealthCheck(at - DAY);
  let disconnected = 0;
  for (const account of due) {
    if ((await verifySocialToken(deps, account)) === "disconnected") disconnected++;
  }
  return { checked: due.length, disconnected };
}

async function defaultDeps(): Promise<SocialHealthDeps | null> {
  const { isDbConfigured } = await import("../db");
  if (!isDbConfigured()) return null;
  const { getMySqlChannelsRepo } = await import("./repo-mysql");
  return { repo: getMySqlChannelsRepo() };
}

// Texto para la tarjeta de Canales.
export function describeSocialHealth(account: SocialRecord): string | null {
  if (account.health === "disconnected") {
    switch (account.disconnectionInfo?.reason) {
      case "PERMISSIONS_MISSING":
        return "Se quitaron permisos que DigiBot necesita. Reconectá y aceptá todos los permisos.";
      default:
        return "Meta ya no acepta el acceso (se quitó DigiBot o se cambió la contraseña). Reconectá la cuenta.";
    }
  }
  if (account.health === "needs_attention") return "Meta rechazó una operación por permisos. Si sigue, reconectá la cuenta.";
  return null;
}
