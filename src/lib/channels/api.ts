// Utilidades de las rutas de Canales. Server-only.

import { NextResponse } from "next/server";
import { isDbConfigured } from "../db";
import { resetSocialAccountsCache } from "../meta-social/accounts";
import { resetWhatsAppConnectionsCache } from "../whatsapp-connections";
import { ConnectError } from "./meta-connect";
import { getMySqlChannelsRepo } from "./repo-mysql";

export function channelsRepo() {
  return isDbConfigured() ? getMySqlChannelsRepo() : null;
}

// Después de conectar o desconectar, los envíos y webhooks tienen que ver el cambio ya.
export function channelsChanged() {
  resetWhatsAppConnectionsCache();
  resetSocialAccountsCache();
}

export function connectErrorResponse(err: unknown, fallback: string) {
  if (err instanceof ConnectError) {
    return NextResponse.json({ error: "connect_error", message: err.message }, { status: err.httpStatus });
  }
  console.error(`[canales] ${fallback}`, err);
  return NextResponse.json({ error: "server_error", message: fallback }, { status: 500 });
}
