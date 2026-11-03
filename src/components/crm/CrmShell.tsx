"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Logo from "@/components/Logo";
import { avatarColor, initialsOf } from "@/lib/crm/channels";
import Icon, { type IconName } from "./Icon";
import { ToastProvider } from "./Toast";
import { DEMO_COOKIE } from "@/lib/crm/demo-cookie";

export interface CrmUser {
  name: string;
  roleLabel: string;
}

interface ShellContextValue {
  user: CrmUser;
  // Modo demo: datos de ejemplo en todas las pantallas hasta tener datos reales.
  demo: boolean;
  setDemo: (on: boolean) => void;
  // La bandeja informa sus no leídos para el badge del menú (evita un polling doble).
  reportInboxUnread: (count: number) => void;
  // En mobile, el chat abierto ocupa toda la pantalla: se ocultan las barras.
  setImmersive: (on: boolean) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function useCrmShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useCrmShell fuera de CrmShell");
  return ctx;
}


interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  mobile: boolean;
}

const NAV_MAIN: NavItem[] = [
  { href: "/admin/bandeja", label: "Bandeja", icon: "inbox", mobile: true },
  { href: "/admin/metricas", label: "Métricas", icon: "chart", mobile: true },
];

const NAV_ADMIN: NavItem[] = [
  { href: "/admin/equipo", label: "Equipo", icon: "users", mobile: true },
  { href: "/admin/canales", label: "Canales", icon: "plug", mobile: true },
  { href: "/admin/plantillas", label: "Plantillas", icon: "template", mobile: false },
];

const SUMMARY_POLL_MS = 20000;

function useThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage puede no estar disponible (modo privado, etc.)
    }
  };
  return { dark, toggle };
}

function Badge({ count, compact }: { count: number; compact?: boolean }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  if (compact) {
    return (
      <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-crm-primary px-1 text-[10px] font-bold text-white">
        {label}
      </span>
    );
  }
  return (
    <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-pill bg-crm-primary px-[7px] text-xs font-bold text-white">
      {label}
    </span>
  );
}

