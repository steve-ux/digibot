// GET: comprobante de pago en PDF (no es factura fiscal). Solo pagos aprobados de esta cuenta;
// un pago de otra cuenta da 404. Lo puede bajar también una cuenta suspendida.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getReceipt, receiptFileName, renderReceiptPdf } from "@/lib/billing/receipt";
import { getMySqlBillingRepo } from "@/lib/billing/repo-mysql";
import { notConfigured, notFound, parseId, requireAccountApi } from "@/lib/crm/api-auth";
import { getAccountOrNull } from "@/lib/crm/account-page";
import { isDbConfigured } from "@/lib/db";
import { getPlans } from "@/lib/pricing-plans";

export const dynamic = "force-dynamic";

let logo: Uint8Array | null | undefined;
async function logoPng() {
  if (logo === undefined) {
    logo = await readFile(path.join(process.cwd(), "public", "billing", "digibot-lockup.png")).catch(() => null);
  }
  return logo ?? undefined;
}

export async function GET(_req: Request, { params }: { params: Promise<{ accountId: string; paymentId: string }> }) {
  const { accountId: rawAccountId, paymentId: rawPaymentId } = await params;
  const auth = await requireAccountApi(rawAccountId, "settings", { allowBillingLocked: true });
  if (auth.response) return auth.response;
  if (!isDbConfigured()) return notConfigured();
  const paymentId = parseId(rawPaymentId);
  if (!paymentId) return notFound("El comprobante no existe.");
  try {
    const [account, plans] = await Promise.all([getAccountOrNull(auth.accountId), getPlans()]);
    const planName = (k: string) => plans.find((p) => p.planKey === k)?.name ?? k;
    const receipt = await getReceipt(getMySqlBillingRepo(), auth.accountId, paymentId, account?.name ?? `Cuenta ${auth.accountId}`, planName);
    if (!receipt) return notFound("El comprobante no existe.");
    const pdf = await renderReceiptPdf(receipt, await logoPng());
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${receiptFileName(receipt)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[billing] comprobante:", err);
    return NextResponse.json({ error: "server_error", message: "No se pudo generar el comprobante." }, { status: 500 });
  }
}
