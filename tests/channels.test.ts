import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { providerAvailability } from "@/lib/channels/config";
import { MemoryChannelsRepo } from "@/lib/channels/repo";
import { seal, unseal } from "@/lib/channels/seal";
import {
  completeThreads,
  connectFacebookPages,
  connectInstagramAccounts,
  disconnectChannel,
  listFacebookPages,
  listInstagramAccounts,
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
  vi.stubEnv("META_FB_IG_CONFIG_ID", "cfg-fb");
  vi.stubEnv("META_IG_CONFIG_ID", "cfg-ig");
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
    expect(a.whatsapp).toMatchObject({ available: false, reason: expect.stringContaining("no está habilitada") });
    expect(a.facebook.available).toBe(true);
    expect(a.instagram.available).toBe(true);
    expect(a.threads.available).toBe(false);
    // Instagram tiene su propia configuración de login.
    vi.stubEnv("META_IG_CONFIG_ID", "");
    expect(providerAvailability().instagram.available).toBe(false);
    expect(providerAvailability().facebook.available).toBe(true);
  });
});

describe("Facebook: páginas (Messenger + comentarios)", () => {
  const pages = {
    data: [
      { id: "900", name: "Óptica Sol", access_token: "tok-pagina", picture: { data: { url: "https://x/p.jpg" } } },
      { id: "901", name: "Otra página", access_token: "tok-otra" },
    ],
  };
  const debugOk = {
    data: {
      is_valid: true,
      app_id: "111",
      type: "SYSTEM_USER",
      expires_at: 0,
      scopes: ["pages_show_list", "pages_messaging", "pages_manage_metadata", "pages_read_engagement"],
    },
  };

  it("valida el token, lista las páginas sin mandar tokens al navegador y conecta y suscribe lo elegido", async () => {
    mockMeta([
      [/GET .*oauth\/access_token\?client_id=111&client_secret=secreto&code=codigo/, { access_token: "tok-sistema" }],
      [/GET .*debug_token\?input_token=tok-sistema&access_token=111%7Csecreto/, debugOk],
      [/GET .*me\/accounts/, pages],
      [/POST .*900\/subscribed_apps/, { success: true }],
    ]);
    const listed = await listFacebookPages(repo, CTX, "codigo");
    expect(listed.pages.map((p) => p.name)).toEqual(["Óptica Sol", "Otra página"]);
    expect(JSON.stringify(listed.pages)).not.toContain("tok-pagina");
    expect(listed.selection).not.toContain("tok-pagina");
    // Token de usuario del sistema: no se pide el de larga duración.
    expect(calls.some((c) => c.url.includes("fb_exchange_token"))).toBe(false);

    const connected = await connectFacebookPages(repo, CTX, listed.selection, ["900"]);
    expect(connected.map((c) => c.title)).toEqual(["Óptica Sol"]);
    expect(repo.social).toEqual([
      expect.objectContaining({ channel: "fb", externalId: "900", pageId: "900", authType: "page", accessToken: "tok-pagina", configId: "cfg-fb" }),
    ]);
    const sub = calls.find((c) => c.url.includes("subscribed_apps"))!;
    expect(sub.url).toContain("/900/subscribed_apps");
    expect(new URL(sub.url).searchParams.get("subscribed_fields")).toBe(
      "messages,messaging_postbacks,message_reads,message_deliveries,feed"
    );
  });

  it("con un token de usuario común pide el de larga duración", async () => {
    mockMeta([
      [/GET .*oauth\/access_token\?client_id/, { access_token: "tok-user" }],
      [/GET .*debug_token/, { data: { ...debugOk.data, type: "USER" } }],
      [/GET .*oauth\/access_token\?grant_type=fb_exchange_token/, { access_token: "tok-user-largo" }],
      [/GET .*me\/accounts/, pages],
    ]);
    await listFacebookPages(repo, CTX, "codigo");
    expect(calls.find((c) => c.url.includes("me/accounts"))!.url).toBeTruthy();
    expect(calls.some((c) => c.url.includes("fb_exchange_token"))).toBe(true);
  });

  it("rechaza un token inválido, de otra app o sin los permisos", async () => {
    for (const data of [
      { ...debugOk.data, is_valid: false },
      { ...debugOk.data, app_id: "otra-app" },
      { ...debugOk.data, scopes: ["pages_show_list"] },
    ]) {
      mockMeta([
        [/oauth\/access_token/, { access_token: "tok" }],
        [/debug_token/, { data }],
        [/me\/accounts/, pages],
      ]);
      await expect(listFacebookPages(repo, CTX, "codigo")).rejects.toMatchObject({ httpStatus: 400 });
      expect(calls.some((c) => c.url.includes("me/accounts"))).toBe(false);
    }
  });

  it("la selección es de esta persona y esta cuenta", async () => {
    const selection = seal("fb-pages", 1, 7, [], 60);
    await expect(connectFacebookPages(repo, { accountId: 2, userId: 7 }, selection, [])).rejects.toMatchObject({ httpStatus: 410 });
    await expect(connectFacebookPages(repo, { accountId: 1, userId: 99 }, selection, [])).rejects.toMatchObject({ httpStatus: 410 });
  });

  it("aislamiento: marca lo que está en otra cuenta y no deja robarlo (sin suscribir nada)", async () => {
    await repo.saveSocial({ accountId: 2, channel: "fb", externalId: "900", pageId: "900", displayName: "Óptica Sol", accessToken: "x", tokenExpiresAt: null, pictureUrl: null, pageName: null, connectedBy: null });
    mockMeta([
      [/oauth\/access_token/, { access_token: "tok" }],
      [/debug_token/, debugOk],
      [/me\/accounts/, pages],
      [/subscribed_apps/, { success: true }],
    ]);
    const listed = await listFacebookPages(repo, CTX, "codigo");
    expect(listed.pages[0]).toMatchObject({ takenElsewhere: true, connectedHere: false });
    expect(listed.pages[1]).toMatchObject({ takenElsewhere: false });
    await expect(connectFacebookPages(repo, CTX, listed.selection, ["900", "901"])).rejects.toMatchObject({ httpStatus: 409 });
    expect(calls.some((c) => c.url.includes("subscribed_apps"))).toBe(false);
    // La cuenta 1 no ve la página de la cuenta 2.
    expect(await repo.listSocial(1)).toHaveLength(0);
  });

  it("al desconectar la última conexión de una página, se desuscribe", async () => {
    const fb = await repo.saveSocial({ accountId: 1, channel: "fb", externalId: "900", pageId: "900", displayName: "Óptica", accessToken: "tok", tokenExpiresAt: null, pictureUrl: null, pageName: null, connectedBy: null });
    // Instagram viejo, vinculado a la misma página
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

describe("Instagram API with Unified Login", () => {
  const debugIg = {
    data: {
      is_valid: true,
      app_id: "111",
      type: "SYSTEM_USER",
      expires_at: 0,
      scopes: ["instagram_basic", "instagram_manage_messages", "instagram_manage_comments", "business_management"],
    },
  };
  const assigned = {
    data: [
      { id: "17841400000000001", username: "esteban_instaok", profile_picture_url: "https://x/ig.jpg" },
      { id: "17841400000000002", username: "otra.cuenta" },
    ],
    paging: { cursors: { before: "a", after: "b" } },
  };
  const igRoutes = (extra: [RegExp, unknown, number?][] = []): [RegExp, unknown, number?][] => [
    [/GET .*oauth\/access_token\?client_id=111&client_secret=secreto&code=codigo-ig/, { access_token: "tok-suat" }],
    [/GET .*debug_token\?input_token=tok-suat/, debugIg],
    [/GET .*\/me\?fields=client_business_id/, { client_business_id: "BIZ-1", id: "sys-user" }],
    [/GET .*\/me\/assigned_instagram_accounts\?fields=id%2Cusername%2Cprofile_picture_url/, assigned],
    ...extra,
  ];

  it("canjea el code, valida con debug_token, lista las cuentas asignadas y conecta y suscribe lo elegido", async () => {
    mockMeta(igRoutes([[/POST https:\/\/graph\.facebook\.com\/v[\d.]+\/17841400000000001\/subscribed_apps/, { success: true }]]));
    const listed = await listInstagramAccounts(repo, CTX, "codigo-ig");
    expect(listed.accounts.map((a) => a.name)).toEqual(["@esteban_instaok", "@otra.cuenta"]);
    expect(JSON.stringify(listed)).not.toContain("tok-suat");

    const connected = await connectInstagramAccounts(repo, CTX, listed.selection, ["17841400000000001"]);
    expect(connected).toEqual([expect.objectContaining({ title: "@esteban_instaok", subtitle: "Mensajes directos y comentarios" })]);
    expect(repo.social).toEqual([
      expect.objectContaining({
        channel: "ig",
        externalId: "17841400000000001",
        pageId: null,
        authType: "ig_unified",
        businessId: "BIZ-1",
        configId: "cfg-ig",
        accessToken: "tok-suat",
        tokenExpiresAt: null,
      }),
    ]);
    const sub = calls.find((c) => c.url.includes("subscribed_apps"))!;
    expect(sub.method).toBe("POST");
    expect(new URL(sub.url).searchParams.get("subscribed_fields")).toBe("messages,messaging_postbacks,messaging_seen,comments");
    // Las llamadas a Meta van con el token en el header, nunca en la URL.
    expect(calls.filter((c) => c.url.includes("tok-suat") && !c.url.includes("debug_token"))).toHaveLength(0);
  });

  it("sin los permisos de Instagram no lista nada", async () => {
    mockMeta(igRoutes().map(([re, body]) => [re, re.source.includes("debug_token") ? { data: { ...debugIg.data, scopes: ["instagram_basic"] } } : body]));
    await expect(listInstagramAccounts(repo, CTX, "codigo-ig")).rejects.toMatchObject({ httpStatus: 400 });
  });

  it("si no hay cuentas asignadas avisa qué revisar", async () => {
    mockMeta([
      [/oauth\/access_token/, { access_token: "tok-suat" }],
      [/debug_token/, debugIg],
      [/client_business_id/, { client_business_id: "BIZ-1" }],
      [/assigned_instagram_accounts/, { data: [] }],
    ]);
    await expect(listInstagramAccounts(repo, CTX, "codigo-ig")).rejects.toMatchObject({
      httpStatus: 404,
      message: expect.stringContaining("profesional"),
    });
  });

  it("aislamiento: no deja conectar una cuenta de IG que ya es de otro cliente", async () => {
    await repo.saveSocial({ accountId: 2, channel: "ig", externalId: "17841400000000001", pageId: null, authType: "ig_unified", displayName: "@esteban_instaok", accessToken: "x", tokenExpiresAt: null, pictureUrl: null, pageName: null, connectedBy: null });
    mockMeta(igRoutes([[/subscribed_apps/, { success: true }]]));
    const listed = await listInstagramAccounts(repo, CTX, "codigo-ig");
    expect(listed.accounts[0]).toMatchObject({ takenElsewhere: true });
    await expect(connectInstagramAccounts(repo, CTX, listed.selection, ["17841400000000001"])).rejects.toMatchObject({ httpStatus: 409 });
    expect(calls.some((c) => c.url.includes("subscribed_apps"))).toBe(false);
  });

  it("la selección de Instagram no se abre con otro propósito", async () => {
    const fbSelection = seal("fb-pages", 1, 7, [], 60);
    await expect(connectInstagramAccounts(repo, CTX, fbSelection, ["1"])).rejects.toMatchObject({ httpStatus: 410 });
  });

  it("al desconectar se desuscribe la cuenta de Instagram con su token", async () => {
    const id = await repo.saveSocial({ accountId: 1, channel: "ig", externalId: "17841400000000001", pageId: null, authType: "ig_unified", displayName: "@e", accessToken: "tok-suat", tokenExpiresAt: null, pictureUrl: null, pageName: null, connectedBy: null });
    mockMeta([[/DELETE .*17841400000000001\/subscribed_apps/, { success: true }]]);
    await disconnectChannel(repo, 1, `social:${id}`);
    expect(calls).toEqual([expect.objectContaining({ method: "DELETE" })]);
    expect(await repo.listSocial(1)).toHaveLength(0);
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
