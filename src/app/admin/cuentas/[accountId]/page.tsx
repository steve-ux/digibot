import { redirect } from "next/navigation";
import { accountPath } from "@/lib/crm/permissions";

// /admin/cuentas/7 -> /admin/cuentas/7/conversaciones
export default async function AccountIndexPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  redirect(accountPath(Number(accountId) || 0));
}
