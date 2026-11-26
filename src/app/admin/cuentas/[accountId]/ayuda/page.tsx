import AyudaView from "@/components/crm/ayuda/AyudaView";
import { loadAccountPage } from "@/lib/crm/account-page";
import { faqFor } from "@/lib/crm/help-faq";
import { canAccess } from "@/lib/crm/permissions";

export const dynamic = "force-dynamic";

// Ayuda: chat con el bot de soporte de la plataforma + preguntas frecuentes. Todos los roles.
export default async function AyudaPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  // billingPage: una cuenta suspendida también puede entrar a pedir ayuda.
  const { me, account } = await loadAccountPage(accountId, "inbox", { billingPage: true });
  const canManage = canAccess(me.role, "settings");
  return <AyudaView accountId={account.id} faq={faqFor(canManage)} />;
}
