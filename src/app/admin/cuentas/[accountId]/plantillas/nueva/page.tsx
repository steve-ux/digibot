import { redirect } from "next/navigation";
import NuevaPlantillaForm from "@/components/admin/NuevaPlantillaForm";
import { loadAccountPage } from "@/lib/crm/account-page";
import { accountHasWhatsApp } from "@/lib/crm/account-whatsapp";
import { accountPath } from "@/lib/crm/permissions";

export const dynamic = "force-dynamic";

// Sin WhatsApp conectado no se puede crear una plantilla: vuelve a la lista, que explica qué hacer.
export default async function NuevaPlantillaPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { account } = await loadAccountPage((await params).accountId, "templates");
  if (!(await accountHasWhatsApp(account.id))) redirect(accountPath(account.id, "plantillas"));
  return <NuevaPlantillaForm />;
}
