import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";

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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/") && isCrossSiteRequest(req)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  const isLoginPage = pathname === "/admin/login";
  const isAuthApi = pathname === "/api/admin/login";

  if (isLoginPage || isAuthApi) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authenticated = await isValidSessionToken(token);

  if (authenticated) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/templates/:path*", "/api/admin/:path*"],
};
