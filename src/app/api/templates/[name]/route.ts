import { NextRequest, NextResponse } from "next/server";
import { deleteTemplate, isMetaConfigured } from "@/lib/meta-whatsapp";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!isMetaConfigured()) {
    return NextResponse.json(
      { error: "not_configured", message: "Faltan las credenciales de WhatsApp Business en el servidor." },
      { status: 503 }
    );
  }

  const { name } = await params;

  try {
    await deleteTemplate(name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "meta_api_error", message: (err as Error).message },
      { status: 502 }
    );
  }
}
