// Panel interno "Cuentas de WhatsApp" (solo superadmins). Server-only.
// Nunca devuelve tokens ni PIN.

import { ConnectError } from "../channels/meta-connect";
import { verifyAccountToken } from "./health";
import { retryStep, type RetryAction } from "./onboarding";
import type { WaAccount } from "./repo";
import { getWaDeps, type WaDeps } from "./runtime";
import type { SignupEventRow, WaAccountRow } from "./types";

export function toPanelRow(a: WaAccount, accountName: string): WaAccountRow {
  return {
    id: a.id,
    accountId: a.accountId,
    accountName,
    phone: a.displayPhoneNumber ?? a.phoneNumberId,
    verifiedName: a.verifiedName,
    wabaId: a.wabaId,
    phoneNumberId: a.phoneNumberId,
    coexistence: a.isCoexistence,
    status: a.status,
    health: a.health,
    disconnection: a.disconnectionInfo,
    historyStatus: a.historyStatus,
    historyProgress: a.historyProgress,
    syncStateRequested: Boolean(a.syncStateRequestId),
    historyRequested: Boolean(a.historyRequestId),
    steps: a.steps,
    lastError: a.lastError,
    lastErrorAt: a.lastErrorAt,
    healthCheckedAt: a.healthCheckedAt,
    signupSessionId: a.signupSessionId,
    connectedAt: a.connectedAt,
  };
}

export async function listPanelRows(names: Map<number, string>, injected?: WaDeps) {
  const deps = injected ?? (await getWaDeps());
  return (await deps.repo.listAll()).map((a) => toPanelRow(a, names.get(a.accountId) ?? `Cuenta ${a.accountId}`));
}

export type PanelAction = RetryAction | "verify";
export const PANEL_ACTIONS: PanelAction[] = ["subscribe", "register", "sync_state", "sync_history", "verify"];

export async function runPanelAction(connectionId: number, action: unknown, injected?: WaDeps) {
  if (typeof action !== "string" || !PANEL_ACTIONS.includes(action as PanelAction)) {
    throw new ConnectError("Acción inválida.", 400);
  }
  const deps = injected ?? (await getWaDeps());
  if (action === "verify") {
    const account = await deps.repo.getAccount(connectionId);
    if (!account || account.status !== "connected") throw new ConnectError("La conexión no existe o está desvinculada.", 404);
    return { health: await verifyAccountToken(deps, account) };
  }
  await retryStep(connectionId, action as RetryAction, deps);
  return { health: (await deps.repo.getAccount(connectionId))?.health ?? null };
}

// Eventos de la sesión de signup con la que se conectó el número.
export async function connectionEvents(connectionId: number, injected?: WaDeps): Promise<SignupEventRow[]> {
  const deps = injected ?? (await getWaDeps());
  const account = await deps.repo.getAccount(connectionId);
  if (!account) throw new ConnectError("La conexión no existe.", 404);
  return account.signupSessionId ? deps.repo.listSessionEvents(account.signupSessionId) : [];
}
