import { redirect } from "next/navigation";
import WaAccountsView from "@/components/crm/cuentas/WaAccountsView";
import { getCurrentUser, homePath } from "@/lib/crm/session";

export const dynamic = "force-dynamic";

// Panel interno "Cuentas de WhatsApp": solo para superadmins.
export default async function WaAccountsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/admin/login?expirada=1");
  if (me.role !== "superadmin") redirect(homePath(me));
  return <WaAccountsView />;
}
