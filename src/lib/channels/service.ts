// Conectar y desconectar canales de una cuenta. Server-only.
//
//   WhatsApp   -> Embedded Signup por sesión: ver src/lib/whatsapp-accounts/onboarding.ts
//   Facebook   -> Facebook Login for Business (META_FB_IG_CONFIG_ID): se listan las páginas,
//                 la persona elige cuáles y recién ahí se guardan
//   Instagram  -> Instagram API with Unified Login (META_IG_CONFIG_ID): se listan las cuentas
//                 asignadas al token de usuario del sistema; no hace falta página
//   Threads    -> OAuth con redirect; el token dura 60 días y se renueva solo
//   TikTok     -> OAuth con redirect (src/lib/tiktok/connection.ts); token de 1 día que se renueva solo
//
// Un número / página / perfil no puede estar conectado a dos cuentas de DigiBot a la vez.

import {
  facebookConfigId,
  instagramConfigId,
  metaAppCredentials,
  publicBaseUrl,
  threadsAppCredentials,
  THREADS_CALLBACK_PATH,
  THREADS_SCOPES,
} from "./config";
import * as meta from "./meta-connect";
import { ConnectError } from "./meta-connect";
import { unsubscribeApp } from "../whatsapp-accounts/graph";
import type { WaRepo } from "../whatsapp-accounts/repo";
import { getWaDeps } from "../whatsapp-accounts/runtime";
import type { ChannelsRepo, SocialKind, SocialRecord } from "./repo";
import { seal, unseal } from "./seal";
import { describeSocialHealth } from "./social-health";
import type { ConnectedAccount, InstagramChoice, PageChoice, ProviderId } from "./types";

export { ConnectError };

export interface ConnectContext {
  accountId: number;
  userId: number;
}

const TAKEN = "ya está conectado a otra cuenta de DigiBot. Desconectalo de esa cuenta primero.";
const PAGES_TTL = 15 * 60;
const STATE_TTL = 10 * 60;
// Se renueva el token de Threads cuando le quedan menos de 10 días.
export const THREADS_REFRESH_WINDOW = 10 * 24 * 3600;

const PROVIDER_OF: Record<SocialKind, ProviderId> = { fb: "facebook", ig: "instagram", th: "threads", tt: "tiktok" };

export function socialAccountView(s: SocialRecord): ConnectedAccount {
  const subtitle =
    s.channel === "ig"
      ? s.authType === "ig_unified"
        ? "Mensajes directos y comentarios"
        : s.pageName
          ? `Vinculado a la página ${s.pageName}`
          : null
      : s.channel === "fb"
        ? "Messenger y comentarios de la página"
        : s.channel === "tt"
          ? "Comentarios de tus videos"
          : "Respuestas a tus hilos";
  return {
    key: `social:${s.id}`,
    provider: PROVIDER_OF[s.channel],
    title: s.displayName ?? s.externalId,
    subtitle,
    pictureUrl: s.pictureUrl,
    connectedAt: s.connectedAt,
    // TikTok renueva su token todos los días: lo que importa es el refresh token (1 año)
    expiresAt: s.channel === "tt" ? null : s.tokenExpiresAt,
    fromEnv: false,
    ...(s.channel === "fb" || s.channel === "ig" ? { health: s.health ?? "active", healthMessage: describeSocialHealth(s) } : {}),
  };
}

function requireMetaApp() {
  const app = metaAppCredentials();
  if (!app) throw new ConnectError("La conexión con Meta todavía no está habilitada.", 503);
  return app;
}

function requireCode(code: unknown, what: string): string {
  if (typeof code !== "string" || !code) throw new ConnectError(`Falta la autorización de ${what}. Probá de nuevo.`);
  return code;
}

// Ids elegidos en el selector (solo strings, sin repetir).
function pickedIds(choices: unknown): string[] {
  const ids = (Array.isArray(choices) ? choices : []).filter((c): c is string => typeof c === "string" && c.length > 0);
  return Array.from(new Set(ids));
}

async function viewOf(repo: ChannelsRepo, accountId: number, id: number) {
  const saved = (await repo.listSocial(accountId)).find((s) => s.id === id);
  return saved ? socialAccountView(saved) : null;
}

