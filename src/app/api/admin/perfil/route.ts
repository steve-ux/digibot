import { NextRequest, NextResponse } from "next/server";
import { notConfigured, requireApiUser } from "@/lib/crm/api-auth";
import { errorResponse } from "@/lib/crm/api-errors";
import { getProfile, setSoundPrefs } from "@/lib/crm/profile";
import { normalizeSoundPrefs } from "@/lib/crm/sound-prefs";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

// Perfil de quien está logueado (cualquier rol): foto y sonidos.
export async function GET() {
  const auth = await requireApiUser("inbox");
  if (auth.response) return auth.response;
  return NextResponse.json(await getProfile(auth.user.id));
}

// { sounds: { enabled, volume, channels } }
export async function PATCH(req: NextRequest) {
  const auth = await requireApiUser("inbox");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("sounds" in body)) {
    return NextResponse.json({ error: "invalid", message: "No hay nada para guardar." }, { status: 400 });
  }
  const sounds = normalizeSoundPrefs((body as { sounds: unknown }).sounds);
  try {
    await setSoundPrefs(auth.user.id, sounds);
    return NextResponse.json({ sounds });
  } catch (err) {
    return errorResponse(err, "No se pudieron guardar los sonidos. Si es la primera vez, falta correr la migración 0011.");
  }
}
