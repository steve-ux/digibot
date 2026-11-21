// Paso 1: crea un pago con allow_transparent + allow_recurring (sandbox).
// node --env-file=.env.local scripts/dlocalgo-sandbox/create-payment.mjs [country] [currency] [amount]
import { api } from "./lib.mjs";
const [country = "AR", currency = "ARS", amount = "1000"] = process.argv.slice(2);
const r = await api("POST", "/v1/payments", {
  amount: Number(amount), currency, country, order_id: `SBX-TEST-${Date.now()}`,
  description: "Prueba sandbox DigiBot",
  notification_url: "https://digibotlatam.com/api/billing/dlocalgo/notifications",
  success_url: "http://localhost:4599/ok", back_url: "http://localhost:4599/back",
  allow_transparent: true, allow_recurring: true,
});
console.log(r.status, JSON.stringify(r.json, null, 2));
