// Fase B: salud de las conexiones de Facebook e Instagram, desautorización y eliminación de datos de Meta.

import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryChannelsRepo, type NewSocial } from "@/lib/channels/repo";
import { socialAccountView } from "@/lib/channels/service";
import { reportSocialTokenError, runSocialHealthSweep, type SocialHealthDeps } from "@/lib/channels/social-health";
import {
  createDeletionRequest,
  deletionStatusUrl,
  handleDeauthorize,
  isConfirmationCode,
  processDeletionRequest,
  type DeletionDeps,
  type DeletionRequest,
} from "@/lib/meta-social/data-deletion";
import { parseSignedRequest } from "@/lib/meta-social/signed-request";

const IG_SCOPES = ["instagram_basic", "instagram_manage_messages", "instagram_manage_comments"];

const igAccount = (externalId = "17841400000000001"): NewSocial => ({
  accountId: 1,
  channel: "ig",
  externalId,
  pageId: null,
  authType: "ig_unified",
  displayName: "@cuenta",
  accessToken: "tok-ig",
  tokenExpiresAt: null,
  pictureUrl: null,
  pageName: null,
  connectedBy: 7,
});
const fbPage: NewSocial = { ...igAccount("PAGE-1"), channel: "fb", pageId: "PAGE-1", authType: "page", displayName: "Óptica Sol", accessToken: "tok-page" };

let repo: MemoryChannelsRepo;
let debugToken: ReturnType<typeof vi.fn>;
let deps: SocialHealthDeps;

