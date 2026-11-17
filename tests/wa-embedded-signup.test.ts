import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WhatsAppConnection } from "@/lib/whatsapp-connections";

// Las conexiones que ve el envío salen de la base: acá, de una lista controlada por el test.
const connections = vi.hoisted(() => ({ list: [] as WhatsAppConnection[] }));
vi.mock("@/lib/whatsapp-connections", () => ({
  listWhatsAppConnections: async () => connections.list,
  resetWhatsAppConnectionsCache: () => undefined,
  defaultAccountId: () => 1,
  getConnectionForAccount: async (accountId: number) => connections.list.find((c) => c.clientId === accountId) ?? null,
  getConnectionByPhoneNumberId: async (id: string) => connections.list.find((c) => c.phoneNumberId === id) ?? null,
  disconnectedPhoneNumberIds: async () => new Set<string>(),
  withChannelHealth: async (_a: number, list: unknown[]) => list,
}));

import { POST as webhookPOST } from "@/app/webhooks/whatsapp/route";
import { channelsOverview } from "@/lib/channels/overview";
import { MemoryChannelsRepo } from "@/lib/channels/repo";
import { conversationFor } from "@/lib/crm/api-auth";
import type { CrmUser } from "@/lib/crm/session";
import { graphRequest, MetaApiError, MetaConfigError, sendWhatsAppMessage } from "@/lib/meta-whatsapp";
import { MemoryInboxStore } from "@/lib/wa-inbox/memory-store";
import { setInboxStore } from "@/lib/wa-inbox/store";
import { BIZ_APP_ONLY_TEXT } from "@/lib/wa-inbox/webhook";
import { reportTokenError, runHealthSweep } from "@/lib/whatsapp-accounts/health";
import {
  createSignupSession,
  parseSignupMessage,
  pollSignup,
  retryStep,
  submitSignupCode,
  submitSignupEvent,
} from "@/lib/whatsapp-accounts/onboarding";
import type { MemoryWaRepo } from "@/lib/whatsapp-accounts/repo";
import { setWaDeps, type WaDeps } from "@/lib/whatsapp-accounts/runtime";
import { processWebhookJobs } from "@/lib/whatsapp-accounts/webhook-events";
import { CUSTOMER_WA_ID, envelope, PHONE_NUMBER_ID } from "./helpers/payloads";
import {
  accountUpdate,
  cancelEvent,
  coexistenceEvent,
  echo,
  errorEvent,
  fakeDeps,
  finishEvent,
  historyChunk,
  historyDeclined,
  historyMessage,
  META_SESSION_ID,
  mockGraph,
  ONBOARDING_ROUTES,
  stateSync,
  tokenOk,
  WABA_ID,
  type Call,
  type Route,
} from "./helpers/wa-signup";

const APP_SECRET = "secreto";
const CTX = { accountId: 1, userId: 7 };
const OTHER = { accountId: 2, userId: 8 };

let repo: MemoryWaRepo;
let notified: ReturnType<typeof fakeDeps>["notified"];
let deps: WaDeps;
let inbox: MemoryInboxStore;

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("META_APP_ID", "111");
  vi.stubEnv("META_APP_SECRET", APP_SECRET);
  vi.stubEnv("META_ES_CONFIG_ID", "cfg-es");
  vi.stubEnv("META_GRAPH_API_VERSION", "v23.0");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  ({ repo, notified, deps } = fakeDeps());
  setWaDeps(deps);
  inbox = new MemoryInboxStore();
  setInboxStore(inbox);
  connections.list = [];
});

afterEach(() => {
  setWaDeps(null);
  setInboxStore(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const count = (calls: Call[], re: RegExp) => calls.filter((c) => re.test(`${c.method} ${c.url}`)).length;

async function newSession(ctx = CTX, reconnectId?: number) {
  return (await createSignupSession(ctx, { reconnectId }, deps)).sessionId;
}

// Conecta un número normal (code + FINISH) y devuelve la conexión.
async function connectNumber(routes: Route[] = ONBOARDING_ROUTES, event = finishEvent()) {
  const calls = mockGraph(routes);
  const id = await newSession();
  await submitSignupCode(CTX, id, "codigo-secreto", deps);
  const progress = await submitSignupEvent(CTX, id, event, deps);
  return { calls, id, progress, account: repo.accounts[0] };
}

function signed(payload: unknown) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", APP_SECRET).update(body).digest("hex");
  return new Request("https://digibotlatam.com/webhooks/whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": `sha256=${signature}` },
    body,
  });
}

