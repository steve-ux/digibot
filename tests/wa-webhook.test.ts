import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/webhooks/whatsapp/route";
import { setInboxStore } from "@/lib/wa-inbox/store";
import { MemoryInboxStore } from "./helpers/memory-store";
import { CUSTOMER_WA_ID, PHONE_NUMBER_ID, statusPayload, textMessagePayload } from "./helpers/payloads";

const APP_SECRET = "test-app-secret";
const VERIFY_TOKEN = "test-verify-token";
const URL_BASE = "https://digibotlatam.com/webhooks/whatsapp";

function signedRequest(payload: unknown, secret = APP_SECRET) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return new Request(URL_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": `sha256=${signature}` },
    body,
  });
}

let store: MemoryInboxStore;

beforeEach(() => {
  vi.stubEnv("META_APP_SECRET", APP_SECRET);
  vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", VERIFY_TOKEN);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  store = new MemoryInboxStore();
  setInboxStore(store);
});

afterEach(() => {
  setInboxStore(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /webhooks/whatsapp (verificación)", () => {
  it("devuelve el challenge en texto plano con el token correcto", async () => {
    const res = await GET(
      new Request(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1158201444`)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain");
    expect(await res.text()).toBe("1158201444");
  });

  it("devuelve 403 con un token inválido", async () => {
    const res = await GET(
      new Request(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1158201444`)
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /webhooks/whatsapp", () => {
  it("devuelve 403 si la firma no coincide", async () => {
    const res = await POST(signedRequest(textMessagePayload(), "otro-secreto"));
    expect(res.status).toBe(403);
    expect(store.messages).toHaveLength(0);
  });

  it("devuelve 403 si falta la firma", async () => {
    const res = await POST(
      new Request(URL_BASE, { method: "POST", body: JSON.stringify(textMessagePayload()) })
    );
    expect(res.status).toBe(403);
  });

  it("un mensaje de texto entrante crea la conversación y el mensaje", async () => {
    const res = await POST(signedRequest(textMessagePayload({ body: "Hola" })));
    expect(res.status).toBe(200);

    expect(store.conversations).toHaveLength(1);
    const conversation = (await store.getConversation(store.conversations[0].id))!;
    expect(conversation).toMatchObject({
      phoneNumberId: PHONE_NUMBER_ID,
      waId: CUSTOMER_WA_ID,
      contactName: "Juan Pérez",
      lastMessagePreview: "Hola",
      unreadCount: 1,
    });
    expect(conversation.lastInboundAt).not.toBeNull();
    expect(conversation.windowSecondsLeft).toBeGreaterThan(0);

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({ direction: "in", type: "text", body: "Hola", status: "received" });
  });

  it("el mismo wamid dos veces deja un solo mensaje", async () => {
    await POST(signedRequest(textMessagePayload()));
    const res = await POST(signedRequest(textMessagePayload()));
    expect(res.status).toBe(200);
    expect(store.messages).toHaveLength(1);
    expect(store.conversations[0].unreadCount).toBe(1);
  });

  it("guarda un placeholder legible para tipos no texto", async () => {
    const payload = textMessagePayload();
    const value = payload.entry[0].changes[0].value as unknown as { messages: Record<string, unknown>[] };
    const message = value.messages[0];
    message.type = "image";
    delete message.text;
    message.image = { mime_type: "image/jpeg", sha256: "abc", id: "1234567890" };

    await POST(signedRequest(payload));
    expect(store.messages[0]).toMatchObject({ type: "image", body: "[imagen]" });
  });

  it("ignora payloads desconocidos sin romper", async () => {
    const res = await POST(signedRequest({ object: "page", entry: [] }));
    expect(res.status).toBe(200);
  });

  describe("statuses", () => {
    const WAMID = "wamid.HBgNNTQ5MjYxNTU1NTEyMzQVAgARGBI1RjQyNUE3NEYxMzAzMzQ5MkEA";

    beforeEach(async () => {
      const conversationId = await store.upsertConversation(PHONE_NUMBER_ID, CUSTOMER_WA_ID, null);
      await store.insertMessage({
        conversationId,
        wamid: WAMID,
        direction: "out",
        type: "text",
        body: "Hola, ¿en qué te ayudo?",
        status: "sent",
        messageAt: Math.floor(Date.now() / 1000),
      });
    });

    it("delivered actualiza el mensaje", async () => {
      await POST(signedRequest(statusPayload(WAMID, "delivered")));
      expect(store.messages[0].status).toBe("delivered");
    });

    it("read actualiza el mensaje", async () => {
      await POST(signedRequest(statusPayload(WAMID, "delivered")));
      await POST(signedRequest(statusPayload(WAMID, "read")));
      expect(store.messages[0].status).toBe("read");
    });

    it("un delivered que llega después del read no retrocede el estado", async () => {
      await POST(signedRequest(statusPayload(WAMID, "read")));
      await POST(signedRequest(statusPayload(WAMID, "delivered")));
      expect(store.messages[0].status).toBe("read");
    });

    it("failed guarda el código y el título del error", async () => {
      await POST(signedRequest(statusPayload(WAMID, "failed")));
      expect(store.messages[0]).toMatchObject({
        status: "failed",
        errorCode: 131047,
        errorTitle: "Re-engagement message",
      });
    });
  });
});
