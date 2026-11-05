import { NextRequest, NextResponse } from "next/server";
import { notConfigured, notFound, requireApiUser } from "@/lib/crm/api-auth";
import { errorResponse } from "@/lib/crm/api-errors";
import { avatarUrl, clearAvatar, getAvatar, parseAvatarDataUrl, setAvatar } from "@/lib/crm/profile";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

// La foto de quien está logueado. ?u=<id>&v=<versión>: con la versión en la URL se
// cachea sin vencer (una foto nueva cambia la URL); ?u evita mostrar la de otra persona.
export async function GET(req: NextRequest) {
  const auth = await requireApiUser("inbox");
  if (auth.response) return auth.response;
  const u = req.nextUrl.searchParams.get("u");
  if (u !== null && u !== String(auth.user.id)) return notFound();
  if (!isDbConfigured()) return notFound();
  try {
    const avatar = await getAvatar(auth.user.id);
    if (!avatar) return notFound();
    return new NextResponse(new Uint8Array(avatar.data), {
      headers: {
        "Content-Type": avatar.mime,
        "Cache-Control": req.nextUrl.searchParams.has("v") ? "private, max-age=31536000, immutable" : "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err, "No se pudo leer la foto.");
  }
}

// { image: "data:image/webp;base64,..." } (ya recortada en el navegador)
export async function PUT(req: NextRequest) {
  const auth = await requireApiUser("inbox");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const body = await req.json().catch(() => null);
  const parsed = parseAvatarDataUrl(body?.image);
  if ("error" in parsed) return NextResponse.json({ error: "invalid", message: parsed.error }, { status: 400 });
  try {
    const version = await setAvatar(auth.user.id, parsed.mime, parsed.data);
    return NextResponse.json({ avatarUrl: avatarUrl(auth.user.id, version) });
  } catch (err) {
    return errorResponse(err, "No se pudo guardar la foto. Si es la primera vez, falta correr la migración 0011.");
  }
}

export async function DELETE() {
  const auth = await requireApiUser("inbox");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  try {
    await clearAvatar(auth.user.id);
    return NextResponse.json({ avatarUrl: null });
  } catch (err) {
    return errorResponse(err, "No se pudo quitar la foto.");
  }
}
