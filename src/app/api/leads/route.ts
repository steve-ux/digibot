import { NextRequest, NextResponse } from "next/server";
import { getPool, isDbConfigured } from "@/lib/db";

// Acepta letras (con acentos), espacios, apóstrofes y guiones.
const NAME_RE = /^[\p{L}\s'.-]{2,120}$/u;
// Teléfono: dígitos, espacios, +, guiones y paréntesis; al menos 6 dígitos reales.
const PHONE_RE = /^[+()\d\s-]{6,30}$/;

export async function POST(req: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "not_configured", message: "La base de datos no está configurada en el servidor." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const acceptedPolicy = body?.acceptedPolicy === true;
  // Honeypot: campo oculto que un humano nunca completa.
  const website = typeof body?.website === "string" ? body.website.trim() : "";

  if (website) {
    // Bot detectado: respondemos ok sin guardar nada, para no darle pistas.
    return NextResponse.json({ ok: true });
  }

  if (!NAME_RE.test(name)) {
    return NextResponse.json(
      { error: "invalid_name", message: "Ingresá un nombre válido." },
      { status: 400 }
    );
  }

  if (!PHONE_RE.test(phone) || phone.replace(/\D/g, "").length < 6) {
    return NextResponse.json(
      { error: "invalid_phone", message: "Ingresá un número de teléfono válido." },
      { status: 400 }
    );
  }

  if (!acceptedPolicy) {
    return NextResponse.json(
      { error: "policy_not_accepted", message: "Tenés que aceptar la política de privacidad." },
      { status: 400 }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 255) || null;

  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO web_leads (name, phone, accepted_policy, source, ip, user_agent)
       VALUES (?, ?, 1, 'landing_contact_form', ?, ?)`,
      [name, phone, ip, userAgent]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error guardando lead:", err);
    return NextResponse.json(
      { error: "db_error", message: "No pudimos guardar tu contacto. Probá de nuevo en un momento." },
      { status: 502 }
    );
  }
}
