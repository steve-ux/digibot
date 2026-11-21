// Conectar una cuenta de TikTok y mantener su token vigente. Server-only.
//
// OAuth: www.tiktok.com/v2/auth/authorize (client_key = App ID) con un state sellado
// (cuenta + persona, como Threads). TikTok vuelve a TIKTOK_CALLBACK_PATH con ?code=…&state=…
// (algunas versiones lo llaman auth_code). El código vale 10 minutos y se usa una sola vez.
//
// El access token dura 1 día: se renueva solo, con el refresh token (1 año), cuando le
// queda poco. Cada renovación trae tokens nuevos y se guardan los dos.

import { publicBaseUrl, tiktokAppCredentials, tiktokRedirectUri, tiktokScopes } from "../channels/config";
import { ConnectError } from "../channels/meta-connect";
import type { ChannelsRepo, SocialRecord } from "../channels/repo";
import { getMySqlChannelsRepo } from "../channels/repo-mysql";
import { seal, unseal } from "../channels/seal";
import { isDbConfigured } from "../db";
import { exchangeCode, fetchProfile, refreshTokens, revokeToken, TikTokApiError } from "./api";

const STATE_TTL = 10 * 60;
// Se renueva cuando al access token le quedan menos de 30 minutos.
const REFRESH_MARGIN = 30 * 60;
const TAKEN = "ya está conectada a otra cuenta de DigiBot. Desconectala de esa cuenta primero.";

export class TikTokAuthError extends Error {}

function requireApp() {
  const app = tiktokAppCredentials();
  if (!app) throw new ConnectError("La conexión con TikTok todavía no está habilitada.", 503);
  return app;
}

export function tiktokAuthorizeUrl(ctx: { accountId: number; userId: number }, headers?: Headers) {
  const app = requireApp();
  const url = new URL("https://www.tiktok.com/v2/auth/authorize");
  url.searchParams.set("client_key", app.appId);
  url.searchParams.set("scope", tiktokScopes().join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", tiktokRedirectUri(headers));
  url.searchParams.set("state", seal("tiktok", ctx.accountId, ctx.userId, null, STATE_TTL));
  // Siempre muestra la pantalla de permisos (si no, TikTok la salta para quien ya autorizó).
  url.searchParams.set("disable_auto_auth", "1");
  return url.toString();
}

export async function completeTikTok(
  repo: ChannelsRepo,
  input: {
    code: unknown;
    state: unknown;
    userId: number;
    headers?: Headers;
    canConnect: (accountId: number) => boolean;
  }
) {
  const opened = unseal<null>(input.state, "tiktok", { userId: input.userId });
  if (!opened) throw new ConnectError("El pedido de conexión venció o no es válido. Volvé a tocar Conectar.", 410);
  if (!input.canConnect(opened.accountId)) throw new ConnectError("No tenés permiso para conectar canales en esa cuenta.", 403);
  if (typeof input.code !== "string" || !input.code) throw new ConnectError("TikTok no autorizó la conexión.");
  const app = requireApp();

  let tokens;
  try {
    tokens = await exchangeCode(input.code, tiktokRedirectUri(input.headers), app);
  } catch (err) {
    console.error("[tiktok] Falló el canje del código:", err);
    throw new ConnectError("TikTok no aceptó la autorización. Probá conectar de nuevo.", 502);
  }
  if (!tokens.scope.includes("comment.list") || !tokens.scope.includes("comment.list.manage")) {
    throw new ConnectError("Para responder comentarios, aceptá todos los permisos que pide DigiBot en TikTok.", 400);
  }

  const profile = await fetchProfile(tokens.accessToken, tokens.openId).catch((err) => {
    console.error("[tiktok] No se pudo leer el perfil:", (err as Error).message);
    return null;
  });
  const existing = await repo.findSocial("tt", tokens.openId);
  const username = profile?.username ?? null;
  const title = username ? `@${username}` : (profile?.displayName ?? "Cuenta de TikTok");
  if (existing && existing.accountId !== opened.accountId) throw new ConnectError(`La cuenta ${title} de TikTok ${TAKEN}`, 409);

  const now = Math.floor(Date.now() / 1000);
  const id = await repo.saveSocial({
    accountId: opened.accountId,
    channel: "tt",
    externalId: tokens.openId,
    pageId: null,
    displayName: title,
    accessToken: tokens.accessToken,
    tokenExpiresAt: now + tokens.expiresIn,
    refreshToken: tokens.refreshToken,
    refreshExpiresAt: now + tokens.refreshExpiresIn,
    pictureUrl: profile?.pictureUrl ?? null,
    pageName: null,
    connectedBy: input.userId || null,
  });
  return { accountId: opened.accountId, id, title, openId: tokens.openId };
}

// Renovaciones en curso por cuenta: dos pedidos a la vez no gastan el refresh token dos veces.
const inflight = new Map<number, Promise<string>>();

// Token vigente de una cuenta conectada (lo renueva si hace falta).
export async function freshAccessToken(repo: ChannelsRepo, record: SocialRecord): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (record.accessToken && (record.tokenExpiresAt ?? 0) - now > REFRESH_MARGIN) return record.accessToken;
  const pending = inflight.get(record.id);
  if (pending) return pending;

  const task = (async () => {
    if (!record.refreshToken || (record.refreshExpiresAt ?? 0) <= now) {
      throw new TikTokAuthError("La autorización de TikTok venció. Volvé a conectar la cuenta desde Canales.");
    }
    try {
      const next = await refreshTokens(record.refreshToken, requireApp());
      const at = Math.floor(Date.now() / 1000);
      await repo.updateSocialToken(record.id, next.accessToken, at + next.expiresIn);
      await repo.updateRefreshToken(record.id, next.refreshToken, at + next.refreshExpiresIn);
      record.accessToken = next.accessToken;
      record.tokenExpiresAt = at + next.expiresIn;
      record.refreshToken = next.refreshToken;
      record.refreshExpiresAt = at + next.refreshExpiresIn;
      return next.accessToken;
    } catch (err) {
      if (err instanceof TikTokApiError) {
        console.error(`[tiktok] No se pudo renovar el token de ${record.displayName}:`, err.message, err.code);
        throw new TikTokAuthError("TikTok rechazó la renovación de la autorización. Volvé a conectar la cuenta desde Canales.");
      }
      throw err;
    }
  })();
  inflight.set(record.id, task);
  try {
    return await task;
  } finally {
    inflight.delete(record.id);
  }
}

// Cuenta conectada por open_id (la de los webhooks y la de cada conversación).
export async function findTikTokAccount(openId: string, repo?: ChannelsRepo) {
  const r = repo ?? (isDbConfigured() ? getMySqlChannelsRepo() : null);
  if (!r) return null;
  const record = await r.findSocial("tt", openId);
  return record ? { repo: r, record } : null;
}

// Al desconectar: se revoca el token en TikTok (si falla, igual queda desconectada acá).
export async function revokeTikTok(record: SocialRecord) {
  const app = tiktokAppCredentials();
  if (!app || !record.accessToken) return;
  await revokeToken(record.accessToken, app).catch((err) =>
    console.info("[tiktok] No se pudo revocar el token:", (err as Error).message)
  );
}

export function tiktokWebhookUrl(headers?: Headers) {
  return `${publicBaseUrl(headers)}/webhooks/tiktok`;
}
