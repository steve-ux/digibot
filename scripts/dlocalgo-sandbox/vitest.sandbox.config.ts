// Corre las pruebas de integración contra el SANDBOX de dLocal Go y la base de .env.local.
// npx vitest run --config scripts/dlocalgo-sandbox/vitest.sandbox.config.ts
import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  test: {
    environment: "node",
    root: path.resolve(__dirname, "../.."),
    include: ["scripts/dlocalgo-sandbox/**/*.sandbox.ts"],
    env: loadEnv("development", path.resolve(__dirname, "../.."), ""),
    testTimeout: 60_000,
  },
});
