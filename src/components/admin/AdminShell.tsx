"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import Footer from "@/components/Footer";

export default function AdminShell({
  breadcrumb,
  children,
}: {
  breadcrumb: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/85 backdrop-blur-lg">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-6 py-4">
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

          <Link
            href="/"
            className="ml-auto text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
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
