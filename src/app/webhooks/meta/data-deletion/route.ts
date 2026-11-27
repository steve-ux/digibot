// Callback de eliminación de datos de Meta (Data Deletion Request Callback).
// En Meta: Configuración de la app → Básica → "Eliminación de datos de usuario" →
// "URL de devolución de llamada para la eliminación de datos" -> https://<dominio>/webhooks/meta/data-deletion
// Llega un signed_request; hay que responder { url, confirmation_code } con un link público
// donde la persona ve el estado del pedido.

import { publicBaseUrl } from "@/lib/channels/config";
import { isDbConfigured } from "@/lib/db";
import { createDeletionRequest, deletionStatusUrl, processDeletionRequest } from "@/lib/meta-social/data-deletion";
import { parseSignedRequest, readSignedRequestParam } from "@/lib/meta-social/signed-request";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const signed = parseSignedRequest(await readSignedRequestParam(req), process.env.META_APP_SECRET);
  if (!signed) return Response.json({ error: "invalid_signed_request" }, { status: 403 });
  if (!isDbConfigured()) return Response.json({ error: "unavailable" }, { status: 503 });

  let code: string;
  try {
    code = await createDeletionRequest(signed.user_id);
  } catch (err) {
    console.error("[meta-datos] No se pudo registrar el pedido de eliminación:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 500 });
  }
  // Verificar las conexiones puede tardar: Meta espera la respuesta rápido.
  void processDeletionRequest(code);
  return Response.json({ url: deletionStatusUrl(publicBaseUrl(req.headers), code), confirmation_code: code });
}
