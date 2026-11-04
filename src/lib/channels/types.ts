// Tipos de Canales que viajan al navegador. Sin imports de servidor.

import type { ChannelId } from "../crm/channels";

// Lo que se conecta (un proveedor puede alimentar más de un canal de la bandeja).
export type ProviderId = "whatsapp" | "facebook" | "instagram" | "threads";

export const PROVIDER_CHANNELS: Record<ProviderId, ChannelId[]> = {
  whatsapp: ["wa"],
  facebook: ["fb", "fbc"],
  instagram: ["ig", "igc"],
  threads: ["th"],
};

// Cuenta conectada que se muestra en la tarjeta.
export interface ConnectedAccount {
  // "wa:12" / "social:5" / "env:fb" — id para desconectar
  key: string;
  provider: ProviderId;
  // +54 9 261 699-8830 · Óptica Sol · @opticasol
  title: string;
  subtitle: string | null;
  pictureUrl: string | null;
  connectedAt: number | null;
  // Vence (Threads) — se renueva solo
  expiresAt: number | null;
  // Configurada con variables del servidor: no se desconecta desde el panel
  fromEnv: boolean;
}

export interface ProviderAvailability {
  available: boolean;
  // Por qué no se puede conectar todavía (texto para la persona)
  reason: string | null;
}

// Datos públicos para el SDK de Facebook (nada secreto).
export interface MetaClientConfig {
  appId: string | null;
  graphVersion: string;
  whatsappConfigId: string | null;
  loginConfigId: string | null;
}

export interface ChannelsOverview {
  accounts: ConnectedAccount[];
  availability: Record<ProviderId, ProviderAvailability>;
  meta: MetaClientConfig;
}

// Página de Facebook para elegir después del login (sin tokens: esos quedan sellados).
export interface PageChoice {
  id: string;
  name: string;
  pictureUrl: string | null;
  instagram: { id: string; username: string; pictureUrl: string | null } | null;
  // Ya conectada en esta cuenta / en otra cuenta del sistema
  connectedHere: { facebook: boolean; instagram: boolean };
  takenElsewhere: { facebook: boolean; instagram: boolean };
}
