import { NextResponse } from "next/server";
import { currentBuild } from "@/lib/version";

export const dynamic = "force-dynamic";

// Versión que está corriendo en el servidor. El panel la compara con la de su
// propio bundle para avisar "hay una versión nueva, recargá" (pestañas abiertas
// desde antes del deploy) y la muestra en Configuración → Soporte.
export function GET() {
  return NextResponse.json(
    currentBuild(),
    { headers: { "Cache-Control": "no-store" } }
  );
}
