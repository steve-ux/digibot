// Pasos 2-3 de la prueba sandbox: página local con SmartFields + confirmación + cobro recurrente.
// node --env-file=.env.local scripts/dlocalgo-sandbox/server.mjs   ->  http://localhost:4599
// La tarjeta se tokeniza en el navegador (iframe de dLocal Go); este server solo ve el cardToken.
import http from "node:http";
import { api, env } from "./lib.mjs";

const COUNTRY = process.env.SBX_COUNTRY || "AR", CURRENCY = process.env.SBX_CURRENCY || "ARS";
const AMOUNT = Number(process.env.SBX_AMOUNT || 10000);
const page = `<!doctype html><meta charset="utf-8"><title>Sandbox SmartFields</title>
<script src="${env.sdkUrl}"></script>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto">
<h2>Prueba sandbox DigiBot (${AMOUNT} ${CURRENCY})</h2>
<div id="card" style="border:1px solid #ccc;padding:10px;border-radius:8px;min-height:40px"></div>
<button id="pay" style="margin-top:16px;padding:10px 20px">Pagar</button>
<pre id="out" style="white-space:pre-wrap;background:#f4f4f4;padding:10px"></pre>
<script>
const out = (m) => { document.getElementById("out").textContent += m + String.fromCharCode(10); console.log("[sbx]", m); };
(async () => {
  const p = await (await fetch("/api/create", { method: "POST" })).json();
  out("pago creado: " + p.id + " token=" + (p.merchant_checkout_token||"").slice(0,6) + "…");
  window.__checkoutToken = p.merchant_checkout_token;
  await window.dlocalGo.initialize(${JSON.stringify(env.sfKey)}, p.merchant_checkout_token);
  const card = window.dlocalGo.fields().create("card", { style: { base: { fontSize: "16px" } } });
  card.mount(document.getElementById("card"));
  card.on && card.on("brand", (e) => out("brand evt " + JSON.stringify(e)));
  window.__card = card;
  document.getElementById("pay").onclick = async () => {
    try {
      const { token } = await window.dlocalGo.createCardToken(card, { name: "APRO Test" });
      out("cardToken ok");
      const r = await (await fetch("/api/confirm", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutToken: p.merchant_checkout_token, cardToken: token }) })).json();
      out("confirm: " + JSON.stringify(r));
      if (r.body && r.body.redirect_url) out("3DS -> " + r.body.redirect_url);
    } catch (e) { out("ERROR " + (e && (e.message || JSON.stringify(e)))); }
  };
})().catch((e) => out("init error " + e.message));
</script>`;

const readBody = (req) => new Promise((ok) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => ok(d ? JSON.parse(d) : {})); });
http.createServer(async (req, res) => {
  const send = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
  if (req.url === "/api/create") {
    const r = await api("POST", "/v1/payments", { amount: AMOUNT, currency: CURRENCY, country: COUNTRY,
      order_id: `SBX-TEST-${Date.now()}`, description: "Prueba sandbox DigiBot",
      notification_url: "https://digibotlatam.com/api/billing/dlocalgo/notifications",
      success_url: "http://localhost:4599/ok", back_url: "http://localhost:4599/back",
      allow_transparent: true, allow_recurring: true });
    console.log("create", r.status, r.json.id, r.json.merchant_checkout_token);
    return send(r.json);
  }
  if (req.url === "/api/confirm") {
    const { checkoutToken, cardToken } = await readBody(req);
    const r = await api("POST", `/v1/payments/confirm/${checkoutToken}`, { cardToken,
      clientFirstName: "Juan", clientLastName: "Perez", clientDocumentType: "DNI", clientDocument: "30123456",
      clientEmail: "sandbox-test@example.com" });
    console.log("confirm", r.status, JSON.stringify(r.json));
    return send({ status: r.status, body: r.json });
  }
  if (req.url?.startsWith("/ok") || req.url?.startsWith("/back")) { res.end("volviste a " + req.url); return; }
  res.setHeader("Content-Type", "text/html"); res.end(page);
}).listen(4599, () => console.log("http://localhost:4599"));
