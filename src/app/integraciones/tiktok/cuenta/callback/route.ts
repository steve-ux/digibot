import { NextRequest, NextResponse } from "next/server";
import { channelsChanged, channelsRepo } from "@/lib/channels/api";
import { ConnectError } from "@/lib/channels/service";
import { accountPath, canAccess, canEnterAccount } from "@/lib/crm/permissions";
import { getCurrentUser, homePath } from "@/lib/crm/session";
import { completeTikTok } from "@/lib/tiktok/connection";
import { syncRecentTikTokComments } from "@/lib/tiktok/ingest";

export const dynamic = "force-dynamic";

// Vuelta del OAuth de TikTok. Tiene que coincidir con la "TikTok account holder redirect URL"
// de la app (https://digibotlatam.com/integraciones/tiktok/cuenta/callback).
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

  if (searchParams.get("error")) {
    console.info("[tiktok] Autorización cancelada:", searchParams.get("error"), searchParams.get("error_description"));
    return fail(user.accountId, "Cancelaste la conexión con TikTok.");
  }
  const repo = channelsRepo();
  if (!repo) return fail(user.accountId, "La base de datos no está configurada.");

  try {
    const connected = await completeTikTok(repo, {
      code: searchParams.get("code") ?? searchParams.get("auth_code"),
      state: searchParams.get("state"),
      userId: user.id,
      headers: req.headers,
      canConnect: (id) => canEnterAccount({ role: user.role, acc: user.accountId }, id) && canAccess(user.role, "channels"),
    });
    channelsChanged();

    // Trae los comentarios recientes en segundo plano (no demora la vuelta al panel).
    const record = await repo.findSocial("tt", connected.openId);
    if (record) {
      void syncRecentTikTokComments(record, repo).catch((err) =>
        console.error("[tiktok] No se pudieron importar los comentarios recientes:", (err as Error).message)
      );
    }

    const back = new URL(accountPath(connected.accountId, "canales"), req.url);
    back.searchParams.set("conectado", connected.title);
    return NextResponse.redirect(back);
  } catch (err) {
    console.error("[tiktok] Falló la vuelta de TikTok:", err);
    return fail(user.accountId, err instanceof ConnectError ? err.message : "No se pudo conectar TikTok.");
  }
}
