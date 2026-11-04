// Conectar y desconectar canales de una cuenta. Server-only.
//
//   WhatsApp   -> Embedded Signup (SDK de Facebook): el navegador manda el código + waba_id + phone_number_id
//   Facebook / Instagram -> Facebook Login for Business: con el código se listan las páginas, la
//                 persona elige cuáles (y su Instagram) y recién ahí se guardan
//   Threads    -> OAuth con redirect; el token dura 60 días y se renueva solo
//
// Un número / página / perfil no puede estar conectado a dos cuentas de DigiBot a la vez.

import { randomInt } from "node:crypto";
import { metaAppCredentials, publicBaseUrl, threadsAppCredentials, THREADS_CALLBACK_PATH, THREADS_SCOPES } from "./config";
import * as meta from "./meta-connect";
import { ConnectError } from "./meta-connect";
import type { ChannelsRepo, SocialKind, SocialRecord, WhatsAppRecord } from "./repo";
import { seal, unseal } from "./seal";
import type { ConnectedAccount, PageChoice, ProviderId } from "./types";

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

const PROVIDER_OF: Record<SocialKind, ProviderId> = { fb: "facebook", ig: "instagram", th: "threads" };

export function whatsappAccountView(w: WhatsAppRecord): ConnectedAccount {
  return {
    key: `wa:${w.id}`,
    provider: "whatsapp",
    title: w.displayPhoneNumber ?? w.phoneNumberId,
    subtitle: w.verifiedName,
    pictureUrl: null,
    connectedAt: w.connectedAt,
    expiresAt: null,
    fromEnv: false,
  };
}

export function socialAccountView(s: SocialRecord): ConnectedAccount {
  const subtitle =
    s.channel === "ig"
      ? s.pageName
        ? `Vinculado a la página ${s.pageName}`
        : null
      : s.channel === "fb"
        ? "Messenger y comentarios de la página"
        : "Respuestas a tus hilos";
  return {
    key: `social:${s.id}`,
    provider: PROVIDER_OF[s.channel],
    title: s.displayName ?? s.externalId,
    subtitle,
    pictureUrl: s.pictureUrl,
    connectedAt: s.connectedAt,
    expiresAt: s.tokenExpiresAt,
    fromEnv: false,
  };
}

function requireMetaApp() {
  const app = metaAppCredentials();
  if (!app) throw new ConnectError("La conexión con Meta todavía no está habilitada.", 503);
  return app;
}

const isGraphId = (value: unknown): value is string => typeof value === "string" && /^\d{5,30}$/.test(value);

// ---------- WhatsApp (Embedded Signup) ----------

export async function connectWhatsApp(repo: ChannelsRepo, ctx: ConnectContext, body: unknown) {
  const data = (body ?? {}) as Record<string, unknown>;
  if (typeof data.code !== "string" || !data.code || !isGraphId(data.wabaId) || !isGraphId(data.phoneNumberId)) {
    throw new ConnectError("Faltan datos de la conexión. Volvé a intentarlo desde el botón Conectar.");
  }
  const app = requireMetaApp();
  const existing = await repo.findWhatsAppByPhone(data.phoneNumberId);
  if (existing && existing.accountId !== ctx.accountId) throw new ConnectError(`Ese número ${TAKEN}`, 409);

  const token = await meta.exchangeFacebookCode(data.code, app);
  await meta.subscribeAppToWaba(token, data.wabaId);
  const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const registered = await meta.registerPhoneNumber(token, data.phoneNumberId, pin);
  const info = await meta.fetchPhoneNumber(token, data.phoneNumberId).catch(() => ({
    displayPhoneNumber: null,
    verifiedName: null,
  }));

  const id = await repo.saveWhatsApp({
    accountId: ctx.accountId,
    wabaId: data.wabaId,
    phoneNumberId: data.phoneNumberId,
    displayPhoneNumber: info.displayPhoneNumber,
    verifiedName: info.verifiedName,
    accessToken: token,
    connectedBy: ctx.userId || null,
    pin: registered ? pin : null,
  });
  const saved = (await repo.listWhatsApp(ctx.accountId)).find((w) => w.id === id);
  return saved ? whatsappAccountView(saved) : null;
}

// ---------- Facebook e Instagram (Login for Business) ----------

interface SealedPage {
  id: string;
  name: string;
  token: string;
  pictureUrl: string | null;
  instagram: { id: string; username: string; pictureUrl: string | null } | null;
}

