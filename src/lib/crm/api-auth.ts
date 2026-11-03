// Control de acceso de las APIs del panel. Server-only.
// El middleware ya filtra por rol y cuenta con la cookie; acá se vuelve a validar
// contra la base (persona activa, rol vigente, misma cuenta) y por canal.

import { NextResponse } from "next/server";
import type { ChannelId } from "./channels";
import { canAccess, canEnterAccount, canUseChannel, type Section } from "./permissions";
import { getCurrentUser, type CrmUser } from "./session";

export type ApiAuth = { user: CrmUser; response?: undefined } | { user?: undefined; response: NextResponse };
export type AccountApiAuth =
  | { user: CrmUser; accountId: number; response?: undefined }
  | { user?: undefined; accountId?: undefined; response: NextResponse };

const unauthorized = () =>
  NextResponse.json({ error: "unauthorized", message: "Tu sesión venció. Volvé a entrar." }, { status: 401 });

export function forbidden(message = "No tenés permiso para hacer esto.") {
  return NextResponse.json({ error: "forbidden", message }, { status: 403 });
}

export function notFound(message = "No existe.") {
  return NextResponse.json({ error: "not_found", message }, { status: 404 });
}

export async function requireApiUser(section: Section): Promise<ApiAuth> {
  const user = await getCurrentUser();
  if (!user) return { response: unauthorized() };
  if (!canAccess(user.role, section)) return { response: forbidden() };
  return { user };
}

// Para todo lo que cuelga de /api/admin/cuentas/:cuenta. Una cuenta ajena da 404.
export async function requireAccountApi(rawAccountId: string, section: Section): Promise<AccountApiAuth> {
  const user = await getCurrentUser();
  if (!user) return { response: unauthorized() };
  const accountId = Number(rawAccountId);
  if (!Number.isSafeInteger(accountId) || accountId <= 0 || !canEnterAccount({ role: user.role, acc: user.accountId }, accountId)) {
    return { response: notFound("La cuenta no existe.") };
  }
  if (!canAccess(user.role, section)) return { response: forbidden() };
  return { user, accountId };
}

export function parseId(raw: string) {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Para conversaciones: un agente solo opera sobre los canales que tiene asignados.
// Se responde 404 (no 403) para no confirmar que la conversación existe.
export function channelDenied(user: CrmUser, channel: ChannelId) {
  if (canUseChannel(user, channel)) return null;
  return notFound("La conversación no existe.");
}

// Carga una conversación verificando que sea de la cuenta y que quien pide pueda verla.
export async function conversationFor(user: CrmUser, accountId: number, id: number) {
  const { getInboxStore } = await import("../wa-inbox/store");
  const conversation = await (await getInboxStore()).getConversation(id);
  if (!conversation || conversation.accountId !== accountId) {
    return { response: notFound("La conversación no existe.") };
  }
  const denied = channelDenied(user, conversation.channel);
  return denied ? { response: denied } : { conversation };
}

export const notConfigured = () =>
  NextResponse.json(
    { error: "not_configured", message: "Faltan las variables de conexión a la base de datos." },
    { status: 503 }
  );
