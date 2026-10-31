import { NextResponse } from "next/server";
import { isMetaConfigured } from "@/lib/meta-whatsapp";
import { listApprovedInboxTemplates } from "@/lib/wa-inbox/templates";

export const dynamic = "force-dynamic";

// Plantillas aprobadas para mandar cuando la ventana de 24 h está cerrada.
export async function GET() {
  if (!(await isMetaConfigured())) {
    return NextResponse.json(
      { error: "not_configured", message: "Faltan las credenciales de WhatsApp Business en el servidor." },
      { status: 503 }
    );
  }

  try {
    const templates = await listApprovedInboxTemplates();
    return NextResponse.json({ templates });
  } catch (err) {
    return NextResponse.json(
      { error: "meta_api_error", message: (err as Error).message },
      { status: 502 }
    );
  }
}