// ---------------------------------------------------------------------------

describe("evento WA_EMBEDDED_SIGNUP (parseo defensivo)", () => {
  it("entiende FINISH, coexistencia, CANCEL y errores; ignora lo demás", () => {
    expect(parseSignupMessage(finishEvent())).toMatchObject({ kind: "finish", wabaId: WABA_ID, phoneNumberId: PHONE_NUMBER_ID, coexistence: false });
    expect(parseSignupMessage(JSON.stringify(coexistenceEvent()))).toMatchObject({ kind: "finish", wabaId: WABA_ID, coexistence: true });
    expect(parseSignupMessage(cancelEvent())).toEqual({ kind: "cancel", event: "CANCEL", currentStep: "PHONE_NUMBER_SETUP" });
    expect(parseSignupMessage(errorEvent())).toMatchObject({ kind: "error", metaSessionId: META_SESSION_ID, errorCode: "524126980791429" });
    expect(parseSignupMessage({ type: "OTRA_COSA" })).toEqual({ kind: "ignore" });
    expect(parseSignupMessage("no es json")).toEqual({ kind: "ignore" });
    // IDs que no son de Graph no se aceptan
    expect(parseSignupMessage(finishEvent("FINISH", { waba_id: "<script>", phone_number_id: 123 }))).toMatchObject({ wabaId: null, phoneNumberId: null });
  });
});

