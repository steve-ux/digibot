"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import Footer from "@/components/Footer";

const NAV_LINKS = [
  { href: "/admin/plantillas", label: "Plantillas de WhatsApp" },
  { href: "/admin/bandeja", label: "Bandeja" },
];

export default function AdminShell({
  breadcrumb,
  children,
}: {
  breadcrumb: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/85 backdrop-blur-lg">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-6 py-4">
          <Link href="/admin/plantillas" className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="font-poppins text-lg font-extrabold text-foreground">
              DigiBot
            </span>
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium text-muted-foreground">
            Panel interno
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold text-foreground">
            {breadcrumb}
          </span>

          <nav className="ml-auto flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "text-primary" : "text-muted-foreground hover:text-primary"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            Ver sitio
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-10">{children}</main>

      <Footer />
    </div>
  );
}
