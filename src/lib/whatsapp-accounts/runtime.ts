// Dependencias de las cuentas de WhatsApp (repo, avisos). Server-only.
// En producción: MySQL + avisos reales. Los tests las reemplazan con setWaDeps().

import { resetWhatsAppConnectionsCache } from "../whatsapp-connections";
import type { WaNotifier } from "./notify";
import type { WaRepo } from "./repo";

export interface WaDeps {
  repo: WaRepo;
  notifier: WaNotifier;
  // Después de cambiar la salud de una conexión (los envíos la leen de un cache)
  onConnectionsChanged: () => void;
}

let override: WaDeps | null = null;
let defaults: WaDeps | null = null;

export async function getWaDeps(): Promise<WaDeps> {
  if (override) return override;
  if (!defaults) {
    const [{ getMySqlWaRepo }, { mysqlNotifier }] = await Promise.all([import("./repo-mysql"), import("./notify")]);
    defaults = { repo: getMySqlWaRepo(), notifier: mysqlNotifier, onConnectionsChanged: resetWhatsAppConnectionsCache };
  }
  return defaults;
}

// Solo para tests.
export function setWaDeps(next: WaDeps | null) {
  override = next;
}