// ---------- Facebook: páginas (Messenger + comentarios) ----------
//
// FB.login con META_FB_IG_CONFIG_ID -> code -> token (de usuario del sistema) -> debug_token
// -> /me/accounts -> la persona elige -> token de página cifrado + subscribed_apps.

interface SealedPage {
  id: string;
  name: string;
  token: string;
  pictureUrl: string | null;
}

export const FACEBOOK_SCOPES = ["pages_show_list", "pages_messaging", "pages_manage_metadata"];

// Paso 1: con el código del login, las páginas para elegir (los tokens viajan sellados).
export async function listFacebookPages(repo: ChannelsRepo, ctx: ConnectContext, code: unknown) {
  const app = requireMetaApp();
  let token = await meta.exchangeFacebookCode(requireCode(code, "Facebook"), app);
  const info = await meta.inspectToken(token, app, FACEBOOK_SCOPES);
  // Con un token de usuario común las páginas heredan su vencimiento: se extiende.
  if (info.type === "USER") token = await meta.longLivedFacebookToken(token, app);
  const pages = await meta.fetchPages(token);
  if (pages.length === 0) {
    throw new ConnectError(
      "No encontramos páginas. Revisá que seas admin de la página y que la hayas elegido al dar los permisos.",
      404
    );
  }

  const choices: PageChoice[] = [];
  for (const page of pages) {
    const existing = await repo.findSocial("fb", page.id);
    choices.push({
      id: page.id,
      name: page.name,
      pictureUrl: page.pictureUrl,
      connectedHere: existing?.accountId === ctx.accountId,
      takenElsewhere: Boolean(existing && existing.accountId !== ctx.accountId),
    });
  }
  const sealed: SealedPage[] = pages.map((p) => ({ id: p.id, name: p.name, token: p.accessToken, pictureUrl: p.pictureUrl }));
  return { pages: choices, selection: seal("fb-pages", ctx.accountId, ctx.userId, sealed, PAGES_TTL) };
}

// Paso 2: conecta las páginas elegidas (choices = ids de página).
export async function connectFacebookPages(repo: ChannelsRepo, ctx: ConnectContext, selection: unknown, choices: unknown) {
  const opened = unseal<SealedPage[]>(selection, "fb-pages", ctx);
  if (!opened) throw new ConnectError("Pasó mucho tiempo desde que diste los permisos. Volvé a tocar Conectar.", 410);
  const pages = pickedIds(choices)
    .map((id) => opened.data.find((p) => p.id === id))
    .filter((p): p is SealedPage => Boolean(p));
  if (pages.length === 0) throw new ConnectError("Elegí al menos una página.");

  // Primero se valida todo, después se conecta (no queda nada a medias por una página tomada).
  for (const page of pages) {
    const existing = await repo.findSocial("fb", page.id);
    if (existing && existing.accountId !== ctx.accountId) throw new ConnectError(`La página ${page.name} ${TAKEN}`, 409);
  }

  const connected: ConnectedAccount[] = [];
  for (const page of pages) {
    await meta.subscribePage(page.token, page.id);
    const id = await repo.saveSocial({
      accountId: ctx.accountId,
      channel: "fb",
      externalId: page.id,
      pageId: page.id,
      authType: "page",
      configId: facebookConfigId(),
      displayName: page.name,
      accessToken: page.token,
      tokenExpiresAt: null,
      pictureUrl: page.pictureUrl,
      pageName: null,
      connectedBy: ctx.userId || null,
    });
    const view = await viewOf(repo, ctx.accountId, id);
    if (view) connected.push(view);
  }
  return connected;
}

// ---------- Instagram API with Unified Login ----------
//
// FB.login con META_IG_CONFIG_ID -> code -> token de usuario del sistema -> debug_token
// -> client_business_id -> /me/assigned_instagram_accounts -> la persona elige ->
// se guarda el token cifrado por cuenta + POST /{ig-id}/subscribed_apps.
// No hace falta página de Facebook.

interface SealedInstagram {
  token: string;
  businessId: string | null;
  expiresAt: number | null;
  accounts: { id: string; username: string; pictureUrl: string | null }[];
}

