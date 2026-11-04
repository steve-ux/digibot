import { NextRequest, NextResponse } from "next/server";
import { requireAccountApi } from "@/lib/crm/api-auth";
import { accountHasWhatsApp, NO_WHATSAPP_MESSAGE } from "@/lib/crm/account-whatsapp";
import { deleteTemplate } from "@/lib/meta-whatsapp";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ accountId: string; name: string }> }
) {
  const { accountId, name } = await params;
  const auth = await requireAccountApi(accountId, "templates");
  if (auth.response) return auth.response;

  if (!(await accountHasWhatsApp(auth.accountId))) {
    return NextResponse.json({ error: "not_configured", message: NO_WHATSAPP_MESSAGE }, { status: 503 });
  }

  try {
    await deleteTemplate(auth.accountId, name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "meta_api_error", message: (err as Error).message }, { status: 502 });
  }
}
