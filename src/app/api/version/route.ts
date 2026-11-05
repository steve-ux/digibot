import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Versión que está corriendo en el servidor. El panel la compara con la de su
// propio bundle para avisar "hay una versión nueva, recargá" (pestañas abiertas
// desde antes del deploy) y la muestra en Configuración → Soporte.
export function GET() {
  return NextResponse.json(
    { version: process.env.APP_VERSION || null, buildTime: process.env.BUILD_TIME || null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