describe("onboarding", () => {
  it("code y después FINISH: token, cuenta, suscripción y registro con PIN de 6 dígitos", async () => {
    const { calls, id, progress, account } = await connectNumber();
    expect(progress.phase).toBe("done");
    expect(progress.phone).toEqual({ title: "+54 9 261 277-1419", subtitle: "Óptica Sol" });
    expect(account).toMatchObject({ accountId: 1, wabaId: WABA_ID, phoneNumberId: PHONE_NUMBER_ID, accessToken: "tok-negocio", health: "active", isCoexistence: false });
    expect(account.pin).toMatch(/^\d{6}$/);
    expect(JSON.parse(calls.find((c) => c.url.includes("/register"))!.body!)).toEqual({ messaging_product: "whatsapp", pin: account.pin });
    expect(count(calls, /subscribed_apps/)).toBe(1);
    expect(count(calls, /smb_app_data/)).toBe(0);
    expect(account.steps).toMatchObject({ token: { status: "ok" }, subscribe: { status: "ok" }, register: { status: "ok" } });
    // El token deja la sesión; ni el code ni el token quedan en los eventos.
    expect(repo.sessions[0]).toMatchObject({ id, status: "done", accessToken: null, connectionId: account.id });
    expect(JSON.stringify(repo.events)).not.toMatch(/codigo-secreto|tok-negocio/);
    // El code se canjeó con el secreto de la app, server-to-server.
    expect(calls[0].url).toContain("client_secret=secreto");
  });

  it("FINISH y después code: mismo resultado", async () => {
    const calls = mockGraph(ONBOARDING_ROUTES);
    const id = await newSession();
    expect((await submitSignupEvent(CTX, id, finishEvent(), deps)).phase).toBe("connecting");
    expect(calls).toHaveLength(0); // sin token todavía no se llama a Meta
    const progress = await submitSignupCode(CTX, id, "codigo-secreto", deps);
    expect(progress.phase).toBe("done");
    expect(repo.accounts).toHaveLength(1);
    expect(count(calls, /register/)).toBe(1);
  });

  it("el onboarding corre una sola vez aunque el code y el evento lleguen a la vez", async () => {
    const calls = mockGraph(ONBOARDING_ROUTES);
    const id = await newSession();
    await submitSignupEvent(CTX, id, finishEvent(), deps);
    await Promise.all([submitSignupCode(CTX, id, "codigo-secreto", deps), submitSignupCode(CTX, id, "codigo-secreto", deps)]);
    await submitSignupEvent(CTX, id, finishEvent(), deps);
    expect(count(calls, /oauth\/access_token/)).toBe(1);
    expect(count(calls, /subscribed_apps/)).toBe(1);
  });

  it("coexistencia: no registra y pide smb_app_data dos veces, una de cada tipo", async () => {
    const { calls, progress, account } = await connectNumber(ONBOARDING_ROUTES, coexistenceEvent());
    expect(count(calls, /\/register/)).toBe(0);
    const syncs = calls.filter((c) => c.url.includes("/smb_app_data")).map((c) => JSON.parse(c.body!).sync_type);
    expect(syncs).toEqual(["smb_app_state_sync", "history"]);
    expect(account).toMatchObject({ isCoexistence: true, syncStateRequestId: "req-123", historyRequestId: "req-123", historyStatus: "pending" });
    expect(account.steps.register?.status).toBe("skipped");
    expect(progress).toMatchObject({ phase: "syncing", progress: 0, coexistence: true });

    // No se vuelve a pedir: ni solo ni desde el panel.
    await expect(retryStep(account.id, "sync_history", deps)).rejects.toMatchObject({ httpStatus: 409 });
    await expect(retryStep(account.id, "register", deps)).rejects.toMatchObject({ httpStatus: 400 });
    expect(count(calls, /smb_app_data/)).toBe(2);
  });

  it("sesión sin evento: a los pocos segundos saca los IDs con debug_token", async () => {
    const calls = mockGraph(ONBOARDING_ROUTES);
    const id = await newSession();
    await submitSignupCode(CTX, id, "codigo-secreto", deps);
    expect((await pollSignup(CTX, id, deps)).phase).toBe("connecting"); // todavía espera el evento
    repo.sessions[0].codeReceivedAt! -= 10;
    const progress = await pollSignup(CTX, id, deps);
    expect(progress.phase).toBe("done");
    expect(count(calls, /debug_token/)).toBe(1);
    expect(count(calls, /phone_numbers/)).toBe(1);
    expect(repo.accounts[0]).toMatchObject({ wabaId: WABA_ID, phoneNumberId: PHONE_NUMBER_ID });
  });

  it("CANCEL y errores de Meta: estado claro con el session_id de Meta", async () => {
    mockGraph(ONBOARDING_ROUTES);
    const a = await newSession();
    expect((await submitSignupEvent(CTX, a, cancelEvent(), deps)).phase).toBe("cancelled");
    const b = await newSession();
    const failed = await submitSignupEvent(CTX, b, errorEvent(), deps);
    expect(failed).toMatchObject({ phase: "failed", error: { metaSessionId: META_SESSION_ID } });
    expect(failed.error!.message).toContain("verified name");
  });

  it("si Meta rechaza el code, falla en el paso del token con un mensaje en castellano", async () => {
    mockGraph([[/oauth\/access_token/, { error: { message: "This authorization code has expired.", code: 100 } }, 400]]);
    const id = await newSession();
    const progress = await submitSignupCode(CTX, id, "viejo", deps);
    expect(progress).toMatchObject({ phase: "failed", error: { code: "100" } });
    expect(progress.error!.message).toContain("30 segundos");
    expect(repo.accounts).toHaveLength(0);
  });

  it("un número conectado en otra cuenta no se roba", async () => {
    await connectNumber();
    const id = await newSession(OTHER);
    await submitSignupEvent(OTHER, id, finishEvent(), deps);
    const progress = await submitSignupCode(OTHER, id, "otro-code", deps);
    expect(progress.phase).toBe("failed");
    expect(progress.error!.message).toContain("otra cuenta");
    expect(repo.accounts).toHaveLength(1);
    expect(repo.accounts[0].accountId).toBe(1);
  });

  it("un paso que falla queda con error y se puede reintentar desde el panel", async () => {
    const routes: Route[] = [[/POST .*register/, { error: { message: "Two step verification PIN Mismatch", code: 133005 } }, 400], ...ONBOARDING_ROUTES];
    const { progress, account } = await connectNumber(routes);
    expect(progress.phase).toBe("failed");
    expect(progress.error!.message).toContain("PIN");
    expect(account.steps.register?.status).toBe("error");
    expect(account.lastError).toContain("register");

    const calls = mockGraph(ONBOARDING_ROUTES);
    await retryStep(account.id, "register", deps);
    expect(count(calls, /register/)).toBe(1);
    expect(repo.accounts[0].steps.register?.status).toBe("ok");
  });
});

