"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Logo from "@/components/Logo";
import { avatarColor, initialsOf } from "@/lib/crm/channels";
import Icon, { type IconName } from "./Icon";
import { ToastProvider } from "./Toast";
import { accountApi, accountPath, canAccess, type CrmRole, type Section } from "@/lib/crm/permissions";
import { DEMO_COOKIE } from "@/lib/crm/demo-cookie";

export interface CrmUser {
  id: number;
  name: string;
  role: CrmRole;
  roleLabel: string;
  // Cuenta de la persona (null = superadmin)
  accountId: number | null;
  // Acceso inicial con la contraseña compartida
  bootstrap: boolean;
}

export interface ShellAccount {
  id: number;
  name: string;
}

interface ShellContextValue {
  user: CrmUser;
  // Cuenta que se está mirando (de la URL). null en el listado de cuentas.
  account: ShellAccount | null;
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

// Id de la cuenta de la URL actual (para los componentes que arman links y llamadas).
export function useAccountId() {
  const { account } = useCrmShell();
  if (!account) throw new Error("useAccountId fuera de una cuenta");
  return account.id;
}

interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: IconName;
  mobile: boolean;
  section: Section;
}

function accountNav(accountId: number) {
  const main: NavItem[] = [
    { key: "inbox", href: accountPath(accountId, "conversaciones"), label: "Bandeja", icon: "inbox", mobile: true, section: "inbox" },
    { key: "metrics", href: accountPath(accountId, "metricas"), label: "Métricas", icon: "chart", mobile: true, section: "metrics" },
  ];
  const admin: NavItem[] = [
    { key: "team", href: accountPath(accountId, "equipo"), label: "Equipo", icon: "users", mobile: true, section: "team" },
    { key: "channels", href: accountPath(accountId, "canales"), label: "Canales", icon: "plug", mobile: true, section: "channels" },
    { key: "templates", href: accountPath(accountId, "plantillas"), label: "Plantillas", icon: "template", mobile: false, section: "templates" },
  ];
  return { main, admin };
}

const ACCOUNTS_ITEM: NavItem = {
  key: "accounts",
  href: "/admin/cuentas",
  label: "Cuentas",
  icon: "building",
  mobile: true,
  section: "accounts",
};

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

