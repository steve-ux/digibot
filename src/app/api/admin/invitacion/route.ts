import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { clientIp, hitRateLimit } from "@/lib/crm/rate-limit";
import { homePath } from "@/lib/crm/session";
import { acceptInvite, sessionFor, TeamError } from "@/lib/crm/team";
import { getMySqlUsersRepo } from "@/lib/crm/users-mysql";
import { isDbConfigured } from "@/lib/db";

// Pública (sin sesión): la persona invitada crea su contraseña y queda logueada.
export async function POST(req: NextRequest) {
  if (hitRateLimit(`invite:${clientIp(req.headers)}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "too_many_attempts", message: "Demasiados intentos. Esperá unos minutos." }, { status: 429 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "not_configured", message: "El panel no está configurado." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";
  try {
    const user = await acceptInvite(getMySqlUsersRepo(), token, password);
    const res = NextResponse.json({ ok: true, home: homePath(user) });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(sessionFor(user)), sessionCookieOptions);
    return res;
  } catch (err) {
    if (err instanceof TeamError) {
      return NextResponse.json({ error: "invalid", message: err.message, fields: err.fields }, { status: err.httpStatus });
    }
    console.error("[crm] No se pudo aceptar la invitación:", err);
    return NextResponse.json({ error: "server_error", message: "No se pudo crear la contraseña." }, { status: 500 });
  }
}
