// ¿Esta cuenta tiene WhatsApp conectado? Server-only.
// Hoy hay una sola conexión (la de DigiBot) en web_whatsapp_connections; con el
// Embedded Signup (etapa de Canales) cada cuenta va a tener la suya. Mientras
// tanto, las plantillas solo se ven en la cuenta dueña de esa conexión.

import { getDefaultConnection } from "../whatsapp-connections";

export async function accountHasWhatsApp(accountId: number) {
  const connection = await getDefaultConnection().catch(() => null);
  return Boolean(connection && connection.clientId === accountId);
}

export const NO_WHATSAPP_MESSAGE = "Esta cuenta todavía no tiene WhatsApp conectado. Conectalo desde Canales.";
