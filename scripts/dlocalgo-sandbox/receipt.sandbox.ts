// Genera el comprobante PDF real de un pago de la cuenta de prueba (#3) en el scratchpad.
// SBX_PAYMENT_ID=1 SBX_OUT=archivo.pdf npx vitest run --config scripts/dlocalgo-sandbox/vitest.sandbox.config.ts receipt
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { getReceipt, renderReceiptPdf } from "@/lib/billing/receipt";
import { getMySqlBillingRepo } from "@/lib/billing/repo-mysql";

it("genera el comprobante de prueba", async () => {
  const receipt = await getReceipt(getMySqlBillingRepo(), 3, Number(process.env.SBX_PAYMENT_ID || 1), "PRUEBA SANDBOX - borrar", (k) => ({ basico: "Básico", premium: "Premium", plus: "Plus+" })[k] ?? k);
  expect(receipt).not.toBeNull();
  const pdf = await renderReceiptPdf(receipt!, readFileSync(path.join(process.cwd(), "public/billing/digibot-lockup.png")));
  writeFileSync(process.env.SBX_OUT!, pdf);
  console.log(receipt);
});
