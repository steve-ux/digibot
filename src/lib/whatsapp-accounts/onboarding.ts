// Embedded Signup de WhatsApp (v5, con coexistencia) por sesión. Server-only.
//
// El navegador manda dos cosas que llegan en cualquier orden:
//   - el `code` del callback de FB.login (vence a los 30 s: se canjea en el acto)
//   - el evento WA_EMBEDDED_SIGNUP (FINISH / FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING / CANCEL / error)
// El backend los junta por sesión. Cuando están el token y los IDs, corre el onboarding
// una sola vez (claimSession es atómico):
//
//   1 token       GET /oauth/access_token -> token de negocio (cifrado)
//   2 ids         si no llegó el evento: GET /debug_token (granular_scopes -> target_ids) y /{waba}/phone_numbers
//   3 account     crea o actualiza la conexión por phone_number_id (reconexión = misma fila)
//   4 subscribe   POST /{waba}/subscribed_apps
//   5 register    número nuevo: POST /{phone}/register con PIN aleatorio · coexistencia: no se registra
//   6 sync        solo coexistencia, en el acto (24 h de plazo): smb_app_data state y después history,
//                 una vez cada uno (se guarda el request_id y no se reintenta solo)
//
// Cada paso deja estado y error en la conexión; el panel interno puede reintentar.

import { randomInt, randomUUID } from "node:crypto";
import { metaAppCredentials } from "../channels/config";
import { ConnectError } from "../channels/meta-connect";
import type { ConnectedAccount } from "../channels/types";
import * as graph from "./graph";
import { GraphError } from "./graph";
import { describeDisconnection } from "./notify";
import type { SignupSession, WaAccount } from "./repo";
import { getWaDeps, type WaDeps } from "./runtime";
import type { SignupProgress, StepName, StepState, Steps } from "./types";

export interface SignupContext {
  accountId: number;
  userId: number;
}

