// Tipos de las cuentas de WhatsApp conectadas con Embedded Signup. Sin imports de
// servidor: algunos viajan al navegador (progreso del signup, panel interno).

export type WaHealth = "active" | "needs_attention" | "disconnected";

// Pasos del onboarding, en orden. Cada uno deja estado y error.
export const ONBOARDING_STEPS = ["token", "ids", "account", "subscribe", "register", "sync_state", "sync_history"] as const;
export type StepName = (typeof ONBOARDING_STEPS)[number];
export type StepStatus = "ok" | "error" | "skipped";
export interface StepState {
  status: StepStatus;
  error: string | null;
  at: number;
}
export type Steps = Partial<Record<StepName, StepState>>;

export type HistoryStatus = "none" | "pending" | "in_progress" | "done" | "declined" | "error";

export type DisconnectionSource = "webhook" | "token_check" | "graph_error";
export interface DisconnectionInfo {
  // Evento de Meta que la causó (PARTNER_REMOVED, ACCOUNT_OFFBOARDED), si vino por webhook
  event?: string | null;
  // Lo que dice Meta (PARTNER_REMOVED, ACCOUNT_OFFBOARDED, TOKEN_INVALID…)
  reason: string | null;
  // Quién la cortó, si Meta lo dice (USER, BUSINESS…)
  initiatedBy: string | null;
  source: DisconnectionSource;
  at: number;
}

export type SessionStatus = "pending" | "onboarding" | "done" | "failed" | "cancelled";

// Lo que ve la persona en la pantalla de progreso.
export type SignupPhase = "connecting" | "configuring" | "syncing" | "done" | "failed" | "cancelled";

export interface SignupProgress {
  sessionId: string;
  phase: SignupPhase;
  // 0-100 mientras se sincroniza el historial (coexistencia)
  progress: number | null;
  coexistence: boolean;
  // El cliente no quiso compartir el historial (no es un error)
  historyDeclined: boolean;
  phone: { title: string; subtitle: string | null } | null;
  error: { message: string; code: string | null; metaSessionId: string | null } | null;
}

// Fila del panel interno "Cuentas de WhatsApp" (sin tokens ni PIN).
export interface WaAccountRow {
  id: number;
  accountId: number;
  accountName: string;
  phone: string;
  verifiedName: string | null;
  wabaId: string;
  phoneNumberId: string;
  coexistence: boolean;
  status: string;
  health: WaHealth;
  disconnection: DisconnectionInfo | null;
  historyStatus: HistoryStatus;
  historyProgress: number;
  // Ya se pidió (Meta permite una sola vez cada una)
  syncStateRequested: boolean;
  historyRequested: boolean;
  steps: Steps;
  lastError: string | null;
  lastErrorAt: number | null;
  healthCheckedAt: number | null;
  signupSessionId: string | null;
  connectedAt: number | null;
}

export interface SignupEventRow {
  id: number;
  kind: string;
  payload: unknown;
  at: number;
}