function SideLink({ item, active, badge }: { item: Pick<NavItem, "href" | "label" | "icon">; active: boolean; badge: number }) {
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
  accounts,
  initialDemo,
  children,
}: {
  user: CrmUser;
  // Cuentas que puede ver (superadmin: todas; el resto: la suya)
  accounts: ShellAccount[];
  initialDemo: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams<{ accountId?: string }>();
  const router = useRouter();
  const { dark, toggle } = useThemeToggle();
  const [demo, setDemoState] = useState(initialDemo);
  const [unread, setUnread] = useState(0);
  const [immersive, setImmersive] = useState(false);

  const accountId = Number(params?.accountId) || null;
  const account = useMemo<ShellAccount | null>(
    () => (accountId ? (accounts.find((a) => a.id === accountId) ?? { id: accountId, name: `Cuenta ${accountId}` }) : null),
    [accountId, accounts]
  );
  const isSuperadmin = user.role === "superadmin";
  const onInbox = accountId !== null && pathname.startsWith(accountPath(accountId, "conversaciones"));

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
    if (onInbox || demo || accountId === null) return;
    let cancelled = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(accountApi(accountId, "resumen"), { cache: "no-store" });
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
  }, [onInbox, demo, accountId]);

  useEffect(() => {
    if (!onInbox) setImmersive(false);
  }, [onInbox]);

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  const ctx = useMemo<ShellContextValue>(
    () => ({ user, account, demo, setDemo, reportInboxUnread: setUnread, setImmersive }),
    [user, account, demo, setDemo]
  );

  // El menú muestra solo lo que el rol puede usar (el control real está en el middleware y las APIs).
  const nav = accountId ? accountNav(accountId) : { main: [], admin: [] };
  const navMain = nav.main.filter((item) => canAccess(user.role, item.section));
  const navAdmin = nav.admin.filter((item) => canAccess(user.role, item.section));
  const settingsHref = accountId && canAccess(user.role, "settings") ? accountPath(accountId, "configuracion") : null;
  const templatesHref = navAdmin.find((i) => i.key === "templates")?.href ?? null;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const badgeFor = (key: string) => (key === "inbox" ? unread : 0);
  const homeHref = accountId ? accountPath(accountId) : "/admin/cuentas";
  const mobileItems = [...(isSuperadmin ? [ACCOUNTS_ITEM] : []), ...navMain, ...navAdmin].filter((i) => i.mobile);

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
            className="crm-scroll hidden w-[76px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-crm-border bg-crm-side px-3.5 py-5 md:flex lg:w-[236px]"
          >
            <Link
              href={homeHref}
              className="flex items-center justify-center gap-2.5 px-0 pb-[18px] pt-1 lg:justify-start lg:px-2.5"
            >
              <Logo size={30} />
              <span className="hidden font-poppins text-xl font-extrabold tracking-[-.5px] text-crm-ink lg:inline">
                DigiBot
              </span>
            </Link>

            {account && (
              <div
                className="mb-3 hidden items-center gap-2 rounded-field border border-crm-border bg-crm-surf px-3 py-2 lg:flex"
                title={`Cuenta #${account.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-crm-ink">{account.name}</div>
                  <div className="text-xs text-crm-muted">Cuenta #{account.id}</div>
                </div>
                {isSuperadmin && (
                  <Link
                    href="/admin/cuentas"
                    className="flex min-h-[32px] items-center rounded-pill px-2 text-xs font-bold text-crm-primary hover:bg-crm-tint"
                  >
                    Cambiar
                  </Link>
                )}
              </div>
            )}

            <nav className="flex flex-col gap-1">
              {isSuperadmin && (
                <SideLink item={ACCOUNTS_ITEM} active={pathname === "/admin/cuentas"} badge={0} />
              )}
              {navMain.map((item) => (
                <SideLink key={item.key} item={item} active={isActive(item.href)} badge={badgeFor(item.key)} />
              ))}
              {navAdmin.length > 0 && (
                <>
                  <div className="hidden px-3.5 pb-2 pt-[22px] text-[11px] font-bold tracking-[1.2px] text-crm-muted lg:block">
                    ADMINISTRACIÓN
                  </div>
                  <div className="mx-auto my-3 h-px w-8 bg-crm-border lg:hidden" aria-hidden />
                </>
              )}
              {navAdmin.map((item) => (
                <SideLink key={item.key} item={item} active={isActive(item.href)} badge={0} />
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

            {settingsHref && (
              <SideLink
                item={{ href: settingsHref, label: "Configuración", icon: "settings" }}
                active={isActive(settingsHref)}
                badge={0}
              />
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
                <Link href={homeHref} className="flex min-w-0 flex-1 items-center gap-2">
                  <Logo size={26} />
                  <span className="min-w-0">
                    <span className="block font-poppins text-lg font-extrabold leading-tight tracking-[-.5px]">DigiBot</span>
                    {account && (
                      <span className="block truncate text-[11px] font-semibold leading-tight text-crm-muted">
                        {account.name} · #{account.id}
                      </span>
                    )}
                  </span>
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
                {templatesHref && (
                  <Link
                    href={templatesHref}
                    aria-label="Plantillas"
                    className={`flex h-11 w-11 items-center justify-center rounded-full ${
                      isActive(templatesHref) ? "text-crm-primary" : "text-crm-nav"
                    }`}
                  >
                    <Icon name="template" />
                  </Link>
                )}
                {settingsHref && (
                  <Link
                    href={settingsHref}
                    aria-label="Configuración"
                    className={`flex h-11 w-11 items-center justify-center rounded-full ${
                      isActive(settingsHref) ? "text-crm-primary" : "text-crm-nav"
                    }`}
                  >
                    <Icon name="settings" />
                  </Link>
                )}
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
            {!immersive && mobileItems.length > 0 && (
              <nav
                aria-label="Menú principal"
                className="pb-safe flex shrink-0 border-t border-crm-border bg-crm-side md:hidden"
              >
                {mobileItems.map((item) => {
                  const active = item.key === "accounts" ? pathname === "/admin/cuentas" : isActive(item.href);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                        active ? "text-crm-primary" : "text-crm-muted"
                      }`}
                    >
                      <span className="relative flex">
                        <Icon name={item.icon} size={22} />
                        <Badge count={badgeFor(item.key)} compact />
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
