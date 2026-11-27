// Callback de desautorización de Meta: alguien quitó DigiBot de su cuenta.
// En Meta: Configuración de la app → Inicio de sesión con Facebook para empresas →
// "URL de devolución de llamada para cancelar la autorización" -> https://<dominio>/webhooks/meta/deauthorize
// Llega un signed_request firmado con el app secret. Se responde 200 y se verifican las conexiones.

import { isDbConfigured } from "@/lib/db";
import { handleDeauthorize } from "@/lib/meta-social/data-deletion";
import { parseSignedRequest, readSignedRequestParam } from "@/lib/meta-social/signed-request";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const signed = parseSignedRequest(await readSignedRequestParam(req), process.env.META_APP_SECRET);
  if (!signed) return new Response("Forbidden", { status: 403 });
  if (isDbConfigured()) {
    void handleDeauthorize(signed.user_id).catch((err) =>
      console.error("[meta-datos] No se pudo procesar la desautorización:", (err as Error).message)
    );
  }
  return new Response(null, { status: 200 });
}
