// Helpers de la prueba sandbox de dLocal Go. Usa SOLO las variables *_SANDBOX.
export const env = {
  apiUrl: process.env.DLOCALGO_API_URL_SANDBOX,
  apiKey: process.env.DLOCALGO_API_KEY_SANDBOX,
  apiSecret: process.env.DLOCALGO_API_SECRET_SANDBOX,
  sfKey: process.env.DLOCALGO_SMARTFIELDS_KEY_SANDBOX,
  sdkUrl: process.env.DLOCALGO_SDK_URL_SANDBOX,
};
if (!env.apiUrl?.includes("sbx")) throw new Error("DLOCALGO_API_URL_SANDBOX no apunta a sandbox: abortado.");
export async function api(method, path, body) {
  const res = await fetch(env.apiUrl + path, {
    method,
    headers: { Authorization: `Bearer ${env.apiKey}:${env.apiSecret}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}
