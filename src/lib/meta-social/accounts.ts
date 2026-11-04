// Cuentas de Instagram y Messenger conectadas. Server-only.
//
// Se leen de web_channel_accounts (la etapa de Canales las va a cargar con el
// flujo de Meta). Mientras tanto, para probar, sirven las variables:
//   META_PAGE_ID, META_PAGE_ACCESS_TOKEN, META_PAGE_NAME          -> Messenger
//   META_IG_ACCOUNT_ID, META_IG_USERNAME (+ META_PAGE_*)          -> Instagram
//   THREADS_USER_ID, THREADS_ACCESS_TOKEN, THREADS_USERNAME        -> Threads
// Instagram usa el token de la página de Facebook vinculada; Threads tiene el suyo.

import type { RowDataPacket } from "mysql2";
import { decryptSecret } from "../crypto";
import { getPool, isDbConfigured } from "../db";

export type SocialChannel = "ig" | "fb" | "th";

export interface SocialAccount {
  channel: SocialChannel;
  // entry.id de los webhooks: page_id (fb) o ig_user_id (ig)
  accountId: string;
  // Página de Facebook (Messenger e Instagram envían con ella). Threads no tiene.
  pageId: string | null;
  displayName: string | null;
  accessToken: string | null;
  apiVersion: string;
  source: "db" | "env";
}

interface AccountRow extends RowDataPacket {
  id: number;
  channel: SocialChannel;
  account_id: string;
  page_id: string | null;
  display_name: string | null;
  access_token_enc: string | null;
  expires_ts?: number | string | null;
}

// Threads: si a algún token le quedan menos de 10 días, se renueva en segundo plano.
const REFRESH_WINDOW_SECONDS = 10 * 24 * 3600;
let refreshing = false;
function maybeRefreshThreads(rows: AccountRow[]) {
  const soon = Math.floor(Date.now() / 1000) + REFRESH_WINDOW_SECONDS;
  if (refreshing || !rows.some((r) => r.channel === "th" && r.expires_ts != null && Number(r.expires_ts) < soon)) return;
  refreshing = true;
  Promise.all([import("../channels/service"), import("../channels/repo-mysql")])
    .then(([service, repo]) => service.refreshExpiringThreads(repo.getMySqlChannelsRepo()))
    .then((n) => {
      if (n > 0) cache = null;
    })
    .catch((err) => console.error("[canales] No se pudieron renovar los tokens de Threads:", (err as Error).message))
    .finally(() => {
      refreshing = false;
    });
}

async function queryAccounts(): Promise<AccountRow[]> {
  try {
    const [rows] = await getPool().query<AccountRow[]>(
      `SELECT id, channel, account_id, page_id, display_name, access_token_enc, UNIX_TIMESTAMP(token_expires_at) AS expires_ts
       FROM web_channel_accounts WHERE status = 'connected'`
    );
    return rows;
  } catch (err) {
    // Sin la migración 0010 (token_expires_at) se leen las columnas básicas.
    if ((err as { code?: string }).code !== "ER_BAD_FIELD_ERROR") throw err;
    const [rows] = await getPool().query<AccountRow[]>(
      `SELECT id, channel, account_id, page_id, display_name, access_token_enc
       FROM web_channel_accounts WHERE status = 'connected'`
    );
    return rows;
  }
}

const TTL_MS = 60_000;
let cache: { at: number; promise: Promise<SocialAccount[]> } | null = null;

const apiVersion = (channel: SocialChannel = "fb") =>
  channel === "th" ? process.env.THREADS_API_VERSION || "v1.0" : process.env.META_GRAPH_API_VERSION || "v23.0";

// Cuentas configuradas con variables (antes de conectar desde Canales).
export function listEnvSocialAccounts(): SocialAccount[] {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN || null;
  const accounts: SocialAccount[] = [];
  if (pageId) {
    accounts.push({
      channel: "fb",
      accountId: pageId,
      pageId,
      displayName: process.env.META_PAGE_NAME || null,
      accessToken: token,
      apiVersion: apiVersion(),
      source: "env",
    });
  }
  const igId = process.env.META_IG_ACCOUNT_ID;
  if (igId && pageId) {
    const username = process.env.META_IG_USERNAME;
    accounts.push({
      channel: "ig",
      accountId: igId,
      pageId,
      displayName: username ? `@${username.replace(/^@/, "")}` : null,
      accessToken: token,
      apiVersion: apiVersion(),
      source: "env",
    });
  }
  const threadsId = process.env.THREADS_USER_ID;
  if (threadsId) {
    const username = process.env.THREADS_USERNAME;
    accounts.push({
      channel: "th",
      accountId: threadsId,
      pageId: null,
      displayName: username ? `@${username.replace(/^@/, "")}` : null,
      accessToken: process.env.THREADS_ACCESS_TOKEN || null,
      apiVersion: apiVersion("th"),
      source: "env",
    });
  }
  return accounts;
}

async function loadAccounts(): Promise<SocialAccount[]> {
  const fromDb: SocialAccount[] = [];
  if (isDbConfigured()) {
    const rows = await queryAccounts();
    maybeRefreshThreads(rows);
    for (const row of rows) {
      fromDb.push({
        channel: row.channel,
        accountId: row.account_id,
        pageId: row.page_id,
        displayName: row.display_name,
        accessToken: row.access_token_enc ? decryptSecret(row.access_token_enc) : null,
        apiVersion: apiVersion(row.channel),
        source: "db",
      });
    }
  }
  // La base tiene prioridad; las variables completan lo que falte.
  const env = listEnvSocialAccounts().filter((e) => !fromDb.some((d) => d.channel === e.channel && d.accountId === e.accountId));
  return [...fromDb, ...env];
}

export function listSocialAccounts(): Promise<SocialAccount[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = loadAccounts();
  cache = { at: Date.now(), promise };
  promise.catch(() => {
    if (cache?.promise === promise) cache = null;
  });
  return promise;
}

export async function getSocialAccount(channel: SocialChannel, accountId: string) {
  const accounts = await listSocialAccounts();
  return accounts.find((a) => a.channel === channel && a.accountId === accountId) ?? null;
}

// Solo para tests.
export function resetSocialAccountsCache() {
  cache = null;
}
