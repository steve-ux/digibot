// Sincronización de DMs de Instagram por la API de conversaciones (plan B mientras Meta
// no manda los webhooks de mensajes). Respuestas con la forma real de
// GET /{ig-id}/conversations?platform=instagram&fields=...messages{...}.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SocialAccount } from "@/lib/meta-social/accounts";
import { MetaRateLimitError, pollInstagramDms, resetPollerCursors, type PollAccount } from "@/lib/meta-social/ig-poller";
import { MemoryInboxStore } from "@/lib/wa-inbox/memory-store";

const IG = "17841419643472008";
const IGSID = "1571925424971520";
const now = () => Math.floor(Date.now() / 1000);
const iso = (unix: number) => new Date(unix * 1000).toISOString().replace(".000Z", "+0000");

const ACCOUNT: SocialAccount = {
  channel: "ig",
  clientId: 1,
  authType: "ig_unified",
  accountId: IG,
  pageId: null,
  displayName: "@ekoddex",
  accessToken: "tok-suat",
  apiVersion: "v23.0",
  source: "db",
};
const POLL_ACCOUNT: PollAccount = { igUserId: IG, accessToken: "tok-suat", connectedAt: now() - 3600 };

let store: MemoryInboxStore;
const msg = (id: string, fromBusiness: boolean, text: string, at: number) => ({
  id,
  created_time: iso(at),
  from: fromBusiness ? { id: IG, username: "ekoddex" } : { id: IGSID, username: "esteban_instaok" },
  to: { data: [fromBusiness ? { id: IGSID, username: "esteban_instaok" } : { id: IG, username: "ekoddex" }] },
  message: text,
});

function deps(messages: ReturnType<typeof msg>[]) {
  return {
    accounts: async () => [POLL_ACCOUNT],
    fetchConversations: async () => [{ id: "conv1", updated_time: iso(now()), messages: { data: [...messages].reverse() } }],
    webhook: {
      store,
      appId: "999",
      getAccount: async () => ACCOUNT,
      profile: async () => ({ name: "Esteban", username: "esteban_instaok" }),
      post: vi.fn(),
    },
  };
}

beforeEach(() => {
  store = new MemoryInboxStore();
  resetPollerCursors();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("pollInstagramDms", () => {
  it("trae los DMs nuevos como si fueran webhooks: entrantes y lo escrito desde la app de Instagram", async () => {
    const n = await pollInstagramDms(
      deps([msg("m1", false, "Holis", now() - 600), msg("m2", true, "Última prueba", now() - 300), msg("m3", false, "Gracias 🫂", now() - 60)])
    );
    expect(n).toBe(3);
    expect(store.conversations).toEqual([expect.objectContaining({ channel: "ig", phoneNumberId: IG, waId: IGSID, accountId: 1, handle: "@esteban_instaok" })]);
    expect(store.messages.map((m) => [m.wamid, m.direction, m.body])).toEqual([
      ["m1", "in", "Holis"],
      ["m2", "out", "Última prueba"],
      ["m3", "in", "Gracias 🫂"],
    ]);
    expect(store.conversations[0].unreadCount).toBe(2);
  });

  it("no importa mensajes anteriores a la conexión ni repite los ya guardados", async () => {
    const d = deps([msg("viejo", false, "De antes", now() - 3 * 3600), msg("m1", false, "Hola", now() - 60)]);
    await pollInstagramDms(d);
    await pollInstagramDms(d);
    resetPollerCursors(); // como si se reiniciara el server
    await pollInstagramDms(d);
    expect(store.messages.map((m) => m.wamid)).toEqual(["m1"]);
  });

  it("lo enviado desde la bandeja no se duplica cuando vuelve en la sincronización", async () => {
    const id = await store.upsertConversation(IG, IGSID, "Esteban", { channel: "ig", accountId: 1 });
    await store.insertMessage({ conversationId: id, wamid: "sent-1", direction: "out", type: "text", body: "Te respondo", status: "sent", messageAt: now() - 30 });
    // Copia de una respuesta por privado (sin mid)
    await store.insertMessage({ conversationId: id, wamid: null, direction: "out", type: "private_reply", body: "Te paso el precio", status: "sent", messageAt: now() - 20 });
    await pollInstagramDms(deps([msg("sent-1", true, "Te respondo", now() - 30), msg("pr-1", true, "Te paso el precio", now() - 20)]));
    expect(store.messages).toHaveLength(2);
  });

  it("si Meta falla en una cuenta sigue con las demás", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = deps([msg("m1", false, "Hola", now() - 60)]);
    let calls = 0;
    const n = await pollInstagramDms({
      ...ok,
      accounts: async () => [{ ...POLL_ACCOUNT, igUserId: "otra" }, POLL_ACCOUNT],
      fetchConversations: async (a) => {
        calls++;
        if (a.igUserId === "otra") throw new Error("(#190) token inválido");
        return ok.fetchConversations();
      },
    });
    expect(calls).toBe(2);
    expect(n).toBe(1);
  });

  it("si Meta avisa límite de llamadas (#80002), esa cuenta se deja de consultar un rato", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const d = {
      ...deps([]),
      fetchConversations: async () => {
        calls++;
        throw new MetaRateLimitError("(#80002) There have been too many calls to this Instagram account.", 30);
      },
    };
    await pollInstagramDms(d);
    await pollInstagramDms(d);
    await pollInstagramDms(d);
    expect(calls).toBe(1);
  });
});
