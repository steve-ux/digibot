import { NextRequest, NextResponse } from "next/server";
import { createTemplate, isMetaConfigured, listTemplates } from "@/lib/meta-whatsapp";

export async function GET() {
  if (!isMetaConfigured()) {
    return NextResponse.json(
      { error: "not_configured", message: "Faltan las credenciales de WhatsApp Business en el servidor." },
      { status: 503 }
    );
  }

  try {
    const templates = await listTemplates();
    return NextResponse.json({ templates });
  } catch (err) {
    return NextResponse.json(
      { error: "meta_api_error", message: (err as Error).message },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isMetaConfigured()) {
    return NextResponse.json(
      { error: "not_configured", message: "Faltan las credenciales de WhatsApp Business en el servidor." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.language || !body?.category || !Array.isArray(body?.components)) {
    return NextResponse.json(
      { error: "invalid_body", message: "Faltan campos requeridos (name, language, category, components)." },
      { status: 400 }
    );
  }

  try {
    const result = await createTemplate(body);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { error: "meta_api_error", message: (err as Error).message },
      { status: 502 }
    );
  }
}
