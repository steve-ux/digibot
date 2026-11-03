import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, parseSessionToken, type SessionPayload } from "@/lib/auth";
import { LEGACY_PAGES, accountPath, canAccess, canEnterAccount, parseAccountRoute } from "@/lib/crm/permissions";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Protección CSRF para las APIs del panel: además de la cookie sameSite=lax, se
// exige que los requests que modifican datos vengan del mismo origen. Se usa
// Sec-Fetch-Site (lo mandan todos los navegadores modernos y no depende de cómo
// el reverse proxy reescriba el Host); si no está, se compara Origin contra el host.
function isCrossSiteRequest(req: NextRequest) {
  if (SAFE_METHODS.has(req.method)) return false;

  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite !== "same-origin" && fetchSite !== "none";

  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

function homeFor(session: SessionPayload) {
  return session.role === "superadmin" || session.acc === null ? "/admin/cuentas" : accountPath(session.acc);
}

const json = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

// /admin/bandeja?c=12 -> /admin/cuentas/7/conversaciones/12 (links viejos y favoritos).
function legacyRedirect(req: NextRequest, session: SessionPayload) {
  const match = /^\/admin\/([^/]+)(\/.*)?$/.exec(req.nextUrl.pathname);
  const target = match && LEGACY_PAGES[match[1]];
  if (!target) return null;
  if (session.acc === null) return NextResponse.redirect(new URL("/admin/cuentas", req.url));
  const url = new URL(accountPath(session.acc, `${target}${match[2] ?? ""}`), req.url);
  const params = new URLSearchParams(req.nextUrl.searchParams);
  const chat = params.get("c");
  if (target === "conversaciones" && chat && /^\d+$/.test(chat)) {
    url.pathname = `${url.pathname}/${chat}`;
    params.delete("c");
  }
  url.search = params.toString();
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && isCrossSiteRequest(req)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  // Públicas: login e invitaciones (la persona invitada todavía no tiene sesión).
  const isPublic =
    pathname === "/admin/login" ||
    pathname === "/api/admin/login" ||
    pathname === "/api/admin/invitacion" ||
    pathname.startsWith("/admin/invitacion/");
  if (isPublic) return NextResponse.next();

  const session = await parseSessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    if (isApi) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const loginUrl = new URL("/admin/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!isApi) {
    const legacy = legacyRedirect(req, session);
    if (legacy) return legacy;
  }

  // Filtro por cuenta y rol con lo que dice la cookie; las APIs y páginas vuelven a validar contra la base.
  const route = parseAccountRoute(pathname);
  if (route === null) {
    return isApi ? json(404, "not_found", "La cuenta no existe.") : NextResponse.next();
  }
  if (route) {
    if (route.accountId !== null && !canEnterAccount(session, route.accountId)) {
      return isApi ? json(404, "not_found", "La cuenta no existe.") : NextResponse.redirect(new URL(homeFor(session), req.url));
    }
    if (route.section && !canAccess(session.role, route.section)) {
      if (isApi) return json(403, "forbidden", "No tenés permiso para hacer esto.");
      const fallback = route.accountId !== null ? accountPath(route.accountId) : homeFor(session);
      return NextResponse.redirect(new URL(fallback, req.url));
    }
  } else if (isApi && pathname.startsWith("/api/admin/superadmins") && session.role !== "superadmin") {
    return json(403, "forbidden", "No tenés permiso para hacer esto.");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
