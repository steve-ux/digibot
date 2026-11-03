import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  checkAdminPassword,
  createSessionToken,
  sessionCookieOptions,
  type SessionInput,
} from "@/lib/auth";
import { getMySqlAccountsRepo } from "@/lib/crm/accounts-mysql";
import { clearRateLimit, clientIp, hitRateLimit } from "@/lib/crm/rate-limit";
import { BOOTSTRAP_USER_ID, homePath, isBootstrapMode } from "@/lib/crm/session";
import { authenticate, sessionFor } from "@/lib/crm/team";
import { getMySqlUsersRepo } from "@/lib/crm/users-mysql";
import { isDbConfigured } from "@/lib/db";

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

// ¿Se puede entrar con la contraseña compartida? (lo usa la pantalla de login para el aviso)
export async function GET() {
  return NextResponse.json({ bootstrap: await isBootstrapMode() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const limitKey = `login:${clientIp(req.headers)}`;
  if (hitRateLimit(limitKey, MAX_ATTEMPTS, WINDOW_MS)) {
    return NextResponse.json(
      { error: "too_many_attempts", message: "Demasiados intentos. Esperá unos minutos y probá de nuevo." },
      { status: 429 }
    );
  }

  let session: SessionInput | null = null;

  if (email && isDbConfigured()) {
    try {
      const user = await authenticate(getMySqlUsersRepo(), email, password);
      if (user) {
        // Cuenta suspendida: no entra nadie de esa cuenta (el superadmin no tiene cuenta).
        if (user.role !== "superadmin" && user.accountId !== null) {
          const account = await getMySqlAccountsRepo().get(user.accountId);
          if (!account || account.status === "suspended") {
            return NextResponse.json(
              { error: "account_suspended", message: "Esta cuenta está suspendida. Escribinos a DigiBot para reactivarla." },
              { status: 403 }
            );
          }
        }
        session = sessionFor(user);
      }
    } catch (err) {
      console.error("[crm] Error al validar el login:", (err as Error).message);
    }
  }

  // Acceso inicial (superadmin): solo mientras no haya ningún superadmin activo.
  if (!session && checkAdminPassword(password) && (await isBootstrapMode())) {
    session = { uid: BOOTSTRAP_USER_ID, role: "superadmin", acc: null, ver: 0 };
  }

  if (!session) {
    return NextResponse.json(
      { error: "invalid_credentials", message: "El email o la contraseña no son correctos." },
      { status: 401 }
    );
  }

  clearRateLimit(limitKey);
  const res = NextResponse.json({ ok: true, role: session.role, home: homePath({ role: session.role, accountId: session.acc }) });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(session), sessionCookieOptions);
  return res;
}
