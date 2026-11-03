import type { Viewport } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import CrmShell from "@/components/crm/CrmShell";
import { accountsForSwitcher } from "@/lib/crm/account-page";
import { DEMO_COOKIE } from "@/lib/crm/demo-cookie";
import { getCurrentUser, ROLE_LABELS } from "@/lib/crm/session";

// viewport-fit=cover habilita env(safe-area-inset-*) para la barra inferior y el composer;
// resizes-content hace que el teclado del celular achique el layout (el composer queda visible).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#171717" },
  ],
};

// Marco del panel para todo /admin/cuentas/... (la cuenta actual sale de la URL).
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const [cookieStore, user] = await Promise.all([cookies(), getCurrentUser()]);
  const demo = cookieStore.get(DEMO_COOKIE)?.value === "1";
  // Cookie válida pero la persona fue desactivada, cambió de rol o la cuenta se suspendió.
  if (!user) redirect("/admin/login?expirada=1");
  const accounts = await accountsForSwitcher(user);

  return (
    <CrmShell
      user={{
        id: user.id,
        name: user.name,
        role: user.role,
        roleLabel: ROLE_LABELS[user.role],
        accountId: user.accountId,
        bootstrap: Boolean(user.bootstrap),
      }}
      accounts={accounts}
      initialDemo={demo}
    >
      {children}
    </CrmShell>
  );
}