beforeEach(() => {
  repo = new MemoryChannelsRepo();
  debugToken = vi.fn(async () => ({ is_valid: true, scopes: IG_SCOPES }));
  deps = { repo, debugToken };
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const record = async (id: number) => (await repo.listSocial(1)).find((s) => s.id === id)!;

describe("salud de Facebook e Instagram", () => {
  it("token revocado (#190) en una llamada: queda desconectado y Canales ofrece reconectar", async () => {
    const id = await repo.saveSocial(igAccount());
    await reportSocialTokenError("ig", "17841400000000001", 190, "Error validating access token", deps);
    const s = await record(id);
    expect(s.health).toBe("disconnected");
    expect(s.disconnectionInfo).toMatchObject({ reason: "TOKEN_INVALID", source: "graph_error" });
    expect(socialAccountView(s)).toMatchObject({ health: "disconnected", healthMessage: expect.stringContaining("Reconectá") });
    expect(debugToken).not.toHaveBeenCalled();
  });

  it("un error de permisos (#10) deja la cuenta en atención si el token sigue sano", async () => {
    const id = await repo.saveSocial(igAccount());
    await reportSocialTokenError("ig", "17841400000000001", 10, "Permission denied", deps);
    expect((await record(id)).health).toBe("needs_attention");
    expect(debugToken).toHaveBeenCalledTimes(1);
  });

  it("un error de permisos con el token inválido para Meta: desconectado", async () => {
    debugToken.mockResolvedValue({ is_valid: false, error: { message: "Session has been invalidated" } });
    const id = await repo.saveSocial(igAccount());
    await reportSocialTokenError("ig", "17841400000000001", 200, "Permissions error", deps);
    expect((await record(id)).health).toBe("disconnected");
  });

  it("otros errores (ej. ventana de 24 h, límite de llamadas) no tocan la salud", async () => {
    const id = await repo.saveSocial(igAccount());
    await reportSocialTokenError("ig", "17841400000000001", 10903, "Fuera de la ventana", deps);
    await reportSocialTokenError("ig", "17841400000000001", 80002, "Too many calls", deps);
    expect((await record(id)).health ?? "active").toBe("active");
  });

  it("chequeo diario: sin los permisos necesarios queda desconectado; las desconectadas no se vuelven a consultar", async () => {
    debugToken.mockImplementation(async (token: string) =>
      token === "tok-page" ? { is_valid: true, scopes: ["pages_show_list"] } : { is_valid: true, scopes: IG_SCOPES }
    );
    const ig = await repo.saveSocial(igAccount());
    const fb = await repo.saveSocial(fbPage);
    expect(await runSocialHealthSweep(deps)).toEqual({ checked: 2, disconnected: 1 });
    expect((await record(fb)).disconnectionInfo).toMatchObject({ reason: "PERMISSIONS_MISSING" });
    expect((await record(ig)).healthCheckedAt).toBeTruthy();
    // Ya verificadas hoy / desconectadas: no se repiten
    expect(await runSocialHealthSweep(deps)).toEqual({ checked: 0, disconnected: 0 });
  });

  it("con el token sano, una cuenta en atención vuelve a activa en el chequeo", async () => {
    const id = await repo.saveSocial(igAccount());
    await repo.updateSocialHealth(id, { health: "needs_attention", lastError: "(#10) x" });
    await runSocialHealthSweep(deps);
    expect((await record(id)).health).toBe("active");
  });

  it("reconectar la misma cuenta la deja sana otra vez", async () => {
    const id = await repo.saveSocial(igAccount());
    await reportSocialTokenError("ig", "17841400000000001", 190, "revocado", deps);
    await repo.saveSocial({ ...igAccount(), accessToken: "tok-nuevo" });
    expect(await record(id)).toMatchObject({ health: "active", disconnectionInfo: null, accessToken: "tok-nuevo" });
  });

  it("Threads y TikTok no entran en este chequeo", async () => {
    await repo.saveSocial({ ...igAccount("th-1"), channel: "th", authType: "page" });
    await reportSocialTokenError("th" as "ig", "th-1", 190, "x", deps);
    expect(await runSocialHealthSweep(deps)).toEqual({ checked: 0, disconnected: 0 });
  });
});

// signed_request como lo arma Meta
function signed(payload: object, secret = "secreto") {
  const b64 = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const body = b64(Buffer.from(JSON.stringify(payload)));
  return `${b64(createHmac("sha256", secret).update(body).digest())}.${body}`;
}

describe("signed_request de Meta", () => {
  it("acepta la firma con el app secret y devuelve la persona", () => {
    expect(parseSignedRequest(signed({ algorithm: "HMAC-SHA256", user_id: "123", issued_at: 1 }), "secreto")).toMatchObject({ user_id: "123" });
  });
  it("rechaza otra firma, otro algoritmo o basura", () => {
    expect(parseSignedRequest(signed({ algorithm: "HMAC-SHA256", user_id: "123" }, "otro"), "secreto")).toBeNull();
    expect(parseSignedRequest(signed({ algorithm: "MD5", user_id: "123" }), "secreto")).toBeNull();
    expect(parseSignedRequest("abc", "secreto")).toBeNull();
    expect(parseSignedRequest(signed({ algorithm: "HMAC-SHA256", user_id: "123" }), undefined)).toBeNull();
  });
});

describe("desautorización y eliminación de datos", () => {
  function memoryDeps() {
    const requests = new Map<string, DeletionRequest & { user: string }>();
    const d: DeletionDeps & { requests: typeof requests } = {
      requests,
      save: async (code, user) => void requests.set(code, { code, user, status: "received", connectionsRemoved: 0, createdAt: 1, processedAt: null }),
      markProcessed: async (code, n) => void Object.assign(requests.get(code)!, { status: "processed", connectionsRemoved: n, processedAt: 2 }),
      find: async (code) => requests.get(code) ?? null,
      checkAllConnections: vi.fn(async () => {}),
      purgeRevokedSocial: vi.fn(async () => 1),
    };
    return d;
  }

  it("desautorizar verifica todas las conexiones en el momento", async () => {
    const d = memoryDeps();
    await handleDeauthorize("123", d);
    expect(d.checkAllConnections).toHaveBeenCalledTimes(1);
    expect(d.purgeRevokedSocial).not.toHaveBeenCalled();
  });

  it("el pedido de eliminación devuelve un código, verifica, borra los accesos revocados y queda procesado", async () => {
    const d = memoryDeps();
    const code = await createDeletionRequest("123", d);
    expect(isConfirmationCode(code)).toBe(true);
    expect(await d.find(code)).toMatchObject({ status: "received" });
    await processDeletionRequest(code, d);
    expect(d.checkAllConnections).toHaveBeenCalled();
    expect(await d.find(code)).toMatchObject({ status: "processed", connectionsRemoved: 1 });
    expect(deletionStatusUrl("https://digibotlatam.com/", code)).toBe(`https://digibotlatam.com/eliminacion-de-datos/estado?codigo=${code}`);
  });

  it("si falla el procesamiento queda recibido (para atenderlo a mano)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const d = memoryDeps();
    d.checkAllConnections = vi.fn(async () => {
      throw new Error("Meta no contesta");
    });
    const code = await createDeletionRequest("123", d);
    await processDeletionRequest(code, d);
    expect(await d.find(code)).toMatchObject({ status: "received" });
  });

  it("las rutas rechazan pedidos sin firma válida", async () => {
    vi.stubEnv("META_APP_SECRET", "secreto");
    const { POST: deauth } = await import("@/app/webhooks/meta/deauthorize/route");
    const { POST: deletion } = await import("@/app/webhooks/meta/data-deletion/route");
    const req = (body: string) => new Request("https://x/webhooks/meta/data-deletion", { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    expect((await deauth(req("signed_request=abc.def"))).status).toBe(403);
    expect((await deletion(req(`signed_request=${signed({ algorithm: "HMAC-SHA256", user_id: "1" }, "otro")}`))).status).toBe(403);
    vi.unstubAllEnvs();
  });
});
