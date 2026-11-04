// ¿Esta cuenta tiene WhatsApp conectado? Server-only.
// Cada cuenta conecta el suyo desde Canales (Embedded Signup).

import { getConnectionForAccount } from "../whatsapp-connections";

export async function accountHasWhatsApp(accountId: number) {
  return (await getConnectionForAccount(accountId).catch(() => null)) !== null;
}

export const NO_WHATSAPP_MESSAGE = "Esta cuenta todavía no tiene WhatsApp conectado. Conectalo desde Canales.";
