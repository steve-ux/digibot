import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxSendError, sendFromInbox, toRecipient } from "@/lib/wa-inbox/send";
import { MemoryInboxStore } from "./helpers/memory-store";
import { CUSTOMER_RECIPIENT, CUSTOMER_WA_ID, PHONE_NUMBER_ID } from "./helpers/payloads";

const SENT_WAMID = "wamid.HBgNNTQ5MjYxNTU1NTEyMzQVAgARGBI3QjM4QkI3NzM3MjU5NjYyODcA";

let store: MemoryInboxStore;
let fetchMock: ReturnType<typeof vi.fn>;

async function conversationWithInboundAt(secondsAgo: number | null) {
  const id = await store.upsertConversation(PHONE_NUMBER_ID, CUSTOMER_WA_ID, "Juan Pérez");
  if (secondsAgo !== null) {
    await store.recordActivity(id, {
      preview: "Hola",
      at: Math.floor(Date.now() / 1000) - secondsAgo,
      inbound: true,
    });
  }
  return id;
}

beforeEach(() => {
  // Sin DB_HOST la conexión cae a las variables de entorno (no se toca la base).
  vi.stubEnv("DB_HOST", "");
  vi.stubEnv("WHATSAPP_WABA_ID", "102290129340398");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
  vi.stubEnv("META_GRAPH_API_VERSION", "v23.0");
  store = new MemoryInboxStore();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendFromInbox", () => {
  it("envía el texto a la Cloud API y guarda el wamid con estado sent", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          messaging_product: "whatsapp",
          contacts: [{ input: CUSTOMER_WA_ID, wa_id: CUSTOMER_WA_ID }],
          messages: [{ id: SENT_WAMID }],
        }),
        { status: 200 }
      )
    );
    const conversationId = await conversationWithInboundAt(60);

    const { saved, error } = await sendFromInbox(conversationId, { type: "text", body: "¡Hola! ¿En qué te ayudo?" }, { store });

    expect(error).toBeNull();
    expect(saved).toMatchObject({ wamid: SENT_WAMID, status: "sent", direction: "out", body: "¡Hola! ¿En qué te ayudo?" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`);
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body)).toMatchObject({
      messaging_product: "whatsapp",
      to: CUSTOMER_RECIPIENT,
      type: "text",
      text: { body: "¡Hola! ¿En qué te ayudo?" },
    });

    expect((await store.getConversation(conversationId))!.lastMessagePreview).toBe("¡Hola! ¿En qué te ayudo?");
  });

  it("si Meta devuelve error guarda el mensaje como failed con código y título", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "(#131030) Recipient phone number not in allowed list",
            type: "OAuthException",
            code: 131030,
            error_data: { messaging_product: "whatsapp", details: "Recipient phone number not in allowed list" },
            fbtrace_id: "AbCdEf",
          },
        }),
        { status: 400 }
      )
    );
    const conversationId = await conversationWithInboundAt(60);

    const { saved, error } = await sendFromInbox(conversationId, { type: "text", body: "Hola" }, { store });

    expect(error).toEqual({ code: 131030, title: "(#131030) Recipient phone number not in allowed list" });
    expect(saved).toMatchObject({ status: "failed", errorCode: 131030, wamid: null });
  });

  it("con la ventana cerrada rechaza el texto libre sin llamar a Meta", async () => {
    const conversationId = await conversationWithInboundAt(25 * 60 * 60);

    await expect(sendFromInbox(conversationId, { type: "text", body: "Hola" }, { store })).rejects.toMatchObject({
      code: "window_closed",
      httpStatus: 409,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.messages).toHaveLength(0);
  });

  it("sin mensajes entrantes (last_inbound_at null) también rechaza el texto libre", async () => {
    const conversationId = await conversationWithInboundAt(null);
    await expect(sendFromInbox(conversationId, { type: "text", body: "Hola" }, { store })).rejects.toBeInstanceOf(
      InboxSendError
    );
  });

  it("con la ventana cerrada permite una plantilla aprobada", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: SENT_WAMID, message_status: "accepted" }] }), {
        status: 200,
      })
    );
    const conversationId = await conversationWithInboundAt(25 * 60 * 60);

    const { saved } = await sendFromInbox(
      conversationId,
      { type: "template", name: "seguimiento", language: "es_AR", headerParams: [], bodyParams: ["Juan"] },
      {
        store,
        findTemplates: async () => [
          {
            name: "seguimiento",
            language: "es_AR",
            category: "UTILITY",
            header: null,
            body: "Hola {{1}}, ¿pudiste ver la propuesta?",
            footer: null,
            headerVars: [],
            bodyVars: ["1"],
          },
        ],
      }
    );

    expect(saved).toMatchObject({ status: "sent", templateName: "seguimiento", body: "Hola Juan, ¿pudiste ver la propuesta?" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      type: "template",
      template: {
        name: "seguimiento",
        language: { code: "es_AR" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Juan" }] }],
      },
    });
  });
});

describe("toRecipient", () => {
  it("saca el 9 de los celulares de Argentina y el 1 de México", () => {
    expect(toRecipient("5492616998830")).toBe("542616998830");
    expect(toRecipient("5215512345678")).toBe("525512345678");
  });

  it("deja igual el resto de los números", () => {
    expect(toRecipient("542616998830")).toBe("542616998830");
    expect(toRecipient("5511987654321")).toBe("5511987654321");
    expect(toRecipient("15551820143")).toBe("15551820143");
  });
});
