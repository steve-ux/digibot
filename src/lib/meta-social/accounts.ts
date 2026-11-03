// Cuentas de Instagram y Messenger conectadas. Server-only.
//
// Se leen de web_channel_accounts (la etapa de Canales las va a cargar con el
// flujo de Meta). Mientras tanto, para probar, sirven las variables:
//   META_PAGE_ID, META_PAGE_ACCESS_TOKEN, META_PAGE_NAME          -> Messenger
//   META_IG_ACCOUNT_ID, META_IG_USERNAME (+ META_PAGE_*)          -> Instagram
// Instagram usa el token de la página de Facebook vinculada.

import type { RowDataPacket } from "mysql2";
import { decryptSecret } from "../crypto";
import { getPool, isDbConfigured } from "../db";

export type SocialChannel = "ig" | "fb";

export interface SocialAccount {
  channel: SocialChannel;
  // entry.id de los webhooks: page_id (fb) o ig_user_id (ig)
  accountId: string;
  pageId: string;
  displayName: string | null;
  accessToken: string | null;
  apiVersion: string;
  source: "db" | "env";
}

interface AccountRow extends RowDataPacket {
  channel: SocialChannel;
  account_id: string;
  page_id: string;
  display_name: string | null;
  access_token_enc: string | null;
}

const TTL_MS = 60_000;
let cache: { at: number; promise: Promise<SocialAccount[]> } | null = null;

const apiVersion = () => process.env.META_GRAPH_API_VERSION || "v23.0";

function envAccounts(): SocialAccount[] {
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
  return accounts;
}

async function loadAccounts(): Promise<SocialAccount[]> {
  const fromDb: SocialAccount[] = [];
  if (isDbConfigured()) {
    const [rows] = await getPool().query<AccountRow[]>(
      `SELECT channel, account_id, page_id, display_name, access_token_enc
       FROM web_channel_accounts WHERE status = 'connected'`
    );
    for (const row of rows) {
      fromDb.push({
        channel: row.channel,
        accountId: row.account_id,
        pageId: row.page_id,
        displayName: row.display_name,
        accessToken: row.access_token_enc ? decryptSecret(row.access_token_enc) : null,
        apiVersion: apiVersion(),
        source: "db",
      });
    }
  }
  // La base tiene prioridad; las variables completan lo que falte.
  const env = envAccounts().filter((e) => !fromDb.some((d) => d.channel === e.channel && d.accountId === e.accountId));
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
