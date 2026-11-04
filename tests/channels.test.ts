import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { providerAvailability } from "@/lib/channels/config";
import { MemoryChannelsRepo } from "@/lib/channels/repo";
import { seal, unseal } from "@/lib/channels/seal";
import {
  completeThreads,
  connectFacebookPages,
  connectWhatsApp,
  disconnectChannel,
  listFacebookPages,
  refreshExpiringThreads,
  threadsAuthorizeUrl,
} from "@/lib/channels/service";

const CTX = { accountId: 1, userId: 7 };
let repo: MemoryChannelsRepo;
let calls: { method: string; url: string; body: string | null }[];

// Respuestas de Meta según la URL pedida.
function mockMeta(routes: [RegExp, unknown, number?][]) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: (init?.body as string) ?? null });
      const route = routes.find(([re]) => re.test(`${method} ${url}`));
      if (!route) return new Response(JSON.stringify({ error: { message: `sin mock: ${method} ${url}` } }), { status: 400 });
      return new Response(JSON.stringify(route[1]), { status: route[2] ?? 200 });
    })
  );
}

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("META_APP_ID", "111");
  vi.stubEnv("META_APP_SECRET", "secreto");
  vi.stubEnv("META_WA_CONFIG_ID", "cfg-wa");
  vi.stubEnv("META_LOGIN_CONFIG_ID", "cfg-login");
  vi.stubEnv("THREADS_APP_ID", "222");
  vi.stubEnv("THREADS_APP_SECRET", "secreto-th");
  vi.stubEnv("APP_URL", "https://digibotlatam.com");
  repo = new MemoryChannelsRepo();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sobres sellados", () => {
  it("solo se abren con el mismo propósito, cuenta y persona, y antes de vencer", () => {
    const token = seal("fb-pages", 1, 7, { a: 1 }, 60);
    expect(unseal(token, "fb-pages", { accountId: 1, userId: 7 })).toEqual({ accountId: 1, data: { a: 1 } });
    expect(unseal(token, "threads", { accountId: 1, userId: 7 })).toBeNull();
    expect(unseal(token, "fb-pages", { accountId: 2, userId: 7 })).toBeNull();
    expect(unseal(token, "fb-pages", { accountId: 1, userId: 8 })).toBeNull();
    expect(unseal(token.slice(0, -4) + "AAAA", "fb-pages", { accountId: 1, userId: 7 })).toBeNull();
    expect(unseal(seal("fb-pages", 1, 7, {}, -1), "fb-pages", { accountId: 1, userId: 7 })).toBeNull();
  });
});

describe("disponibilidad", () => {
  it("sin las credenciales de Tech Provider, los botones quedan deshabilitados con el motivo", () => {
    vi.stubEnv("META_WA_CONFIG_ID", "");
    vi.stubEnv("THREADS_APP_SECRET", "");
    const a = providerAvailability();
    expect(a.whatsapp).toMatchObject({ available: false, reason: expect.stringContaining("Tech Provider") });
    expect(a.facebook.available).toBe(true);
    expect(a.threads.available).toBe(false);
  });
});

describe("WhatsApp (Embedded Signup)", () => {
  const body = { code: "codigo", wabaId: "100200300", phoneNumberId: "555666777" };

  it("cambia el código, suscribe la app, registra el número y lo guarda en la cuenta", async () => {
    mockMeta([
      [/GET .*oauth\/access_token/, { access_token: "tok-negocio" }],
      [/POST .*100200300\/subscribed_apps/, { success: true }],
      [/POST .*555666777\/register/, { success: true }],
      [/GET .*555666777\?fields/, { display_phone_number: "+54 9 261 555-0100", verified_name: "Óptica Sol" }],
    ]);
    const account = await connectWhatsApp(repo, CTX, body);
    expect(account).toMatchObject({ provider: "whatsapp", title: "+54 9 261 555-0100", subtitle: "Óptica Sol" });
    expect(repo.whatsapp[0]).toMatchObject({ accountId: 1, accessToken: "tok-negocio", wabaId: "100200300" });
    // El secreto de la app va al cambiar el código y nunca en un body hacia el navegador.
    expect(calls[0].url).toContain("client_secret=secreto");
    expect(JSON.parse(calls.find((c) => c.url.includes("/register"))!.body!)).toMatchObject({ pin: expect.stringMatching(/^\d{6}$/) });
  });

  it("si el número ya estaba registrado, sigue igual", async () => {
    mockMeta([
      [/oauth\/access_token/, { access_token: "tok" }],
      [/subscribed_apps/, { success: true }],
      [/register/, { error: { message: "already registered" } }, 400],
      [/fields=display/, { display_phone_number: "+1 555" }],
    ]);
    await expect(connectWhatsApp(repo, CTX, body)).resolves.toMatchObject({ title: "+1 555" });
  });

  it("un número no puede estar en dos cuentas", async () => {
    await repo.saveWhatsApp({ accountId: 2, wabaId: "1", phoneNumberId: "555666777", displayPhoneNumber: null, verifiedName: null, accessToken: "x", connectedBy: null, pin: null });
    mockMeta([]);
    await expect(connectWhatsApp(repo, CTX, body)).rejects.toMatchObject({ httpStatus: 409 });
    expect(calls).toHaveLength(0); // ni siquiera se llamó a Meta
  });

  it("valida lo que manda el navegador y traduce los errores de Meta", async () => {
    await expect(connectWhatsApp(repo, CTX, { code: "x", wabaId: "abc", phoneNumberId: "1" })).rejects.toMatchObject({ httpStatus: 400 });
    mockMeta([[/oauth\/access_token/, { error: { message: "Invalid verification code format." } }, 400]]);
    await expect(connectWhatsApp(repo, CTX, body)).rejects.toThrow("Meta no aceptó la autorización");
  });
});