export async function listInstagramAccounts(repo: ChannelsRepo, ctx: ConnectContext, code: unknown) {
  const app = requireMetaApp();
  if (!instagramConfigId()) throw new ConnectError("La conexión con Instagram todavía no está habilitada.", 503);
  const token = await meta.exchangeFacebookCode(requireCode(code, "Instagram"), app);
  const info = await meta.inspectToken(token, app, meta.INSTAGRAM_SCOPES);
  const businessId = await meta.fetchClientBusinessId(token);
  const granted = [
    ...new Set([...(info.targets.instagram_basic ?? []), ...(info.targets.instagram_manage_messages ?? [])]),
  ];
  const accounts = await meta.fetchAssignedInstagramAccounts(token, granted);
  if (accounts.length === 0) {
    throw new ConnectError(
      "No encontramos cuentas de Instagram. Revisá que sea una cuenta profesional, que esté en tu portfolio comercial y que la hayas elegido al dar los permisos.",
      404
    );
  }

  const choices: InstagramChoice[] = [];
  for (const a of accounts) {
    const existing = await repo.findSocial("ig", a.id);
    choices.push({
      id: a.id,
      // Sin nombre cuando Meta no dejó leerlo (cuenta limitada por llamadas)
      name: a.username === a.id ? `Cuenta de Instagram ${a.id}` : `@${a.username}`,
      pictureUrl: a.pictureUrl,
      connectedHere: existing?.accountId === ctx.accountId,
      takenElsewhere: Boolean(existing && existing.accountId !== ctx.accountId),
    });
  }
  const sealed: SealedInstagram = { token, businessId, expiresAt: info.expiresAt, accounts };
  return { accounts: choices, selection: seal("ig-accounts", ctx.accountId, ctx.userId, sealed, PAGES_TTL) };
}

export async function connectInstagramAccounts(repo: ChannelsRepo, ctx: ConnectContext, selection: unknown, choices: unknown) {
  const opened = unseal<SealedInstagram>(selection, "ig-accounts", ctx);
  if (!opened) throw new ConnectError("Pasó mucho tiempo desde que diste los permisos. Volvé a tocar Conectar.", 410);
  const { token, businessId, expiresAt } = opened.data;
  const picked = pickedIds(choices)
    .map((id) => opened.data.accounts.find((a) => a.id === id))
    .filter((a): a is SealedInstagram["accounts"][number] => Boolean(a));
  if (picked.length === 0) throw new ConnectError("Elegí al menos una cuenta de Instagram.");

  for (const a of picked) {
    const existing = await repo.findSocial("ig", a.id);
    if (existing && existing.accountId !== ctx.accountId) throw new ConnectError(`El Instagram @${a.username} ${TAKEN}`, 409);
  }

  const connected: ConnectedAccount[] = [];
  for (const a of picked) {
    await meta.subscribeInstagram(token, a.id);
    const id = await repo.saveSocial({
      accountId: ctx.accountId,
      channel: "ig",
      externalId: a.id,
      pageId: null,
      authType: "ig_unified",
      businessId,
      configId: instagramConfigId(),
      displayName: `@${a.username}`,
      accessToken: token,
      tokenExpiresAt: expiresAt,
      pictureUrl: a.pictureUrl,
      pageName: null,
      connectedBy: ctx.userId || null,
    });
    const view = await viewOf(repo, ctx.accountId, id);
    if (view) connected.push(view);
  }
  return connected;
}

// ---------- Threads (OAuth con redirect) ----------

export function threadsRedirectUri(headers?: Headers) {
  return `${publicBaseUrl(headers)}${THREADS_CALLBACK_PATH}`;
}

export function threadsAuthorizeUrl(ctx: ConnectContext, headers?: Headers) {
  const app = threadsAppCredentials();
  if (!app) throw new ConnectError("La conexión con Threads todavía no está habilitada.", 503);
  const state = seal("threads", ctx.accountId, ctx.userId, null, STATE_TTL);
  return meta.threadsAuthorizeUrl(app.appId, threadsRedirectUri(headers), state, THREADS_SCOPES);
}

