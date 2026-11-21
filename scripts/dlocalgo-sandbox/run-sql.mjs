// Ejecuta un .sql contra la base de .env.local. Uso: node scripts/dlocalgo-sandbox/run-sql.mjs <archivo.sql>
import { readFileSync, existsSync } from "node:fs";
import mysql from "mysql2/promise";
for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const l of readFileSync(f, "utf8").split("\n")) {
    const t = l.trim(); const i = t.indexOf("=");
    if (t && t[0] !== "#" && i > 0 && !(t.slice(0, i) in process.env)) process.env[t.slice(0, i)] = t.slice(i + 1).trim();
  }
}
const c = await mysql.createConnection({ host: process.env.DB_HOST, port: +(process.env.DB_PORT || 3306), database: process.env.DB_DATABASE,
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, multipleStatements: true });
const [res] = await c.query(readFileSync(process.argv[2], "utf8"));
console.log(Array.isArray(res) ? res.map((r) => r.affectedRows ?? r) : res.affectedRows);
await c.end();
