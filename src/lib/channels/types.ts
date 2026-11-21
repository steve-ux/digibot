// Tipos de Canales que viajan al navegador. Sin imports de servidor.

import type { ChannelId } from "../crm/channels";

// Lo que se conecta (un proveedor puede alimentar más de un canal de la bandeja).
export type ProviderId = "whatsapp" | "facebook" | "instagram" | "threads" | "tiktok";

export const PROVIDER_CHANNELS: Record<ProviderId, ChannelId[]> = {
  whatsapp: ["wa"],
  facebook: ["fb", "fbc"],
  instagram: ["ig", "igc"],
  threads: ["th"],
  tiktok: ["ttc"],
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
  // Solo WhatsApp: si la conexión funciona y por qué no
  health?: "active" | "needs_attention" | "disconnected";
  healthMessage?: string | null;
  coexistence?: boolean;
  // Sincronización del historial con la app de WhatsApp Business (0-100), mientras corre
  syncProgress?: number | null;
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
  // extras.version del Embedded Signup (v5)
  whatsappEsVersion: string;
  // Facebook Login for Business: páginas (Messenger + comentarios)
  loginConfigId: string | null;
  // Facebook Login for Business: Instagram API with Unified Login
  instagramConfigId: string | null;
}

export interface ChannelsOverview {
  accounts: ConnectedAccount[];
  availability: Record<ProviderId, ProviderAvailability>;
  meta: MetaClientConfig;
}

// Página de Facebook o cuenta de Instagram para elegir después del login
// (sin tokens: esos quedan sellados).
export interface AssetChoice {
  id: string;
  // Nombre de la página / @usuario
  name: string;
  pictureUrl: string | null;
  // Ya conectada en esta cuenta / en otra cuenta del sistema
  connectedHere: boolean;
  takenElsewhere: boolean;
}

export type PageChoice = AssetChoice;
export type InstagramChoice = AssetChoice;