describe("desconexión", () => {
  it("webhook PARTNER_REMOVED: queda disconnected con motivo e iniciador, y se avisa", async () => {
    const { account } = await connectNumber();
    const res = await webhookPOST(
      signed(accountUpdate("PARTNER_REMOVED", { disconnection_info: { reason: "USER_REMOVED_PARTNER", initiated_by: "USER" } }))
    );
    expect(res.status).toBe(200);
    expect(repo.accounts[0]).toMatchObject({
      id: account.id,
      health: "disconnected",
      disconnectionInfo: { event: "PARTNER_REMOVED", reason: "USER_REMOVED_PARTNER", initiatedBy: "USER", source: "webhook" },
    });
    expect(notified).toEqual([{ kind: "disconnected", accountId: 1, reason: "USER_REMOVED_PARTNER" }]);
    // Un webhook repetido no vuelve a avisar.
    await webhookPOST(signed(accountUpdate("PARTNER_REMOVED")));
    expect(notified).toHaveLength(1);
  });

  it("ACCOUNT_OFFBOARDED (desde la app en coexistencia) desconecta; ACCOUNT_RECONNECTED vuelve a active", async () => {
    await connectNumber(ONBOARDING_ROUTES, coexistenceEvent());
    await webhookPOST(signed(accountUpdate("ACCOUNT_OFFBOARDED")));
    expect(repo.accounts[0]).toMatchObject({ health: "disconnected", disconnectionInfo: { reason: "ACCOUNT_OFFBOARDED" } });
    await webhookPOST(signed(accountUpdate("ACCOUNT_RECONNECTED")));
    expect(repo.accounts[0]).toMatchObject({ health: "active", disconnectionInfo: null });
  });

  it("error 190 al enviar: disconnected en el acto y no se intenta enviar más", async () => {
    const { account } = await connectNumber();
    connections.list = [
      { id: account.id, clientId: 1, wabaId: WABA_ID, phoneNumberId: PHONE_NUMBER_ID, displayPhoneNumber: null, verifiedName: null, accessToken: "tok-negocio", apiVersion: "v23.0", connectedAt: null, health: "active" },
    ];
    const calls = mockGraph([[/POST .*\/messages/, { error: { message: "Error validating access token: The user has not authorized application 111.", type: "OAuthException", code: 190 } }, 401]]);
    await expect(sendWhatsAppMessage(CUSTOMER_WA_ID, { type: "text", text: "hola" }, PHONE_NUMBER_ID)).rejects.toBeInstanceOf(MetaApiError);
    expect(repo.accounts[0]).toMatchObject({ health: "disconnected", disconnectionInfo: { reason: "TOKEN_INVALID", source: "graph_error" } });
    expect(notified.map((n) => n.kind)).toEqual(["disconnected"]);

    connections.list[0].health = "disconnected";
    await expect(sendWhatsAppMessage(CUSTOMER_WA_ID, { type: "text", text: "hola" }, PHONE_NUMBER_ID)).rejects.toBeInstanceOf(MetaConfigError);
    expect(count(calls, /\/messages/)).toBe(1);
  });

  it("error 200 con debug_token inválido: disconnected", async () => {
    const { account } = await connectNumber();
    mockGraph([
      [/POST .*\/messages/, { error: { message: "(#200) Permissions error", code: 200 } }, 403],
      [/GET .*debug_token/, { data: { is_valid: false, error: { message: "Error validating access token: session has been invalidated", code: 190 } } }],
    ]);
    await expect(graphRequest({ id: account.id, accessToken: "tok-negocio", apiVersion: "v23.0" }, `/${PHONE_NUMBER_ID}/messages`, { method: "POST", body: "{}" })).rejects.toBeInstanceOf(MetaApiError);
    expect(repo.accounts[0]).toMatchObject({ health: "disconnected", disconnectionInfo: { reason: "TOKEN_INVALID" } });
  });

  it("error 10 con token sano y scopes completos: needs_attention (sin desconectar)", async () => {
    const { account } = await connectNumber();
    mockGraph([[/debug_token/, tokenOk()]]);
    await reportTokenError(account.id, 10, "(#10) Application does not have permission for this action", deps);
    expect(repo.accounts[0].health).toBe("needs_attention");
    expect(notified.map((n) => n.kind)).toEqual(["needsAttention"]);
  });

  it("error 200 y faltan los scopes de WhatsApp: disconnected", async () => {
    const { account } = await connectNumber();
    mockGraph([[/debug_token/, { data: { is_valid: true, scopes: ["public_profile"], granular_scopes: [] } }]]);
    await reportTokenError(account.id, 200, "(#200) Permissions error", deps);
    expect(repo.accounts[0]).toMatchObject({ health: "disconnected", disconnectionInfo: { reason: "PERMISSIONS_MISSING" } });
  });

  it("chequeo diario: detecta tokens revocados sin tráfico y no repite antes de 24 h", async () => {
    await connectNumber();
    const calls = mockGraph([[/debug_token/, { data: { is_valid: false } }]]);
    expect(await runHealthSweep(deps)).toEqual({ checked: 1, disconnected: 1 });
    expect(repo.accounts[0].health).toBe("disconnected");
    // Ya desconectada: no se vuelve a chequear.
    expect(await runHealthSweep(deps)).toEqual({ checked: 0, disconnected: 0 });

    repo.accounts[0].health = "active";
    repo.accounts[0].healthCheckedAt = Math.floor(Date.now() / 1000) - 3600;
    expect((await runHealthSweep(deps)).checked).toBe(0);
    expect(count(calls, /debug_token/)).toBe(1);
  });

  it("reconexión: el mismo Embedded Signup actualiza la misma cuenta y vuelve a active", async () => {
    const { account } = await connectNumber(ONBOARDING_ROUTES, coexistenceEvent());
    await webhookPOST(signed(accountUpdate("PARTNER_REMOVED")));
    expect(repo.accounts[0].health).toBe("disconnected");

    const calls = mockGraph([[/oauth\/access_token/, { access_token: "tok-nuevo" }], ...ONBOARDING_ROUTES]);
    const id = await newSession(CTX, account.id);
    await submitSignupEvent(CTX, id, coexistenceEvent(), deps);
    const progress = await submitSignupCode(CTX, id, "code-2", deps);
    expect(progress.phase).toBe("syncing");
    expect(repo.accounts).toHaveLength(1);
    expect(repo.accounts[0]).toMatchObject({ id: account.id, health: "active", disconnectionInfo: null, accessToken: "tok-nuevo", signupSessionId: id });
    // Onboarding nuevo: la sincronización se vuelve a pedir (una vez cada una).
    expect(count(calls, /smb_app_data/)).toBe(2);
  });
});

