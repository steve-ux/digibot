import type { Viewport } from "next";
import { cookies } from "next/headers";
import CrmShell from "@/components/crm/CrmShell";
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

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const [cookieStore, user] = await Promise.all([cookies(), getCurrentUser()]);
  const demo = cookieStore.get(DEMO_COOKIE)?.value === "1";

  return (
    <CrmShell user={{ name: user.name, roleLabel: ROLE_LABELS[user.role] }} initialDemo={demo}>
      {children}
    </CrmShell>
  );
}
