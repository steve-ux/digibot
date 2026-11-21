import { redirect } from "next/navigation";
import CobrosView from "@/components/crm/cuentas/CobrosView";
import { getCurrentUser, homePath } from "@/lib/crm/session";

export const dynamic = "force-dynamic";

// Panel interno "Cobros": solo para superadmins.
export default async function CobrosPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/admin/login?expirada=1");
  if (me.role !== "superadmin") redirect(homePath(me));
  return <CobrosView />;
}