function SideLink({ item, active, badge }: { item: NavItem; active: boolean; badge: number }) {
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-[44px] w-full items-center justify-center gap-3 rounded-field px-3.5 py-[11px] text-[15px] font-semibold transition-colors lg:justify-start ${
        active ? "bg-crm-tint text-crm-primary" : "text-crm-nav hover:bg-crm-surf hover:text-crm-ink"
      }`}
    >
      <span className="relative flex">
        <Icon name={item.icon} />
        <span className="lg:hidden">
          <Badge count={badge} compact />
        </span>
      </span>
      <span className="hidden flex-1 lg:block">{item.label}</span>
      <span className="hidden lg:block">
        <Badge count={badge} />
      </span>
    </Link>
  );
}

export default function CrmShell({
  user,
  initialDemo,
  children,
}: {
  user: CrmUser;
  initialDemo: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { dark, toggle } = useThemeToggle();
  const [demo, setDemoState] = useState(initialDemo);
  const [unread, setUnread] = useState(0);
  const [immersive, setImmersive] = useState(false);
  const onInbox = pathname.startsWith("/admin/bandeja");

  const setDemo = useCallback(
    (on: boolean) => {
      document.cookie = `${DEMO_COOKIE}=${on ? "1" : "0"}; path=/admin; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      setDemoState(on);
      router.refresh();
    },
    [router]
  );

  // ?demo=1 / ?demo=0 en cualquier URL del panel prende o apaga el modo demo.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("demo");
    if (param === "1" || param === "0") {
      const on = param === "1";
      if (on !== demo) setDemo(on);
      const url = new URL(window.location.href);
      url.searchParams.delete("demo");
      window.history.replaceState(null, "", url.toString());
    }
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fuera de la bandeja, el badge se mantiene con un resumen liviano.
  useEffect(() => {
    if (onInbox || demo) return;
    let cancelled = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/admin/bandeja/resumen", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setUnread(Number(data.unread) || 0);
      } catch {
        // Sin conexión: se mantiene el último valor.
      }
    };
    load();
    const timer = setInterval(load, SUMMARY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [onInbox, demo]);

  useEffect(() => {
    if (!onInbox) setImmersive(false);
  }, [onInbox]);

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  const ctx = useMemo<ShellContextValue>(
    () => ({ user, demo, setDemo, reportInboxUnread: setUnread, setImmersive }),
    [user, demo, setDemo]
  );

  const isActive = (href: string) => pathname.startsWith(href);
  const badgeFor = (href: string) => (href === "/admin/bandeja" ? unread : 0);

  return (
    <ShellContext.Provider value={ctx}>
      <ToastProvider>
        <div className="crm-root flex h-[100dvh] overflow-hidden bg-crm-bg font-inter text-crm-ink antialiased">
          <a
            href="#crm-main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[300] focus:rounded-pill focus:bg-crm-primary focus:px-4 focus:py-2 focus:text-white"
          >
            Ir al contenido
          </a>

          {/* Sidebar: 236px desde 1024, 76px (solo íconos) entre 768 y 1023, oculto en mobile */}
          <aside
            aria-label="Menú principal"
            className="hidden w-[76px] shrink-0 flex-col gap-1 border-r border-crm-border bg-crm-side px-3.5 py-5 md:flex lg:w-[236px]"
          >
            <Link
              href="/admin/bandeja"
              className="flex items-center justify-center gap-2.5 px-0 pb-[22px] pt-1 lg:justify-start lg:px-2.5"
            >
              <Logo size={30} />
              <span className="hidden font-poppins text-xl font-extrabold tracking-[-.5px] text-crm-ink lg:inline">
                DigiBot
              </span>
            </Link>

            <nav className="flex flex-col gap-1">
              {NAV_MAIN.map((item) => (
                <SideLink key={item.href} item={item} active={isActive(item.href)} badge={badgeFor(item.href)} />
              ))}
              <div className="hidden px-3.5 pb-2 pt-[22px] text-[11px] font-bold tracking-[1.2px] text-crm-muted lg:block">
                ADMINISTRACIÓN
              </div>
              <div className="mx-auto my-3 h-px w-8 bg-crm-border lg:hidden" aria-hidden />
              {NAV_ADMIN.map((item) => (
                <SideLink key={item.href} item={item} active={isActive(item.href)} badge={0} />
              ))}
            </nav>

            <div className="flex-1" />

            {demo && (
              <button
                onClick={() => setDemo(false)}
                title="Estás viendo datos de ejemplo. Tocá para salir de la demo."
                className="mb-1 flex min-h-[44px] items-center justify-center gap-2 rounded-field border border-dashed border-crm-warn-border bg-crm-warn-soft px-3 text-xs font-bold text-crm-warn-ink lg:justify-start"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-crm-warn" />
                <span className="hidden lg:inline">Modo demo · Salir</span>
                <span className="lg:hidden">DEMO</span>
              </button>
            )}

            <button
              onClick={toggle}
              title="Cambiar tema"
              aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              className="flex min-h-[44px] w-full items-center justify-center gap-3 rounded-field px-3.5 py-[11px] text-sm font-semibold text-crm-nav transition-colors hover:bg-crm-surf hover:text-crm-ink lg:justify-start"
            >
              <Icon name={dark ? "sun" : "moon"} />
              <span className="hidden lg:inline">{dark ? "Modo claro" : "Modo oscuro"}</span>
            </button>

            <div className="mt-2 flex flex-col items-center gap-2 border-t border-crm-border px-0 pt-3.5 lg:flex-row lg:gap-2.5 lg:px-2">
              <div
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full font-poppins text-sm font-bold text-white"
                style={{ background: avatarColor(0) }}
                title={user.name}
              >
                {initialsOf(user.name)}
              </div>
              <div className="hidden min-w-0 flex-1 lg:block">
                <div className="truncate text-sm font-semibold text-crm-ink">{user.name}</div>
                <div className="text-xs text-crm-muted">{user.roleLabel}</div>
              </div>
              <button
                onClick={logout}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="flex h-11 w-11 items-center justify-center rounded-field text-crm-muted transition-colors hover:text-crm-error lg:h-[34px] lg:w-[34px]"
              >
                <Icon name="logout" size={18} />
              </button>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Barra superior mobile */}
            {!immersive && (
              <header className="flex h-14 shrink-0 items-center gap-1 border-b border-crm-border bg-crm-side pl-4 pr-2 pt-[env(safe-area-inset-top)] md:hidden">
                <Link href="/admin/bandeja" className="flex flex-1 items-center gap-2">
                  <Logo size={26} />
                  <span className="font-poppins text-lg font-extrabold tracking-[-.5px]">DigiBot</span>
                </Link>
                {demo && (
                  <button
                    onClick={() => setDemo(false)}
                    className="mr-1 rounded-pill border border-dashed border-crm-warn-border bg-crm-warn-soft px-2.5 py-1 text-[11px] font-bold text-crm-warn-ink"
                    title="Salir de la demo"
                  >
                    DEMO
                  </button>
                )}
                <Link
                  href="/admin/plantillas"
                  aria-label="Plantillas"
                  className={`flex h-11 w-11 items-center justify-center rounded-full ${
                    isActive("/admin/plantillas") ? "text-crm-primary" : "text-crm-nav"
                  }`}
                >
                  <Icon name="template" />
                </Link>
                <button
                  onClick={toggle}
                  aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-crm-nav"
                >
                  <Icon name={dark ? "sun" : "moon"} />
                </button>
                <button
                  onClick={logout}
                  aria-label="Cerrar sesión"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-crm-nav"
                >
                  <Icon name="logout" />
                </button>
              </header>
            )}

            <main id="crm-main" className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {children}
            </main>

            {/* Navegación inferior mobile */}
            {!immersive && (
              <nav
                aria-label="Menú principal"
                className="pb-safe flex shrink-0 border-t border-crm-border bg-crm-side md:hidden"
              >
                {[...NAV_MAIN, ...NAV_ADMIN]
                  .filter((item) => item.mobile)
                  .map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                          active ? "text-crm-primary" : "text-crm-muted"
                        }`}
                      >
                        <span className="relative flex">
                          <Icon name={item.icon} size={22} />
                          <Badge count={badgeFor(item.href)} compact />
                        </span>
                        {item.label}
                      </Link>
                    );
                  })}
              </nav>
            )}
          </div>
        </div>
      </ToastProvider>
    </ShellContext.Provider>
  );
}