const now = () => Math.floor(Date.now() / 1000);
const isGraphId = (v: unknown): v is string => typeof v === "string" && /^\d{5,30}$/.test(v);
const asId = (v: unknown) => {
  const s = typeof v === "number" ? String(v) : v;
  return isGraphId(s) ? s : null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Si el evento no llega en este tiempo después del code, los IDs se buscan con debug_token.
export const EVENT_GRACE_SECONDS = 6;

const TAKEN = "Ese número ya está conectado a otra cuenta de DigiBot. Desconectalo de esa cuenta primero.";

// ---------- Evento WA_EMBEDDED_SIGNUP (parseo defensivo) ----------

export type SignupMessage =
  | { kind: "finish"; event: string; wabaId: string | null; phoneNumberId: string | null; businessId: string | null; coexistence: boolean }
  | { kind: "cancel"; event: string; currentStep: string | null }
  | { kind: "error"; event: string; errorMessage: string; errorCode: string | null; metaSessionId: string | null }
  | { kind: "ignore" };

const FINISH_EVENTS = new Set(["FINISH", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", "FINISH_ONLY_WABA"]);

export function parseSignupMessage(raw: unknown): SignupMessage {
  let msg: unknown = raw;
  if (typeof msg === "string") {
    try {
      msg = JSON.parse(msg);
    } catch {
      return { kind: "ignore" };
    }
  }
  if (!msg || typeof msg !== "object") return { kind: "ignore" };
  const m = msg as Record<string, unknown>;
  if (m.type !== "WA_EMBEDDED_SIGNUP") return { kind: "ignore" };
  const event = typeof m.event === "string" ? m.event : "";
  const data = (m.data && typeof m.data === "object" ? m.data : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 300) : typeof v === "number" ? String(v) : null);

  // Los errores que reporta la persona llegan como CANCEL (o ERROR) con error_message.
  if (data.error_message || event === "ERROR") {
    return {
      kind: "error",
      event,
      errorMessage: text(data.error_message) ?? "Error en el registro de Meta",
      errorCode: text(data.error_code) ?? text(data.error_id),
      metaSessionId: text(data.session_id),
    };
  }
  if (FINISH_EVENTS.has(event)) {
    const accounts = Array.isArray(data.messaging_account_ids) ? data.messaging_account_ids : [];
    return {
      kind: "finish",
      event,
      wabaId: asId(accounts[0]) ?? asId(data.waba_id),
      phoneNumberId: asId(data.phone_number_id),
      businessId: asId(data.business_id),
      coexistence:
        event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" || data.is_on_biz_app === true || data.is_on_biz_app === "true",
    };
  }
  if (event === "CANCEL") return { kind: "cancel", event, currentStep: text(data.current_step) };
  return { kind: "ignore" };
}

// ---------- Errores para la persona ----------

const STEP_ERRORS: Record<StepName, string> = {
  token: "Meta no aceptó la autorización (vence a los 30 segundos). Probá conectar de nuevo.",
  ids: "No pudimos identificar el número que elegiste. Probá conectar de nuevo.",
  account: "No pudimos guardar la conexión.",
  subscribe: "No pudimos activar la recepción de mensajes de este número.",
  register: "No pudimos registrar el número en WhatsApp.",
  sync_state: "No pudimos pedir la sincronización de contactos con la app de WhatsApp Business.",
  sync_history: "No pudimos pedir el historial de chats a la app de WhatsApp Business.",
};

function humanError(step: StepName, err: unknown) {
  if (err instanceof ConnectError) return err.message;
  if (step === "register" && err instanceof GraphError && err.code === 133005) {
    return "El número tiene un PIN de verificación en dos pasos distinto. Desactivalo en WhatsApp Manager y reintentá.";
  }
  if (err instanceof GraphError && err.userMessage) return `${STEP_ERRORS[step]} Meta dice: ${err.userMessage}`;
  return STEP_ERRORS[step];
}

const detailOf = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

function requireApp() {
  const app = metaAppCredentials();
  if (!app) throw new ConnectError("La conexión con Meta todavía no está habilitada.", 503);
  return app;
}

// ---------- Sesiones ----------

async function ownedSession(deps: WaDeps, ctx: SignupContext, sessionId: unknown) {
  const session = typeof sessionId === "string" && UUID.test(sessionId) ? await deps.repo.getSession(sessionId) : null;
  // Una sesión de otra cuenta responde igual que una que no existe.
  if (!session || session.accountId !== ctx.accountId) throw new ConnectError("La sesión de conexión no existe.", 404);
  return session;
}

export async function createSignupSession(ctx: SignupContext, opts: { reconnectId?: unknown } = {}, injected?: WaDeps) {
  const deps = injected ?? (await getWaDeps());
  let reconnectConnectionId: number | null = null;
  if (opts.reconnectId !== undefined && opts.reconnectId !== null) {
    const id = Number(opts.reconnectId);
    const account = Number.isSafeInteger(id) ? await deps.repo.getAccount(id) : null;
    if (!account || account.accountId !== ctx.accountId) throw new ConnectError("Esa conexión no existe.", 404);
    reconnectConnectionId = id;
  }
  const id = randomUUID();
  await deps.repo.createSession({ id, accountId: ctx.accountId, userId: ctx.userId || null, reconnectConnectionId });
  return { sessionId: id };
}

// Callback de FB.login: el code se canjea apenas llega.
export async function submitSignupCode(ctx: SignupContext, sessionId: unknown, code: unknown, injected?: WaDeps) {
  const deps = injected ?? (await getWaDeps());
  const session = await ownedSession(deps, ctx, sessionId);
  if (typeof code !== "string" || !code || code.length > 2000) throw new ConnectError("Falta la autorización de Meta.");
  const app = requireApp();
  // Un segundo envío del mismo code (doble click, reintento de red) no se vuelve a canjear.
  if (!(await deps.repo.claimCode(session.id))) return signupProgress(session.id, ctx, deps);

  await deps.repo.addSessionEvent(session.id, "code", { received: true });
  try {
    const res = await graph.exchangeCode(code, app);
    if (typeof res.access_token !== "string") throw new ConnectError(STEP_ERRORS.token);
    // El plazo para esperar el evento corre desde que hay token.
    await deps.repo.updateSession(session.id, { accessToken: res.access_token, codeReceivedAt: now(), currentStep: "token" });
  } catch (err) {
    await failSession(deps, session.id, "token", err);
    return signupProgress(session.id, ctx, deps);
  }
  await advanceSession(deps, session.id, { allowLookup: false });
  return signupProgress(session.id, ctx, deps);
}

// Evento WA_EMBEDDED_SIGNUP reenviado por el navegador.
export async function submitSignupEvent(ctx: SignupContext, sessionId: unknown, raw: unknown, injected?: WaDeps) {
  const deps = injected ?? (await getWaDeps());
  const session = await ownedSession(deps, ctx, sessionId);
  const parsed = parseSignupMessage(raw);
  // Se guarda lo que mandó Meta (son IDs y pasos, sin secretos), acotado.
  await deps.repo.addSessionEvent(session.id, "message", typeof raw === "string" ? raw.slice(0, 5000) : raw);

  if (parsed.kind === "finish" && session.status === "pending") {
    await deps.repo.updateSession(session.id, {
      eventType: parsed.event,
      wabaId: parsed.wabaId ?? session.wabaId,
      phoneNumberId: parsed.phoneNumberId ?? session.phoneNumberId,
      businessId: parsed.businessId ?? session.businessId,
      isCoexistence: parsed.coexistence || session.isCoexistence,
    });
    await advanceSession(deps, session.id, { allowLookup: false });
  } else if (parsed.kind === "cancel" && session.status === "pending") {
    await deps.repo.updateSession(session.id, {
      status: "cancelled",
      eventType: parsed.event,
      currentStep: parsed.currentStep,
      accessToken: null,
    });
  } else if (parsed.kind === "error" && (session.status === "pending" || session.status === "onboarding")) {
    await deps.repo.updateSession(session.id, {
      status: "failed",
      ...(session.status === "pending" ? { accessToken: null } : {}),
      eventType: parsed.event,
      errorMessage: parsed.errorMessage,
      errorCode: parsed.errorCode,
      metaSessionId: parsed.metaSessionId,
    });
  }
  return signupProgress(session.id, ctx, deps);
}

// Polling de la pantalla de progreso. Si el code llegó y el evento no, a los pocos
// segundos se buscan los IDs con debug_token.
export async function pollSignup(ctx: SignupContext, sessionId: unknown, injected?: WaDeps) {
  const deps = injected ?? (await getWaDeps());
  const session = await ownedSession(deps, ctx, sessionId);
  if (session.status === "pending" && session.accessToken && session.codeReceivedAt !== null) {
    if (now() - session.codeReceivedAt >= EVENT_GRACE_SECONDS) await advanceSession(deps, session.id, { allowLookup: true });
  }
  return signupProgress(session.id, ctx, deps);
}

async function failSession(deps: WaDeps, sessionId: string, step: StepName, err: unknown) {
  console.error(`[wa-signup] Sesión ${sessionId}, paso ${step}: ${detailOf(err)}`);
  await deps.repo.addSessionEvent(sessionId, "error", { step, detail: detailOf(err) });
  await deps.repo.updateSession(sessionId, {
    status: "failed",
    currentStep: step,
    errorMessage: humanError(step, err),
    errorCode: err instanceof GraphError && err.code !== null ? String(err.code) : null,
    accessToken: null,
  });
}

// Corre el onboarding si ya están el token y los IDs (o si se permite buscarlos).
export async function advanceSession(deps: WaDeps, sessionId: string, { allowLookup }: { allowLookup: boolean }) {
  const session = await deps.repo.getSession(sessionId);
  if (!session || session.status !== "pending" || !session.accessToken) return;
  const hasIds = Boolean(session.wabaId && session.phoneNumberId);
  if (!hasIds && !allowLookup) return;
  if (!(await deps.repo.claimSession(sessionId))) return; // ya lo está corriendo otro request
  await runOnboarding(deps, { ...session, status: "onboarding" });
}

async function lookupIds(deps: WaDeps, session: SignupSession) {
  const app = requireApp();
  const token = session.accessToken!;
  const data = await graph.debugToken(token, app);
  const wabas = new Set<string>();
  for (const g of data.granular_scopes ?? []) {
    if (g.scope === "whatsapp_business_management" || g.scope === "whatsapp_business_messaging") {
      for (const id of g.target_ids ?? []) if (isGraphId(id)) wabas.add(id);
    }
  }
  let preferred: WaAccount | null = null;
  if (session.reconnectConnectionId) preferred = await deps.repo.getAccount(session.reconnectConnectionId);
  const ordered = [...wabas].sort((a, b) => Number(b === preferred?.wabaId) - Number(a === preferred?.wabaId));
  const wabaId = session.wabaId && wabas.has(session.wabaId) ? session.wabaId : ordered[0];
  if (!wabaId) throw new ConnectError("Meta no nos dio acceso a ninguna cuenta de WhatsApp. Probá de nuevo y elegí tu número.");

  const phones = await graph.listPhoneNumbers(token, wabaId);
  const phone =
    phones.find((p) => p.id === session.phoneNumberId) ??
    phones.find((p) => p.id === preferred?.phoneNumberId) ??
    phones[0];
  if (!phone || !isGraphId(phone.id)) throw new ConnectError("No encontramos ningún número en esa cuenta de WhatsApp.");
  return { wabaId, phoneNumberId: phone.id, coexistence: phone.is_on_biz_app === true, phone };
}

async function runOnboarding(deps: WaDeps, session: SignupSession) {
  // 2. IDs
  let { wabaId, phoneNumberId } = session;
  let coexistence = session.isCoexistence;
  let phoneInfo: graph.PhoneNumberInfo | null = null;
  if (!wabaId || !phoneNumberId) {
    try {
      const found = await lookupIds(deps, session);
      ({ wabaId, phoneNumberId } = found);
      coexistence = coexistence || found.coexistence;
      phoneInfo = found.phone;
      await deps.repo.updateSession(session.id, { wabaId, phoneNumberId, isCoexistence: coexistence, currentStep: "ids" });
      await deps.repo.addSessionEvent(session.id, "step", { step: "ids", via: "debug_token", wabaId, phoneNumberId });
    } catch (err) {
      await failSession(deps, session.id, "ids", err);
      return;
    }
  }

  // 3. Cuenta
  const existing = await deps.repo.findByPhone(phoneNumberId!);
  if (existing && existing.status === "connected" && existing.health !== "disconnected" && existing.accountId !== session.accountId) {
    await failSession(deps, session.id, "account", new ConnectError(TAKEN, 409));
    return;
  }
  let connectionId: number;
  try {
    connectionId = await deps.repo.upsertAccount({
      accountId: session.accountId,
      wabaId: wabaId!,
      phoneNumberId: phoneNumberId!,
      businessId: session.businessId,
      displayPhoneNumber: phoneInfo?.display_phone_number ?? null,
      verifiedName: phoneInfo?.verified_name ?? null,
      accessToken: session.accessToken!,
      isCoexistence: coexistence,
      signupSessionId: session.id,
      connectedBy: session.userId,
      resetSync: Boolean(existing),
    });
  } catch (err) {
    await failSession(deps, session.id, "account", err);
    return;
  }
  deps.onConnectionsChanged();
  // El token ya vive (cifrado) en la conexión: se borra de la sesión.
  await deps.repo.updateSession(session.id, { connectionId, accessToken: null, currentStep: "account" });
  await recordStep(deps, connectionId, "token", { status: "ok", error: null });
  await recordStep(deps, connectionId, "ids", { status: "ok", error: null });
  await recordStep(deps, connectionId, "account", { status: "ok", error: null });

  // 4-6.
  const failure = await runSetupSteps(deps, connectionId, session.id);
  if (failure) {
    await deps.repo.updateSession(session.id, {
      status: "failed",
      currentStep: failure.step,
      errorMessage: failure.message,
      errorCode: failure.code,
    });
    return;
  }
  await deps.repo.updateSession(session.id, { status: "done", currentStep: "done" });
}

async function recordStep(deps: WaDeps, connectionId: number, step: StepName, state: Omit<StepState, "at">) {
  const account = await deps.repo.getAccount(connectionId);
  if (!account) return;
  const steps: Steps = { ...account.steps, [step]: { ...state, at: now() } };
  await deps.repo.updateAccount(connectionId, {
    steps,
    ...(state.status === "error" ? { lastError: `${step}: ${state.error}`, lastErrorAt: now() } : {}),
  });
}

type StepFailure = { step: StepName; message: string; code: string | null };

async function stepCall(
  deps: WaDeps,
  connectionId: number,
  sessionId: string | null,
  step: StepName,
  fn: () => Promise<void>
): Promise<StepFailure | null> {
  try {
    await fn();
    await recordStep(deps, connectionId, step, { status: "ok", error: null });
    if (sessionId) await deps.repo.updateSession(sessionId, { currentStep: step });
    return null;
  } catch (err) {
    const message = humanError(step, err);
    console.error(`[wa-signup] Conexión ${connectionId}, paso ${step}: ${detailOf(err)}`);
    await recordStep(deps, connectionId, step, { status: "error", error: `${message} (${detailOf(err)})` });
    if (sessionId) await deps.repo.addSessionEvent(sessionId, "error", { step, detail: detailOf(err) });
    return { step, message, code: err instanceof GraphError && err.code !== null ? String(err.code) : null };
  }
}

// Pasos 4-6 sobre una conexión ya guardada. Devuelve el primer fallo bloqueante (o null).
async function runSetupSteps(deps: WaDeps, connectionId: number, sessionId: string | null): Promise<StepFailure | null> {
  let account = await deps.repo.getAccount(connectionId);
  if (!account) return { step: "account", message: STEP_ERRORS.account, code: null };

  const subscribe = await subscribeStep(deps, account, sessionId);
  let failure: StepFailure | null = subscribe;

  if (account.isCoexistence) {
    // Coexistencia: el número sigue en la app; no se registra.
    await recordStep(deps, connectionId, "register", { status: "skipped", error: null });
    account = (await deps.repo.getAccount(connectionId))!;
    // La sincronización no bloquea: los mensajes nuevos llegan igual. El error queda para el panel.
    await syncStep(deps, account, "sync_state", sessionId);
    account = (await deps.repo.getAccount(connectionId))!;
    await syncStep(deps, account, "sync_history", sessionId);
  } else {
    failure = (await registerStep(deps, account, sessionId)) ?? failure;
  }

  // Número visible y nombre verificado (para Canales); si falla, no importa.
  account = (await deps.repo.getAccount(connectionId))!;
  try {
    const info = await graph.fetchPhoneNumber(account.accessToken, account.phoneNumberId, connectionId);
    await deps.repo.updateAccount(connectionId, {
      displayPhoneNumber: info.display_phone_number ?? account.displayPhoneNumber,
      verifiedName: info.verified_name ?? account.verifiedName,
    });
  } catch {
    // ya quedó logueado
  }
  deps.onConnectionsChanged();
  return failure;
}

function subscribeStep(deps: WaDeps, account: WaAccount, sessionId: string | null) {
  return stepCall(deps, account.id, sessionId, "subscribe", async () => {
    await graph.subscribeApp(account.accessToken, account.wabaId, account.id);
  });
}

function registerStep(deps: WaDeps, account: WaAccount, sessionId: string | null) {
  return stepCall(deps, account.id, sessionId, "register", async () => {
    // Si ya se registró con un PIN guardado, se reusa (cambiarlo rompería el registro anterior).
    const pin = account.pin ?? String(randomInt(0, 1_000_000)).padStart(6, "0");
    await graph.registerNumber(account.accessToken, account.phoneNumberId, pin, account.id);
    await deps.repo.updateAccount(account.id, { pin });
  });
}

const SYNC_TYPE: Record<"sync_state" | "sync_history", graph.SmbSyncType> = {
  sync_state: "smb_app_state_sync",
  sync_history: "history",
};

// Una sola vez cada uno: con request_id guardado no se vuelve a pedir.
function syncStep(deps: WaDeps, account: WaAccount, step: "sync_state" | "sync_history", sessionId: string | null) {
  const already = step === "sync_state" ? account.syncStateRequestId : account.historyRequestId;
  if (already) return Promise.resolve(null);
  return stepCall(deps, account.id, sessionId, step, async () => {
    try {
      const res = await graph.requestSmbSync(account.accessToken, account.phoneNumberId, SYNC_TYPE[step], account.id);
      const requestId = typeof res.request_id === "string" && res.request_id ? res.request_id : "sin-request-id";
      await deps.repo.updateAccount(
        account.id,
        step === "sync_state"
          ? { syncStateRequestId: requestId }
          : { historyRequestId: requestId, historyStatus: "pending", historyProgress: 0 }
      );
    } catch (err) {
      if (step === "sync_history") await deps.repo.updateAccount(account.id, { historyStatus: "error" });
      throw err;
    }
  });
}

// ---------- Reintentos desde el panel interno ----------

export type RetryAction = "subscribe" | "register" | "sync_state" | "sync_history";

export async function retryStep(connectionId: number, action: RetryAction, injected?: WaDeps) {
  const deps = injected ?? (await getWaDeps());
  const account = await deps.repo.getAccount(connectionId);
  if (!account || account.status !== "connected") throw new ConnectError("La conexión no existe o está desvinculada.", 404);
  if (account.health === "disconnected") throw new ConnectError("La conexión está desconectada: el cliente tiene que reconectarla.", 409);

  let failure: StepFailure | null;
  if (action === "subscribe") failure = await subscribeStep(deps, account, null);
  else if (action === "register") {
    if (account.isCoexistence) throw new ConnectError("Los números en coexistencia no se registran.", 400);
    failure = await registerStep(deps, account, null);
  } else {
    if (!account.isCoexistence) throw new ConnectError("La sincronización solo aplica a números en coexistencia.", 400);
    const requestId = action === "sync_state" ? account.syncStateRequestId : account.historyRequestId;
    if (requestId) throw new ConnectError(`Ya se pidió una vez (request_id ${requestId}). Meta no permite repetirlo.`, 409);
    failure = await syncStep(deps, account, action, null);
  }
  deps.onConnectionsChanged();
  if (failure) throw new ConnectError(failure.message, 502);
}

// ---------- Vista ----------

export async function signupProgress(sessionId: string, ctx: SignupContext, deps: WaDeps): Promise<SignupProgress> {
  const session = await ownedSession(deps, ctx, sessionId);
  const account = session.connectionId ? await deps.repo.getAccount(session.connectionId) : null;
  const phone = account
    ? { title: account.displayPhoneNumber ?? account.phoneNumberId, subtitle: account.verifiedName }
    : null;
  const base = {
    sessionId: session.id,
    coexistence: account?.isCoexistence ?? session.isCoexistence,
    historyDeclined: account?.historyStatus === "declined",
    phone,
    progress: null as number | null,
    error: null as SignupProgress["error"],
  };
  switch (session.status) {
    case "pending":
      return { ...base, phase: "connecting" };
    case "onboarding":
      return { ...base, phase: "configuring" };
    case "cancelled":
      return { ...base, phase: "cancelled" };
    case "failed":
      return {
        ...base,
        phase: "failed",
        error: {
          message: session.errorMessage ?? "No se pudo completar la conexión.",
          code: session.errorCode,
          metaSessionId: session.metaSessionId,
        },
      };
    case "done": {
      const syncing =
        account?.isCoexistence && (account.historyStatus === "pending" || account.historyStatus === "in_progress");
      return syncing ? { ...base, phase: "syncing", progress: account!.historyProgress } : { ...base, phase: "done" };
    }
  }
}

// Tarjeta de Canales para una conexión de WhatsApp.
export function whatsappAccountView(a: WaAccount): ConnectedAccount {
  const syncing = a.isCoexistence && (a.historyStatus === "pending" || a.historyStatus === "in_progress");
  return {
    key: `wa:${a.id}`,
    provider: "whatsapp",
    title: a.displayPhoneNumber ?? a.phoneNumberId,
    subtitle: a.verifiedName,
    pictureUrl: null,
    connectedAt: a.connectedAt,
    expiresAt: null,
    fromEnv: false,
    health: a.health,
    healthMessage:
      a.health === "disconnected"
        ? describeDisconnection(a.disconnectionInfo)
        : a.health === "needs_attention"
          ? "Meta rechazó una operación por permisos. Si sigue, reconectá el número."
          : null,
    coexistence: a.isCoexistence,
    syncProgress: syncing ? a.historyProgress : null,
  };
}
