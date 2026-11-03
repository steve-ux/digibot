import { NextResponse } from "next/server";
import { notConfigured, requireAccountApi } from "@/lib/crm/api-auth";
import { canUseChannel } from "@/lib/crm/permissions";
import { isDbConfigured } from "@/lib/db";
import { getInboxStore } from "@/lib/wa-inbox/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accountId: string }> };

// Conversaciones de la cuenta (las más recientes primero).
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAccountApi((await params).accountId, "inbox");
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();

  try {
    const store = await getInboxStore();
    // Los agentes solo reciben las conversaciones de sus canales.
    const conversations = (await store.listConversations(auth.accountId, 500)).filter((c) =>
      canUseChannel(auth.user, c.channel)
    );
    return NextResponse.json({ accountId: auth.accountId, conversations });
  } catch (err) {
    console.error("[crm] No se pudieron listar las conversaciones:", err);
    return NextResponse.json(
      { error: "db_error", message: "No se pudieron cargar las conversaciones." },
      { status: 500 }
    );
  }
}