describe("Facebook e Instagram", () => {
  const pages = {
    data: [
      {
        id: "900",
        name: "Óptica Sol",
        access_token: "tok-pagina",
        picture: { data: { url: "https://x/p.jpg" } },
        instagram_business_account: { id: "1784", username: "opticasol", profile_picture_url: "https://x/ig.jpg" },
      },
      { id: "901", name: "Otra página", access_token: "tok-otra" },
    ],
  };

  it("lista las páginas sin mandar tokens al navegador y conecta lo elegido", async () => {
    mockMeta([
      [/GET .*oauth\/access_token\?client_id/, { access_token: "tok-user" }],
      [/GET .*oauth\/access_token\?grant_type=fb_exchange_token/, { access_token: "tok-user-largo" }],
      [/GET .*me\/accounts/, pages],
      [/POST .*900\/subscribed_apps/, { success: true }],
    ]);
    const listed = await listFacebookPages(repo, CTX, "codigo");
    expect(listed.pages.map((p) => p.name)).toEqual(["Óptica Sol", "Otra página"]);
    expect(JSON.stringify(listed.pages)).not.toContain("tok-pagina");
    expect(listed.selection).not.toContain("tok-pagina");

    const connected = await connectFacebookPages(repo, CTX, listed.selection, [
      { pageId: "900", facebook: true, instagram: true },
    ]);
    expect(connected.map((c) => c.title)).toEqual(["Óptica Sol", "@opticasol"]);
    expect(repo.social).toEqual([
      expect.objectContaining({ channel: "fb", externalId: "900", pageId: "900", accessToken: "tok-pagina" }),
      expect.objectContaining({ channel: "ig", externalId: "1784", pageId: "900", pageName: "Óptica Sol" }),
    ]);
    expect(calls.filter((c) => c.url.includes("subscribed_apps"))).toHaveLength(1);
    expect(calls.find((c) => c.url.includes("subscribed_apps"))!.url).toContain("subscribed_fields=messages");
  });

  it("la selección es de esta persona y esta cuenta", async () => {
    const selection = seal("fb-pages", 1, 7, [], 60);
    await expect(connectFacebookPages(repo, { accountId: 2, userId: 7 }, selection, [])).rejects.toMatchObject({ httpStatus: 410 });
    await expect(connectFacebookPages(repo, { accountId: 1, userId: 99 }, selection, [])).rejects.toMatchObject({ httpStatus: 410 });
  });

  it("marca lo que ya está conectado acá o en otra cuenta, y no deja robarlo", async () => {
    await repo.saveSocial({ accountId: 2, channel: "ig", externalId: "1784", pageId: "900", displayName: "@opticasol", accessToken: "x", tokenExpiresAt: null, pictureUrl: null, pageName: null, connectedBy: null });
    mockMeta([
      [/oauth\/access_token/, { access_token: "tok-user" }],
      [/me\/accounts/, pages],
      [/subscribed_apps/, { success: true }],
    ]);
    const listed = await listFacebookPages(repo, CTX, "codigo");
    expect(listed.pages[0].takenElsewhere).toEqual({ facebook: false, instagram: true });
    await expect(
      connectFacebookPages(repo, CTX, listed.selection, [{ pageId: "900", facebook: false, instagram: true }])
    ).rejects.toMatchObject({ httpStatus: 409 });
  });

  it("al desconectar la última conexión de una página, se desuscribe", async () => {
    const fb = await repo.saveSocial({ accountId: 1, channel: "fb", externalId: "900", pageId: "900", displayName: "Óptica", accessToken: "tok", tokenExpiresAt: null, pictureUrl: null, pageName: null, connectedBy: null });
    const ig = await repo.saveSocial({ accountId: 1, channel: "ig", externalId: "1784", pageId: "900", displayName: "@o", accessToken: "tok", tokenExpiresAt: null, pictureUrl: null, pageName: null, connectedBy: null });
    mockMeta([[/DELETE .*900\/subscribed_apps/, { success: true }]]);
    await disconnectChannel(repo, 1, `social:${fb}`);
    expect(calls).toHaveLength(0); // el Instagram todavía usa la página
    await disconnectChannel(repo, 1, `social:${ig}`);
    expect(calls).toHaveLength(1);
    await expect(disconnectChannel(repo, 2, `social:${ig}`)).rejects.toMatchObject({ httpStatus: 404 });
    await expect(disconnectChannel(repo, 1, "env:fb:900")).rejects.toMatchObject({ httpStatus: 400 });
  });
});

