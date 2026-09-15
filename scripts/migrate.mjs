#!/usr/bin/env node
// Aplica las migraciones de db/migrations/*.sql contra la base configurada en
// .env.local (o .env) y, la primera vez, migra la conexión de WhatsApp actual
// (WHATSAPP_WABA_ID / WHATSAPP_ACCESS_TOKEN) a la base de datos.
//
// Uso: node scripts/migrate.mjs

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  const content = readFileSync(file, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(".env.local"));
loadEnvFile(path.resolve(".env"));

function encryptSecret(plain, keyHex) {
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

async function main() {
  const { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD, TOKEN_ENCRYPTION_KEY } = process.env;

  if (!DB_HOST || !DB_DATABASE || !DB_USERNAME) {
    console.error(
      "Faltan DB_HOST / DB_DATABASE / DB_USERNAME en .env.local. Completalos antes de migrar."
    );
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT || 3306),
    database: DB_DATABASE,
    user: DB_USERNAME,
    password: DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    const migrationsDir = path.resolve("db/migrations");
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      console.log(`Aplicando ${file}...`);
      const sql = readFileSync(path.join(migrationsDir, file), "utf8");
      await connection.query(sql);
    }

    const [[{ count }]] = await connection.query(
      "SELECT COUNT(*) AS count FROM web_whatsapp_connections"
    );

    if (count > 0) {
      console.log("Ya existe al menos una conexión de WhatsApp en la base. No se migra nada más.");
      return;
    }

    if (!process.env.WHATSAPP_WABA_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
      console.log(
        "No hay WHATSAPP_WABA_ID/WHATSAPP_ACCESS_TOKEN en .env.local para migrar. Tablas creadas, sin datos."
      );
      return;
    }

    if (!TOKEN_ENCRYPTION_KEY || TOKEN_ENCRYPTION_KEY.length !== 64) {
      console.error(
        "Falta TOKEN_ENCRYPTION_KEY (hex de 64 caracteres) para cifrar el token antes de guardarlo."
      );
      process.exit(1);
    }

    console.log("Migrando la conexión de WhatsApp existente a la base de datos...");
    const [clientResult] = await connection.query(
      "INSERT INTO web_clients (name, status) VALUES (?, 'active')",
      ["DigiBot (interno)"]
    );
    const encToken = encryptSecret(process.env.WHATSAPP_ACCESS_TOKEN, TOKEN_ENCRYPTION_KEY);
    await connection.query(
      `INSERT INTO web_whatsapp_connections (client_id, waba_id, access_token_enc, status, connected_at)
       VALUES (?, ?, ?, 'connected', NOW())`,
      [clientResult.insertId, process.env.WHATSAPP_WABA_ID, encToken]
    );
    console.log("Listo: la conexión interna ya vive en la base de datos.");
  } finally {
    await connection.end();
  }

  console.log("Migración completa.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
