#!/usr/bin/env node
// Suscribe la app de TikTok al webhook de comentarios (comment.update). Va una sola vez
// por app, no por cuenta: TikTok avisa de todas las cuentas que autorizaron la app.
// La ruta /webhooks/tiktok tiene que estar publicada antes (TikTok puede probarla).
//
// Uso:
//   node scripts/tiktok-webhook.mjs subscribe [callback_url]   (por defecto <APP_URL>/webhooks/tiktok)
//   node scripts/tiktok-webhook.mjs list
//
// Lee TIKTOK_APP_ID, TIKTOK_APP_SECRET y APP_URL de .env.local (o .env).

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadEnvFile(path.resolve(".env.local"));
loadEnvFile(path.resolve(".env"));

const BASE = "https://business-api.tiktok.com/open_api/v1.3";
const appId = process.env.TIKTOK_APP_ID;
const secret = process.env.TIKTOK_APP_SECRET;
if (!appId || !secret) {
  console.error("Faltan TIKTOK_APP_ID / TIKTOK_APP_SECRET en .env.local.");
  process.exit(1);
}

const [command = "list", arg] = process.argv.slice(2);

async function show(res) {
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text);
  try {
    if (JSON.parse(text).code !== 0) process.exitCode = 1;
  } catch {
    process.exitCode = 1;
  }
}

if (command === "subscribe") {
  const base = (process.env.APP_URL || "https://digibotlatam.com").replace(/\/$/, "");
  const callbackUrl = arg || `${base}/webhooks/tiktok`;
  console.log(`Suscribiendo COMMENT -> ${callbackUrl}`);
  await show(
    await fetch(`${BASE}/business/webhook/update/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, secret, event_type: "COMMENT", callback_url: callbackUrl }),
    })
  );
} else if (command === "list") {
  // "Get TikTok account Webhook configurations"
  const url = new URL(`${BASE}/business/webhook/list/`);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("secret", secret);
  url.searchParams.set("event_type", "COMMENT");
  await show(await fetch(url));
} else {
  console.error(`Comando desconocido: ${command}. Usá "subscribe" o "list".`);
  process.exit(1);
}
