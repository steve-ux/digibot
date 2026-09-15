// Pool de conexión a la base MySQL compartida de la VPS ("digibot_data").
// Server-only: nunca importar este módulo desde código que corra en el navegador.

import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;

export function isDbConfigured() {
  return Boolean(process.env.DB_HOST && process.env.DB_DATABASE && process.env.DB_USERNAME);
}

export function getPool() {
  if (!isDbConfigured()) {
    throw new Error(
      "Faltan las variables de conexión a la base de datos (DB_HOST, DB_DATABASE, DB_USERNAME)."
    );
  }

  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      database: process.env.DB_DATABASE,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      waitForConnections: true,
      connectionLimit: 5,
      dateStrings: true,
    });
  }

  return pool;
}
