import { NextResponse } from "next/server";
import { requireAccountApi } from "@/lib/crm/api-auth";
import { accountHasWhatsApp, NO_WHATSAPP_MESSAGE } from "@/lib/crm/account-whatsapp";
import { listApprovedInboxTemplates } from "@/lib/wa-inbox/templates";

export const dynamic = "force-dynamic";

// Plantillas aprobadas para mandar cuando la ventana de 24 h está cerrada.
export async function GET(_req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "inbox");
  if (auth.response) return auth.response;
  if (!(await accountHasWhatsApp(auth.accountId))) {
    return NextResponse.json({ error: "not_configured", message: NO_WHATSAPP_MESSAGE }, { status: 503 });
  }

  try {
    const templates = await listApprovedInboxTemplates(auth.accountId);
    return NextResponse.json({ templates });
  } catch (err) {
    return NextResponse.json({ error: "meta_api_error", message: (err as Error).message }, { status: 502 });
  }
}
