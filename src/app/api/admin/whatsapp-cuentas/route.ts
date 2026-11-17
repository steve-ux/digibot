import { NextResponse } from "next/server";
import { notConfigured } from "@/lib/crm/api-auth";
import { getMySqlAccountsRepo } from "@/lib/crm/accounts-mysql";
import { requireSuperadmin } from "@/lib/crm/superadmin-api";
import { isDbConfigured } from "@/lib/db";
import { listUnreadNotifications } from "@/lib/notifications";
import { listPanelRows } from "@/lib/whatsapp-accounts/panel";

export const dynamic = "force-dynamic";

// Panel interno: todas las conexiones de WhatsApp y los avisos para superadmins.
export async function GET() {
  const auth = await requireSuperadmin();
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  try {
    const names = new Map((await getMySqlAccountsRepo().list()).map((a) => [a.id, a.name]));
    const [accounts, notifications] = await Promise.all([listPanelRows(names), listUnreadNotifications(null, 20)]);
    return NextResponse.json({ accounts, notifications });
  } catch (err) {
    console.error("[wa-panel] No se pudieron listar las cuentas:", err);
    return NextResponse.json({ error: "db_error", message: "No se pudieron cargar las cuentas de WhatsApp." }, { status: 500 });
  }
}
