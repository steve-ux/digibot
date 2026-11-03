// Arma el link de invitación con el dominio público (APP_URL, o el host que
// llegó por el proxy). Server-only.

export function inviteUrl(headers: Headers, token: string) {
  const base =
    process.env.APP_URL ||
    `${headers.get("x-forwarded-proto") || "https"}://${headers.get("x-forwarded-host") || headers.get("host")}`;
  return `${base.replace(/\/$/, "")}/admin/invitacion/${encodeURIComponent(token)}`;
}
