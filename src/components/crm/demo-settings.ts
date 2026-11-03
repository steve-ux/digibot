// Etiquetas y atributos del modo demo: una sola instancia en memoria del
// navegador, compartida entre Configuración y la bandeja (se pierde al recargar).

import { buildDemoSettings } from "@/lib/crm/demo-data";
import type { MemorySettingsRepo } from "@/lib/crm/settings-repo";

let instance: { accountId: number; repo: Promise<MemorySettingsRepo> } | null = null;

export function getDemoSettings(accountId: number): Promise<MemorySettingsRepo> {
  if (!instance || instance.accountId !== accountId) {
    instance = { accountId, repo: buildDemoSettings(accountId) };
  }
  return instance.repo;
}
