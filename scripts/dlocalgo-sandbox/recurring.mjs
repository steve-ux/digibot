// Paso 4: cobro recurrente con el merchant_checkout_token de un pago ya aprobado.
// node --env-file=.env.local scripts/dlocalgo-sandbox/recurring.mjs <token> [amount] ; o: get <paymentId>
import { api } from "./lib.mjs";
const [a, b] = process.argv.slice(2);
if (a === "get") { const r = await api("GET", `/v1/payments/${b}`); console.log(r.status, JSON.stringify(r.json, null, 2)); process.exit(0); }
const orderId = process.argv[4] || `SBX-REC-${Date.now()}`;
const r = await api("POST", `/v1/payments/recurring/${a}`, { amount: Number(b || 10000), description: "Recurrente sandbox", order_id: orderId });
console.log(r.status, JSON.stringify(r.json, null, 2));
