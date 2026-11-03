// Respuestas de error comunes de las APIs del panel (validación con campos). Server-only.

import { NextResponse } from "next/server";

interface FieldError extends Error {
  fields: Record<string, string | undefined>;
  httpStatus: number;
}

function isFieldError(err: unknown): err is FieldError {
  return err instanceof Error && "fields" in err && "httpStatus" in err;
}

// TeamError, AccountError y SettingsError traen { fields, httpStatus }: se devuelven tal cual.
export function errorResponse(err: unknown, fallback: string, logLabel = "[crm]") {
  if (isFieldError(err)) {
    return NextResponse.json({ error: "invalid", message: err.message, fields: err.fields }, { status: err.httpStatus });
  }
  console.error(`${logLabel} ${fallback}`, err);
  return NextResponse.json({ error: "server_error", message: fallback }, { status: 500 });
}