// Paso 1: con el código del login, las páginas para elegir (los tokens viajan sellados).
export async function listFacebookPages(repo: ChannelsRepo, ctx: ConnectContext, code: unknown) {
  if (typeof code !== "string" || !code) throw new ConnectError("Falta la autorización de Facebook. Probá de nuevo.");
  const app = requireMetaApp();
  const userToken = await meta.longLivedFacebookToken(await meta.exchangeFacebookCode(code, app), app);
  const pages = await meta.fetchPages(userToken);
  if (pages.length === 0) {
    throw new ConnectError("No encontramos páginas. Revisá que hayas elegido al menos una página al dar los permisos.", 404);
  }

  const choices: PageChoice[] = [];
  for (const page of pages) {
    const fb = await repo.findSocial("fb", page.id);
    const ig = page.instagram ? await repo.findSocial("ig", page.instagram.id) : null;
    choices.push({
      id: page.id,
      name: page.name,
      pictureUrl: page.pictureUrl,
      instagram: page.instagram,
      connectedHere: { facebook: fb?.accountId === ctx.accountId, instagram: ig?.accountId === ctx.accountId },
      takenElsewhere: {
        facebook: Boolean(fb && fb.accountId !== ctx.accountId),
        instagram: Boolean(ig && ig.accountId !== ctx.accountId),
      },
    });
  }
  const sealed: SealedPage[] = pages.map((p) => ({
    id: p.id,
    name: p.name,
    token: p.accessToken,
    pictureUrl: p.pictureUrl,
    instagram: p.instagram,
  }));
  return { pages: choices, selection: seal("fb-pages", ctx.accountId, ctx.userId, sealed, PAGES_TTL) };
}

export interface PageSelection {
  pageId: string;
  facebook: boolean;
  instagram: boolean;
}

// Paso 2: conecta lo elegido (Messenger + comentarios de la página y/o su Instagram).
export async function connectFacebookPages(
  repo: ChannelsRepo,
  ctx: ConnectContext,
  selection: unknown,
  choices: unknown
) {
  const opened = unseal<SealedPage[]>(selection, "fb-pages", ctx);
  if (!opened) throw new ConnectError("Pasó mucho tiempo desde que diste los permisos. Volvé a tocar Conectar.", 410);
  const picks = (Array.isArray(choices) ? choices : []).filter(
    (c): c is PageSelection =>
      typeof c?.pageId === "string" && typeof c.facebook === "boolean" && typeof c.instagram === "boolean"
  );
  if (!picks.some((p) => p.facebook || p.instagram)) throw new ConnectError("Elegí al menos una página o cuenta de Instagram.");

  const connected: ConnectedAccount[] = [];
  for (const pick of picks) {
    const page = opened.data.find((p) => p.id === pick.pageId);
    if (!page || (!pick.facebook && !pick.instagram)) continue;

    const fbExisting = pick.facebook ? await repo.findSocial("fb", page.id) : null;
    if (fbExisting && fbExisting.accountId !== ctx.accountId) throw new ConnectError(`La página ${page.name} ${TAKEN}`, 409);
    const igExisting = pick.instagram && page.instagram ? await repo.findSocial("ig", page.instagram.id) : null;
    if (igExisting && igExisting.accountId !== ctx.accountId) {
      throw new ConnectError(`El Instagram @${page.instagram!.username} ${TAKEN}`, 409);
    }

    // Una sola suscripción de la página cubre Messenger, comentarios e Instagram.
    await meta.subscribePage(page.token, page.id);

    if (pick.facebook) {
      const id = await repo.saveSocial({
        accountId: ctx.accountId,
        channel: "fb",
        externalId: page.id,
        pageId: page.id,
        displayName: page.name,
        accessToken: page.token,
        tokenExpiresAt: null,
        pictureUrl: page.pictureUrl,
        pageName: null,
        connectedBy: ctx.userId || null,
      });
      const saved = (await repo.listSocial(ctx.accountId)).find((s) => s.id === id);
      if (saved) connected.push(socialAccountView(saved));
    }
    if (pick.instagram && page.instagram) {
      const id = await repo.saveSocial({
        accountId: ctx.accountId,
        channel: "ig",
        externalId: page.instagram.id,
        pageId: page.id,
        displayName: `@${page.instagram.username}`,
        accessToken: page.token,
        tokenExpiresAt: null,
        pictureUrl: page.instagram.pictureUrl,
        pageName: page.name,
        connectedBy: ctx.userId || null,
      });
      const saved = (await repo.listSocial(ctx.accountId)).find((s) => s.id === id);
      if (saved) connected.push(socialAccountView(saved));
    }
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

export async function disconnectChannel(repo: ChannelsRepo, accountId: number, key: unknown) {
  const match = typeof key === "string" ? /^(wa|social):(\d+)$/.exec(key) : null;
  if (!match) throw new ConnectError("Esa conexión no se puede desconectar desde el panel.", 400);
  const id = Number(match[2]);

  if (match[1] === "wa") {
    const removed = await repo.disconnectWhatsApp(accountId, id);
    if (!removed) throw new ConnectError("La conexión no existe.", 404);
    // Si no quedan números de ese WABA en la cuenta, se deja de recibir sus mensajes.
    const others = (await repo.listWhatsApp(accountId)).some((w) => w.wabaId === removed.wabaId);
    if (!others) await meta.unsubscribeAppFromWaba(removed.accessToken, removed.wabaId).catch(() => undefined);
    return removed;
  }

  const removed = await repo.disconnectSocial(accountId, id);
  if (!removed) throw new ConnectError("La conexión no existe.", 404);
  // La página se desuscribe solo si ya no la usa ni Messenger ni su Instagram.
  if (removed.pageId && removed.channel !== "th") {
    const stillUsed = (await repo.listSocial(accountId)).some((s) => s.pageId === removed.pageId);
    if (!stillUsed) await meta.unsubscribePage(removed.accessToken, removed.pageId).catch(() => undefined);
  }
  return removed;
}
