import { redirect } from "next/navigation";
import { getCurrentUser, homePath } from "@/lib/crm/session";

export const dynamic = "force-dynamic";

// /admin -> el superadmin va al listado de cuentas; el resto, a la bandeja de su cuenta.
export default async function AdminIndexPage() {
  const me = await getCurrentUser();
  redirect(me ? homePath(me) : "/admin/login");
}
