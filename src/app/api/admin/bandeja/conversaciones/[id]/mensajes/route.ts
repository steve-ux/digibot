import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { InboxSendError, sendFromInbox, type SendInput } from "@/lib/wa-inbox/send";
import { getInboxStore } from "@/lib/wa-inbox/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const notConfigured = () =>
  NextResponse.json(
    { error: "not_configured", message: "Faltan las variables de conexión a la base de datos." },
    { status: 503 }
  );

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Polling del chat abierto: mensajes con id > after, estados recientes de los
// salientes (para actualizar ✓/✓✓) y la conversación (ventana de 24 h).
// Abrir/consultar la conversación la marca como leída.
export async function GET(req: NextRequest, { params }: Params) {
  if (!isDbConfigured()) return notConfigured();

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "not_found", message: "Conversación inválida." }, { status: 404 });

  const after = Math.max(0, Number(req.nextUrl.searchParams.get("after")) || 0);

  try {
    const store = await getInboxStore();
    await store.markConversationRead(id);
    const conversation = await store.getConversation(id);
    if (!conversation) {
      return NextResponse.json({ error: "not_found", message: "La conversación no existe." }, { status: 404 });
    }

    const [messages, statuses] = await Promise.all([
      store.listMessages(id, after, 200),
      store.recentOutboundStatuses(id, 50),
    ]);
    return NextResponse.json({ conversation, messages, statuses });
  } catch (err) {
    console.error("[wa-inbox] No se pudieron cargar los mensajes:", err);
    return NextResponse.json(
      { error: "db_error", message: "No se pudieron cargar los mensajes." },
      { status: 500 }
    );
  }
}

function parseSendInput(body: unknown): SendInput | null {
  const data = body as Record<string, unknown> | null;
  if (data?.type === "text" && typeof data.body === "string") {
    return { type: "text", body: data.body };
  }
  const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string");
  if (
    data?.type === "template" &&
    typeof data.name === "string" &&
    typeof data.language === "string"
  ) {
    const headerParams = data.headerParams ?? [];
    const bodyParams = data.bodyParams ?? [];
    if (!isStringArray(headerParams) || !isStringArray(bodyParams)) return null;
    return { type: "template", name: data.name, language: data.language, headerParams, bodyParams };
  }
  return null;
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!isDbConfigured()) return notConfigured();

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "not_found", message: "Conversación inválida." }, { status: 404 });

  const input = parseSendInput(await req.json().catch(() => null));
  if (!input) {
    return NextResponse.json(
      { error: "invalid_body", message: "Mandá { type: \"text\", body } o { type: \"template\", name, language, ... }." },
      { status: 400 }
    );
  }

  try {
    const { saved, error } = await sendFromInbox(id, input);
    if (error) {
      return NextResponse.json(
        { error: "meta_api_error", message: error.title, saved },
        { status: 502 }
      );
    }
    return NextResponse.json({ saved }, { status: 201 });
  } catch (err) {
    if (err instanceof InboxSendError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.httpStatus });
    }
    console.error("[wa-inbox] Error al enviar el mensaje:", err);
    return NextResponse.json(
      { error: "server_error", message: "No se pudo enviar el mensaje." },
      { status: 500 }
    );
  }
}
