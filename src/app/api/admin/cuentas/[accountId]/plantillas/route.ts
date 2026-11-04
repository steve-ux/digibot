import { NextRequest, NextResponse } from "next/server";
import { requireAccountApi } from "@/lib/crm/api-auth";
import { accountHasWhatsApp, NO_WHATSAPP_MESSAGE } from "@/lib/crm/account-whatsapp";
import { createTemplate, listTemplates } from "@/lib/meta-whatsapp";

type Params = { params: Promise<{ accountId: string }> };

const notConfigured = (message = "Faltan las credenciales de WhatsApp Business en el servidor.") =>
  NextResponse.json({ error: "not_configured", message }, { status: 503 });

async function guard(rawAccountId: string) {
  const auth = await requireAccountApi(rawAccountId, "templates");
  if (auth.response) return auth.response;
  if (!(await accountHasWhatsApp(auth.accountId))) return notConfigured(NO_WHATSAPP_MESSAGE);
  return { accountId: auth.accountId };
}

export async function GET(req: NextRequest, { params }: Params) {
  const g = await guard((await params).accountId);
  if (g instanceof NextResponse) return g;
  try {
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    const templates = await listTemplates({ accountId: g.accountId, fresh });
    return NextResponse.json({ templates });
  } catch (err) {
    return NextResponse.json({ error: "meta_api_error", message: (err as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const g = await guard((await params).accountId);
  if (g instanceof NextResponse) return g;

  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.language || !body?.category || !Array.isArray(body?.components)) {
    return NextResponse.json(
      { error: "invalid_body", message: "Faltan campos requeridos (name, language, category, components)." },
      { status: 400 }
    );
  }

  try {
    const result = await createTemplate(g.accountId, body);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ error: "meta_api_error", message: (err as Error).message }, { status: 502 });
  }
}
