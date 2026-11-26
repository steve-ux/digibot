import { NextResponse } from "next/server";
import { requireAccountApi } from "@/lib/crm/api-auth";

export const dynamic = "force-dynamic";

// Chat de Ayuda: reenvía la consulta al bot de soporte de la plataforma (n8n).
// La URL del webhook queda en el servidor (HELP_BOT_WEBHOOK_URL) y los datos de
// quién pregunta salen de la sesión, no del navegador.

const TIMEOUT_MS = 45_000;
const MAX_MESSAGE = 2000;

// n8n puede devolver texto plano o JSON con distintos nombres de campo.
function replyText(data: unknown): string | null {
  if (typeof data === "string") return data.trim() || null;
  if (Array.isArray(data)) return replyText(data[0]);
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  for (const key of ["reply", "response", "answer", "output", "message", "text"]) {
    if (typeof o[key] === "string" && (o[key] as string).trim()) return (o[key] as string).trim();
  }
  for (const key of ["data", "result", "json"]) {
    const nested = o[key] ? replyText(o[key]) : null;
    if (nested) return nested;
  }
  return null;
}

export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  // Una cuenta suspendida también puede pedir ayuda (por ejemplo, para pagar).
  const auth = await requireAccountApi((await params).accountId, "inbox", { allowBillingLocked: true });
  if (auth.response) return auth.response;

  const body = (await req.json().catch(() => null)) as { message?: unknown; sessionId?: unknown; source?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE) : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.slice(0, 100) : "";
  if (!message) return NextResponse.json({ error: "empty", message: "Escribí tu consulta." }, { status: 400 });

  const url = process.env.HELP_BOT_WEBHOOK_URL;
  if (!url) {
    return NextResponse.json(
      { error: "not_configured", message: "El asistente todavía no está conectado." },
      { status: 503 }
    );
  }

  const { user } = auth;
  const payload = {
    message,
    session_id: sessionId || `u${user.id}`,
    source: typeof body?.source === "string" ? body.source.slice(0, 20) : "composer",
    screen: "ayuda",
    account_id: auth.accountId,
    user_id: user.id,
    user_name: user.name,
    role: user.role,
    billing_locked: Boolean(user.billingLocked),
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        ...(process.env.HELP_BOT_WEBHOOK_SECRET ? { "X-DigiBot-Secret": process.env.HELP_BOT_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`El webhook respondió ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    const data: unknown = type.includes("application/json") ? await res.json() : await res.text();
    return NextResponse.json({ reply: replyText(data) ?? "Recibí tu consulta. En breve te respondo." });
  } catch (err) {
    console.error("[ayuda] No respondió el bot de soporte:", (err as Error).message);
    return NextResponse.json(
      { error: "bot_error", message: "No pude responder en este momento. Probá de nuevo en unos segundos." },
      { status: 502 }
    );
  }
}
