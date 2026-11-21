import { NextRequest, NextResponse } from "next/server";
import { providerLockReason } from "@/lib/billing/entitlements";
import { accountPlanKey } from "@/lib/billing/account-plan";
import { ConnectError } from "@/lib/channels/service";
import { requireAccountApi } from "@/lib/crm/api-auth";
import { accountPath } from "@/lib/crm/permissions";
import { tiktokAuthorizeUrl } from "@/lib/tiktok/connection";

export const dynamic = "force-dynamic";

// Empieza el OAuth de TikTok: redirige a tiktok.com con un state sellado (cuenta + persona).
export async function GET(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAccountApi((await params).accountId, "channels");
  if (auth.response) return auth.response;
  const back = (message: string) => {
    const url = new URL(accountPath(auth.accountId, "canales"), req.url);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url);
  };
  const locked = providerLockReason(await accountPlanKey(auth.accountId), "tiktok");
  if (locked) return back(`Tu plan no incluye TikTok. ${locked}`);
  try {
    return NextResponse.redirect(tiktokAuthorizeUrl({ accountId: auth.accountId, userId: auth.user.id }, req.headers));
  } catch (err) {
    return back(err instanceof ConnectError ? err.message : "No se pudo iniciar la conexión con TikTok.");
  }
}
