// Para las APIs que son solo del equipo de DigiBot (superadmins). Server-only.

import { NextResponse } from "next/server";
import { forbidden } from "./api-auth";
import { getCurrentUser } from "./session";

export async function requireSuperadmin() {
  const user = await getCurrentUser();
  if (!user) {
    return { response: NextResponse.json({ error: "unauthorized", message: "Tu sesión venció. Volvé a entrar." }, { status: 401 }) };
  }
  if (user.role !== "superadmin") return { response: forbidden() };
  return { user };
}
