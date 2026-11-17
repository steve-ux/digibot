// Salud de las conexiones de WhatsApp: active · needs_attention · disconnected. Server-only.
//
// Se entera por tres lados:
//   - webhooks account_update (PARTNER_REMOVED / ACCOUNT_OFFBOARDED / ACCOUNT_RECONNECTED), ver webhook-events.ts
//   - errores de Graph con el token del cliente (reportTokenError, lo llaman los clientes HTTP)
//       190       -> disconnected en el acto
//       200 / 10  -> needs_attention y se verifica con debug_token: inválido o sin scopes -> disconnected
//   - el chequeo diario (runHealthSweep) con debug_token, aunque no haya tráfico

import { metaAppCredentials } from "../channels/config";
import { debugToken } from "./graph";
import type { WaAccount } from "./repo";
import { getWaDeps, type WaDeps } from "./runtime";
import type { DisconnectionInfo, WaHealth } from "./types";

export const REQUIRED_SCOPES = ["whatsapp_business_management", "whatsapp_business_messaging"];
const PERMISSION_CODES = new Set([200, 10]);
const DAY = 24 * 3600;
const now = () => Math.floor(Date.now() / 1000);

export async function markDisconnected(
  deps: WaDeps,
  account: WaAccount,
  info: Omit<DisconnectionInfo, "at">,
  detail: string | null = null
) {
  if (account.health === "disconnected") return false;
  const full: DisconnectionInfo = { ...info, at: now() };
  await deps.repo.updateAccount(account.id, {
    health: "disconnected",
    disconnectionInfo: full,
    lastError: detail ?? info.reason,
    lastErrorAt: full.at,
  });
  deps.onConnectionsChanged();
  console.warn(`[wa-health] Conexión ${account.id} (${account.phoneNumberId}) desconectada: ${info.reason} · ${info.source}`);
  try {
    await deps.notifier.disconnected({ ...account, health: "disconnected", disconnectionInfo: full }, full);
  } catch (err) {
    console.error("[wa-health] No se pudo avisar la desconexión:", (err as Error).message);
  }
  return true;
}

export async function markActive(deps: WaDeps, account: WaAccount) {
  if (account.health === "active" && !account.disconnectionInfo) return;
  await deps.repo.updateAccount(account.id, { health: "active", disconnectionInfo: null, lastError: null, lastErrorAt: null });
  deps.onConnectionsChanged();
}

// debug_token del token guardado. Devuelve la salud resultante.
export async function verifyAccountToken(
  deps: WaDeps,
  account: WaAccount,
  { afterPermissionError = false }: { afterPermissionError?: boolean } = {}
): Promise<WaHealth> {
  const app = metaAppCredentials();
  if (!app || !account.accessToken) return account.health;
  const source = afterPermissionError ? "graph_error" : "token_check";

  let data;
  try {
    data = await debugToken(account.accessToken, app);
  } catch (err) {
    await deps.repo.updateAccount(account.id, {
      lastError: `No se pudo verificar el token: ${(err as Error).message}`,
      lastErrorAt: now(),
    });
    return account.health;
  }

  if (data.is_valid === false) {
    await markDisconnected(deps, account, { reason: "TOKEN_INVALID", initiatedBy: null, source }, data.error?.message ?? null);
    return "disconnected";
  }
  const scopes = new Set([...(data.scopes ?? []), ...(data.granular_scopes ?? []).map((g) => g.scope)]);
  const missing = REQUIRED_SCOPES.filter((s) => !scopes.has(s));
  if (missing.length > 0) {
    await markDisconnected(deps, account, { reason: "PERMISSIONS_MISSING", initiatedBy: null, source }, `Faltan: ${missing.join(", ")}`);
    return "disconnected";
  }

  await deps.repo.updateAccount(account.id, { healthCheckedAt: now() });
  // Token sano: un "sin permiso" puntual sigue en needs_attention; el chequeo diario lo limpia.
  if (!afterPermissionError && account.health === "needs_attention") {
    await markActive(deps, account);
    return "active";
  }
  return afterPermissionError ? "needs_attention" : account.health;
}

// La llaman los clientes HTTP de Graph cuando una llamada con el token de una conexión falla.
// Nunca tira: el error original de la llamada es el que importa.
export async function reportTokenError(connectionId: number, code: number | null, message: string, injected?: WaDeps) {
  if (code !== 190 && (code === null || !PERMISSION_CODES.has(code))) return;
  try {
    const deps = injected ?? (await getWaDeps());
    const account = await deps.repo.getAccount(connectionId);
    if (!account || account.status !== "connected" || account.health === "disconnected") return;

    if (code === 190) {
      await markDisconnected(deps, account, { reason: "TOKEN_INVALID", initiatedBy: null, source: "graph_error" }, message);
      return;
    }
    const at = now();
    if (account.health === "active") {
      await deps.repo.updateAccount(account.id, { health: "needs_attention", lastError: `(#${code}) ${message}`, lastErrorAt: at });
      deps.onConnectionsChanged();
      try {
        await deps.notifier.needsAttention(account, `Meta respondió (#${code}) ${message}`);
      } catch (err) {
        console.error("[wa-health] No se pudo avisar:", (err as Error).message);
      }
    }
    await verifyAccountToken(deps, { ...account, health: "needs_attention" }, { afterPermissionError: true });
  } catch (err) {
    console.error("[wa-health] No se pudo procesar el error de token:", (err as Error).message);
  }
}

// Chequeo diario: cada conexión vinculada que no se verificó en las últimas 24 h.
export async function runHealthSweep(injected?: WaDeps, at = now()) {
  const deps = injected ?? (await getWaDeps());
  const due = await deps.repo.listForHealthCheck(at - DAY);
  let disconnected = 0;
  for (const account of due) {
    if ((await verifyAccountToken(deps, account)) === "disconnected") disconnected++;
  }
  return { checked: due.length, disconnected };
}