describe("webhooks", () => {
  it("smb_message_echoes: salientes \"enviado desde el celular\", idempotentes por wamid", async () => {
    await webhookPOST(signed(echo("wamid.ECHO1", "Te lo mando desde el celu")));
    await webhookPOST(signed(echo("wamid.ECHO1", "Te lo mando desde el celu")));
    expect(inbox.messages).toHaveLength(1);
    expect(inbox.messages[0]).toMatchObject({ direction: "out", authorName: "Enviado desde el celular", body: "Te lo mando desde el celu" });
  });

  it("history: se encola, se procesa aparte, chunks desordenados y progress hasta 100", async () => {
    await connectNumber(ONBOARDING_ROUTES, coexistenceEvent());
    const t = Math.floor(Date.now() / 1000) - 3 * 86400;
    // Llega primero el último chunk
    await webhookPOST(signed(historyChunk(100, [historyMessage("wamid.H3", true, t + 300, "¿Sigue en pie?")], 2)));
    await webhookPOST(signed(historyChunk(50, [historyMessage("wamid.H1", true, t, "Hola, ¿tienen turnos?"), historyMessage("wamid.H2", false, t + 60, "Sí, mañana a las 10")], 1)));
    // Repetido
    await webhookPOST(signed(historyChunk(50, [historyMessage("wamid.H1", true, t, "Hola, ¿tienen turnos?")], 1)));
    expect(inbox.messages).toHaveLength(0); // todavía en la cola
    expect(repo.jobs).toHaveLength(3);

    expect(await processWebhookJobs(deps, 10, inbox)).toBe(3);
    expect(inbox.messages.map((m) => m.wamid).sort()).toEqual(["wamid.H1", "wamid.H2", "wamid.H3"]);
    expect(inbox.messages.find((m) => m.wamid === "wamid.H2")).toMatchObject({ direction: "out", status: "delivered", authorName: "Enviado desde el celular" });
    const conv = inbox.conversations[0];
    expect(conv).toMatchObject({ lastMessagePreview: "¿Sigue en pie?", unreadCount: 0, lastInboundAt: t + 300 });
    expect(repo.accounts[0]).toMatchObject({ historyProgress: 100, historyStatus: "done" });
  });

  it("history con error 2593109: el cliente no compartió el historial, se marca y sigue", async () => {
    await connectNumber(ONBOARDING_ROUTES, coexistenceEvent());
    await webhookPOST(signed(historyDeclined()));
    await processWebhookJobs(deps, 10, inbox);
    expect(repo.accounts[0].historyStatus).toBe("declined");
    expect(repo.jobs[0].status).toBe("done");
    expect(await pollSignup(CTX, repo.sessions[0].id, deps)).toMatchObject({ phase: "done", historyDeclined: true });
  });

  it("smb_app_state_sync: alta y baja de contactos", async () => {
    await inbox.upsertConversation(PHONE_NUMBER_ID, CUSTOMER_WA_ID, null);
    await webhookPOST(signed(stateSync("add", "Juan Pérez")));
    await processWebhookJobs(deps, 10, inbox);
    expect(repo.contacts[0]).toMatchObject({ waId: CUSTOMER_WA_ID, fullName: "Juan Pérez", removed: false });
    expect(inbox.conversations[0].contactName).toBe("Juan Pérez");
    await webhookPOST(signed(stateSync("remove")));
    await processWebhookJobs(deps, 10, inbox);
    expect(repo.contacts[0].removed).toBe(true);
  });

  it("messages con error 131060: aviso para revisarlo en la app de WhatsApp Business", async () => {
    await webhookPOST(
      signed(
        envelope("messages", {
          contacts: [{ profile: { name: "Juan" }, wa_id: CUSTOMER_WA_ID }],
          messages: [{ from: CUSTOMER_WA_ID, id: "wamid.U1", timestamp: String(Math.floor(Date.now() / 1000)), type: "unsupported", errors: [{ code: 131060, title: "This message is not supported in this API" }] }],
        })
      )
    );
    expect(inbox.messages[0].body).toBe(BIZ_APP_ONLY_TEXT);
  });
});