describe("Threads", () => {
  it("arma el link de autorización con un state sellado", () => {
    const url = new URL(threadsAuthorizeUrl(CTX));
    expect(url.origin).toBe("https://threads.net");
    expect(url.searchParams.get("redirect_uri")).toBe("https://digibotlatam.com/api/admin/canales/threads/callback");
    expect(url.searchParams.get("scope")).toBe("threads_basic,threads_read_replies,threads_manage_replies");
    expect(unseal(url.searchParams.get("state"), "threads", { userId: 7 })).toMatchObject({ accountId: 1 });
  });

  it("completa la conexión con un token de 60 días", async () => {
    const state = new URL(threadsAuthorizeUrl(CTX)).searchParams.get("state");
    mockMeta([
      [/POST .*graph.threads.net\/oauth\/access_token/, { access_token: "corto", user_id: 42 }],
      [/GET .*graph.threads.net\/access_token\?grant_type=th_exchange_token/, { access_token: "largo", expires_in: 5184000 }],
      [/GET .*graph.threads.net\/v1.0\/me/, { id: "42", username: "opticasol" }],
    ]);
    const result = await completeThreads(repo, {
      code: "c",
      state,
      userId: 7,
      redirectUri: "https://digibotlatam.com/api/admin/canales/threads/callback",
      canConnect: () => true,
    });
    expect(result).toEqual({ accountId: 1, username: "opticasol" });
    expect(repo.social[0]).toMatchObject({ channel: "th", externalId: "42", accessToken: "largo" });
    expect(repo.social[0].tokenExpiresAt! - Math.floor(Date.now() / 1000)).toBeGreaterThan(59 * 86400);
  });

  it("no guarda nada si la persona no puede configurar esa cuenta o el state es de otra persona", async () => {
    const state = new URL(threadsAuthorizeUrl(CTX)).searchParams.get("state");
    mockMeta([]);
    const base = { code: "c", state, redirectUri: "x", canConnect: () => true };
    await expect(completeThreads(repo, { ...base, userId: 8 })).rejects.toMatchObject({ httpStatus: 410 });
    await expect(completeThreads(repo, { ...base, userId: 7, canConnect: () => false })).rejects.toMatchObject({ httpStatus: 403 });
    expect(calls).toHaveLength(0);
  });

  it("renueva solo los tokens que vencen en menos de 10 días (y no los ya vencidos)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const add = (externalId: string, expiresIn: number) =>
      repo.saveSocial({ accountId: 1, channel: "th", externalId, pageId: null, displayName: externalId, accessToken: `tok-${externalId}`, tokenExpiresAt: now + expiresIn, pictureUrl: null, pageName: null, connectedBy: null });
    await add("pronto", 3 * 86400);
    await add("lejos", 40 * 86400);
    await add("vencido", -60);
    mockMeta([[/refresh_access_token/, { access_token: "nuevo", expires_in: 5184000 }]]);
    expect(await refreshExpiringThreads(repo, now)).toBe(1);
    expect(repo.social.find((s) => s.externalId === "pronto")).toMatchObject({ accessToken: "nuevo" });
    expect(repo.social.find((s) => s.externalId === "lejos")).toMatchObject({ accessToken: "tok-lejos" });
  });
});