// Vuelta de Threads: devuelve la cuenta del panel a la que hay que volver.
export async function completeThreads(
  repo: ChannelsRepo,
  input: {
    code: unknown;
    state: unknown;
    userId: number;
    redirectUri: string;
    // ¿Puede esta persona configurar esa cuenta? (se valida antes de guardar nada)
    canConnect: (accountId: number) => boolean;
  }
) {
  const opened = unseal<null>(input.state, "threads", { userId: input.userId });
  if (!opened) throw new ConnectError("El pedido de conexión venció o no es válido. Volvé a tocar Conectar.", 410);
  if (!input.canConnect(opened.accountId)) {
    throw new ConnectError("No tenés permiso para conectar canales en esa cuenta.", 403);
  }
  const ctx: ConnectContext = { accountId: opened.accountId, userId: input.userId };
  if (typeof input.code !== "string" || !input.code) throw new ConnectError("Threads no autorizó la conexión.");
  const app = threadsAppCredentials();
  if (!app) throw new ConnectError("La conexión con Threads todavía no está habilitada.", 503);

  const short = await meta.exchangeThreadsCode(input.code, input.redirectUri, app);
  const long = await meta.longLivedThreadsToken(short, app.appSecret);
  const profile = await meta.fetchThreadsProfile(long.token);
  const existing = await repo.findSocial("th", profile.id);
  if (existing && existing.accountId !== ctx.accountId) {
    throw new ConnectError(`El perfil @${profile.username} de Threads ${TAKEN}`, 409);
  }
  await repo.saveSocial({
    accountId: ctx.accountId,
    channel: "th",
    externalId: profile.id,
    pageId: null,
    displayName: `@${profile.username}`,
    accessToken: long.token,
    tokenExpiresAt: Math.floor(Date.now() / 1000) + long.expiresIn,
    pictureUrl: profile.pictureUrl,
    pageName: null,
    connectedBy: ctx.userId || null,
  });
  return { accountId: ctx.accountId, username: profile.username };
}

// Renueva los tokens de Threads que están por vencer. Devuelve cuántos renovó.
export async function refreshExpiringThreads(repo: ChannelsRepo, now = Math.floor(Date.now() / 1000)) {
  let refreshed = 0;
  for (const account of await repo.listExpiring("th", now + THREADS_REFRESH_WINDOW)) {
    if (!account.accessToken || (account.tokenExpiresAt ?? 0) <= now) continue; // vencido: hay que reconectar
    try {
      const next = await meta.refreshThreadsToken(account.accessToken);
      await repo.updateSocialToken(account.id, next.token, now + next.expiresIn);
      refreshed++;
    } catch (err) {
      console.error(`[canales] No se pudo renovar el token de Threads ${account.displayName}:`, (err as Error).message);
    }
  }
  return refreshed;
}

// ---------- Desconectar ----------

export async function disconnectChannel(repo: ChannelsRepo, accountId: number, key: unknown, waRepo?: WaRepo) {
  const match = typeof key === "string" ? /^(wa|social):(\d+)$/.exec(key) : null;
  if (!match) throw new ConnectError("Esa conexión no se puede desconectar desde el panel.", 400);
  const id = Number(match[2]);

  if (match[1] === "wa") {
    const wa = waRepo ?? (await getWaDeps()).repo;
    const removed = await wa.revokeAccount(accountId, id);
    if (!removed) throw new ConnectError("La conexión no existe.", 404);
    // Si no quedan números de ese WABA en la cuenta, se deja de recibir sus mensajes.
    const others = (await wa.listByAccount(accountId)).some((w) => w.wabaId === removed.wabaId);
    if (!others && removed.health !== "disconnected") {
      await unsubscribeApp(removed.accessToken, removed.wabaId, removed.id).catch(() => undefined);
    }
    return removed;
  }

  const removed = await repo.disconnectSocial(accountId, id);
  if (!removed) throw new ConnectError("La conexión no existe.", 404);
  if (removed.channel === "tt") {
    const { revokeTikTok } = await import("../tiktok/connection");
    await revokeTikTok(removed);
    return removed;
  }
  if (removed.authType === "ig_unified") {
    await meta.unsubscribeInstagram(removed.accessToken, removed.externalId).catch(() => undefined);
    return removed;
  }
  // La página se desuscribe solo si ya no la usa ni Messenger ni un Instagram vinculado.
  if (removed.pageId && removed.channel !== "th") {
    const stillUsed = (await repo.listSocial(accountId)).some((s) => s.pageId === removed.pageId);
    if (!stillUsed) await meta.unsubscribePage(removed.accessToken, removed.pageId).catch(() => undefined);
  }
  return removed;
}
