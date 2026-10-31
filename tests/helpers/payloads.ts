// Payloads con la forma real de los webhooks de la WhatsApp Cloud API.

export const PHONE_NUMBER_ID = "106540352242922";
export const DISPLAY_PHONE = "5492612771419";
export const CUSTOMER_WA_ID = "5492615551234";
// Cómo hay que mandarle a ese mismo cliente (sin el 9 de celular argentino).
export const CUSTOMER_RECIPIENT = "542615551234";

function envelope(field: string, value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "102290129340398",
        changes: [
          {
            field,
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: DISPLAY_PHONE, phone_number_id: PHONE_NUMBER_ID },
              ...value,
            },
          },
        ],
      },
    ],
  };
}

export function textMessagePayload({
  wamid = "wamid.HBgNNTQ5MjYxNTU1NTEyMzQVAgASGBQzQTdCMDVBMkQ0RjMyRjc0Qjg1RQA=",
  body = "Hola",
  timestamp = String(Math.floor(Date.now() / 1000)),
  name = "Juan Pérez",
} = {}) {
  return envelope("messages", {
    contacts: [{ profile: { name }, wa_id: CUSTOMER_WA_ID }],
    messages: [
      {
        from: CUSTOMER_WA_ID,
        id: wamid,
        timestamp,
        text: { body },
        type: "text",
      },
    ],
  });
}

export function statusPayload(
  wamid: string,
  status: "sent" | "delivered" | "read" | "failed",
  timestamp = String(Math.floor(Date.now() / 1000))
) {
  const base: Record<string, unknown> = {
    id: wamid,
    status,
    timestamp,
    recipient_id: CUSTOMER_WA_ID,
  };
  if (status !== "failed") {
    base.conversation = {
      id: "ab1d5e0f6f9c0c2b7d5e6b2f1a3c4d5e",
      origin: { type: "service" },
    };
    base.pricing = { billable: true, pricing_model: "PMP", category: "service" };
  } else {
    base.errors = [
      {
        code: 131047,
        title: "Re-engagement message",
        message: "Re-engagement message",
        error_data: {
          details: "Message failed to send because more than 24 hours have passed since the customer last replied to this number.",
        },
        href: "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/",
      },
    ];
  }
  return envelope("messages", { statuses: [base] });
}
