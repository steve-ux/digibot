import { NextRequest, NextResponse } from "next/server";
import { channelsChanged, channelsRepo } from "@/lib/channels/api";
import { ConnectError, completeThreads, threadsRedirectUri } from "@/lib/channels/service";
import { accountPath, canAccess, canEnterAccount } from "@/lib/crm/permissions";
import { getCurrentUser, homePath } from "@/lib/crm/session";

export const dynamic = "force-dynamic";

// Vuelta del OAuth de Threads (tiene que coincidir con el "Redirect Callback URL" de la app).
// El state sellado dice a qué cuenta volver; se valida que la persona pueda configurarla.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/admin/login?expirada=1", req.url));
  const { searchParams } = req.nextUrl;
  const fail = (accountId: number | null, message: string) => {
    const back = new URL(accountId ? accountPath(accountId, "canales") : homePath(user), req.url);
    back.searchParams.set("error", message);
    return NextResponse.redirect(back);
  };

  if (searchParams.get("error")) return fail(user.accountId, "Cancelaste la conexión con Threads.");
  const repo = channelsRepo();
  if (!repo) return fail(user.accountId, "La base de datos no está configurada.");

  try {
    const { accountId, username } = await completeThreads(repo, {
      code: searchParams.get("code"),
      state: searchParams.get("state"),
      userId: user.id,
      redirectUri: threadsRedirectUri(req.headers),
      canConnect: (id) => canEnterAccount({ role: user.role, acc: user.accountId }, id) && canAccess(user.role, "channels"),
    });
    channelsChanged();
    const back = new URL(accountPath(accountId, "canales"), req.url);
    back.searchParams.set("conectado", `@${username}`);
    return NextResponse.redirect(back);
  } catch (err) {
    console.error("[canales] Falló la vuelta de Threads:", err);
    return fail(user.accountId, err instanceof ConnectError ? err.message : "No se pudo conectar Threads.");
  }
}
