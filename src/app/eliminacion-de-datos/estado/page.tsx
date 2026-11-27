// Estado de un pedido de eliminación de datos hecho desde Meta (el link que Meta le muestra a
// la persona después de quitar DigiBot). Pública: solo se ve con el código de confirmación.

import type { Metadata } from "next";
import Header from "../../../components/Header";
import Footer from "../../../components/Footer";
import { isDbConfigured } from "@/lib/db";
import { getDeletionRequest, isConfirmationCode, type DeletionRequest } from "@/lib/meta-social/data-deletion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Estado de tu pedido de eliminación de datos - DigiBot",
  robots: { index: false, follow: false },
};

const fmt = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });

async function load(code: unknown): Promise<DeletionRequest | null | "invalid"> {
  if (!isConfirmationCode(code)) return "invalid";
  if (!isDbConfigured()) return null;
  try {
    return await getDeletionRequest(code);
  } catch {
    return null;
  }
}

export default async function EstadoEliminacion({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const { codigo } = await searchParams;
  const request = await load(codigo?.toUpperCase());

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="max-w-2xl mx-auto space-y-6 py-20 px-6">
        <h1 className="text-3xl font-inter-tight font-bold">Estado de tu pedido de eliminación de datos</h1>

        {request === "invalid" || request === null ? (
          <p className="leading-relaxed">
            No encontramos un pedido con ese código. Revisá que el link esté completo o escribinos a{" "}
            <a href="mailto:soporte@digibotlatam.com" className="underline">
              soporte@digibotlatam.com
            </a>{" "}
            con tu código de confirmación.
          </p>
        ) : (
          <div className="space-y-5 leading-relaxed">
            <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 rounded-xl border border-border p-5">
              <dt className="text-muted-foreground">Código</dt>
              <dd className="font-mono font-semibold break-all">{request.code}</dd>
              <dt className="text-muted-foreground">Recibido</dt>
              <dd>{fmt(request.createdAt)}</dd>
              <dt className="text-muted-foreground">Estado</dt>
              <dd className="font-semibold">{request.status === "processed" ? "Procesado" : "Recibido, en proceso"}</dd>
            </dl>

            {request.status === "processed" ? (
              <p>
                El {fmt(request.processedAt ?? request.createdAt)} eliminamos los accesos de Meta que quitaste: DigiBot ya no
                puede leer ni enviar mensajes con ellos y sus credenciales fueron borradas.
              </p>
            ) : (
              <p>Recibimos tu pedido y estamos eliminando los accesos de Meta asociados.</p>
            )}
            <p>
              Si además querés que borremos conversaciones u otros datos guardados en DigiBot, escribinos a{" "}
              <a
                href={`mailto:soporte@digibotlatam.com?subject=${encodeURIComponent(`Eliminación de datos ${request.code}`)}`}
                className="underline"
              >
                soporte@digibotlatam.com
              </a>{" "}
              con este código. Lo resolvemos en un plazo máximo de 30 días, como explicamos en las{" "}
              <a href="/eliminacion-de-datos" className="underline">
                instrucciones para la eliminación de datos
              </a>
              .
            </p>
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
}
