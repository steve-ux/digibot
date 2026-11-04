import { NextRequest, NextResponse } from "next/server";
import { ConnectError, threadsAuthorizeUrl } from "@/lib/channels/service";
import { requireAccountApi } from "@/lib/crm/api-auth";
import { accountPath } from "@/lib/crm/permissions";

export const dynamic = "force-dynamic";

// Empieza el OAuth de Threads: redirige a threads.net con un state sellado (cuenta + persona).
export async function GET(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "channels");
  if (auth.response) return auth.response;
  try {
    return NextResponse.redirect(threadsAuthorizeUrl({ accountId: auth.accountId, userId: auth.user.id }, req.headers));
  } catch (err) {
    const message = err instanceof ConnectError ? err.message : "No se pudo iniciar la conexión con Threads.";
    const back = new URL(accountPath(auth.accountId, "canales"), req.url);
    back.searchParams.set("error", message);
    return NextResponse.redirect(back);
  }
}
