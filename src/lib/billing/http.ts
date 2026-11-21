// Respuestas HTTP comunes de las APIs de cobro. Server-only.

import { NextResponse } from "next/server";
import { BillingError } from "./errors";

export function billingErrorResponse(err: unknown, fallback = "No pudimos procesar el pago. Probá de nuevo en unos minutos.") {
  if (err instanceof BillingError) {
    return NextResponse.json({ error: "billing", message: err.message, fields: err.fields }, { status: err.httpStatus });
  }
  console.error("[billing]", err);
  return NextResponse.json({ error: "server_error", message: fallback }, { status: 500 });
}

export const billingUnavailable = () =>
  NextResponse.json(
    { error: "not_configured", message: "El cobro online no está disponible en este momento. Escribinos por WhatsApp." },
    { status: 503 }
  );

export const tooManyRequests = () =>
  NextResponse.json({ error: "too_many_attempts", message: "Demasiados intentos. Esperá unos minutos y probá de nuevo." }, { status: 429 });
