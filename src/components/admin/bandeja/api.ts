// Fuente de datos de la bandeja. La UI habla siempre con InboxApi: en modo real
// va contra /api/admin/cuentas/:cuenta/..., en modo demo contra un store en memoria
// (demo-api.ts) con los datos de ejemplo. Así la interfaz es una sola.

import type { ConversationAction } from "@/lib/crm/conversation-actions";
import { accountApi } from "@/lib/crm/permissions";
import type {
  InboxConversation,
  InboxMessage,
  InboxTemplate,
  MessageStatusUpdate,
} from "@/lib/wa-inbox/types";

export type ReplyMode = "public" | "private";

export type SendPayload =
  | { type: "text"; body: string; replyMode?: ReplyMode }
  | { type: "template"; name: string; language: string; headerParams: string[]; bodyParams: string[] }
  | { type: "note"; body: string }
  | { type: "retry"; messageId: number };

export interface SendResponse {
  // Guardado en la base: puede venir "sent" o "failed" con el código de Meta.
  saved: InboxMessage | null;
  // Rechazado antes de guardarse (ventana cerrada, validación, sin conexión…).
  error: { code: string; message: string } | null;
}

export interface MessagesResponse {
  conversation: InboxConversation;
  messages: InboxMessage[];
  statuses: MessageStatusUpdate[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string = "error"
  ) {
    super(message);
  }
}

export interface InboxApi {
  demo: boolean;
  listConversations(): Promise<InboxConversation[]>;
  loadMessages(conversationId: number, afterId: number): Promise<MessagesResponse>;
  send(conversationId: number, payload: SendPayload): Promise<SendResponse>;
  act(
    conversationId: number,
    action: ConversationAction
  ): Promise<{ conversation: InboxConversation; message: InboxMessage | null }>;
  templates(): Promise<InboxTemplate[]>;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor. Revisá tu conexión.", "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message || "Algo salió mal. Probá de nuevo.", data.error);
  return data as T;
}

const templatesCache = new Map<number, InboxTemplate[]>();
const apis = new Map<number, InboxApi>();

// Una instancia por cuenta (así useMemo no la recrea en cada render).
export function getRealApi(accountId: number): InboxApi {
  let api = apis.get(accountId);
  if (!api) {
    api = createRealApi(accountId);
    apis.set(accountId, api);
  }
  return api;
}

function createRealApi(accountId: number): InboxApi {
  const BASE = accountApi(accountId, "");
  return {
  demo: false,

  async listConversations() {
    const data = await request<{ conversations: InboxConversation[] }>(`${BASE}conversaciones`);
    return data.conversations;
  },

  loadMessages(conversationId, afterId) {
    return request<MessagesResponse>(`${BASE}conversaciones/${conversationId}/mensajes?after=${afterId}`);
  },

  async send(conversationId, payload) {
    let res: Response;
    try {
      res = await fetch(`${BASE}conversaciones/${conversationId}/mensajes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      return { saved: null, error: { code: "network", message: "No se pudo conectar con el servidor." } };
    }
    const data = await res.json().catch(() => ({}));
    if (data.saved) return { saved: data.saved, error: null };
    return {
      saved: null,
      error: { code: data.error || "error", message: data.message || "No se pudo enviar el mensaje." },
    };
  },

  act(conversationId, action) {
    return request(`${BASE}conversaciones/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
  },

  async templates() {
    const cached = templatesCache.get(accountId);
    if (cached) return cached;
    const data = await request<{ templates: InboxTemplate[] }>(`${BASE}plantillas-aprobadas`);
    templatesCache.set(accountId, data.templates);
    return data.templates;
  },
  };
}