describe("aislamiento entre cuentas", () => {
  it("una cuenta no ve ni opera sesiones, números ni conversaciones de otra", async () => {
    const { id, account } = await connectNumber();
    await expect(pollSignup(OTHER, id, deps)).rejects.toMatchObject({ httpStatus: 404 });
    await expect(submitSignupCode(OTHER, id, "x", deps)).rejects.toMatchObject({ httpStatus: 404 });
    await expect(submitSignupEvent(OTHER, id, finishEvent(), deps)).rejects.toMatchObject({ httpStatus: 404 });
    await expect(createSignupSession(OTHER, { reconnectId: account.id }, deps)).rejects.toMatchObject({ httpStatus: 404 });

    const channels = new MemoryChannelsRepo();
    expect((await channelsOverview(channels, 1, repo)).accounts.map((a) => a.key)).toEqual([`wa:${account.id}`]);
    expect((await channelsOverview(channels, 2, repo)).accounts).toEqual([]);

    const conversationId = await inbox.upsertConversation(PHONE_NUMBER_ID, CUSTOMER_WA_ID, "Juan", { accountId: 1 });
    expect(await inbox.listConversations(2, 50)).toEqual([]);
    const intruder: CrmUser = { id: 9, name: "Otro", email: null, role: "admin", accountId: 2, channels: [] };
    const access = await conversationFor(intruder, 2, conversationId);
    expect(access.response?.status).toBe(404);
  });
});
