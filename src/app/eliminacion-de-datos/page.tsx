import type { Metadata } from "next";
import Header from "../../components/Header";
import Footer from "../../components/Footer";

export const metadata: Metadata = {
  title: "Eliminación de datos - DigiBot",
  description:
    "Instrucciones para solicitar la eliminación de tus datos personales de DigiBot.",
};

export default function EliminacionDeDatos() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />

      <div className="max-w-4xl mx-auto space-y-6 py-20 px-6">
        <h1 className="text-4xl font-inter-tight font-bold mb-8">
          Instrucciones para la Eliminación de Datos
        </h1>
        <p className="text-sm text-muted-foreground">
          Última actualización: {new Date().toLocaleDateString("es-AR")}
        </p>
        <div className="space-y-10 leading-relaxed text-base">
          <section>
            <h2 className="text-xl font-semibold mb-2">Introducción</h2>
            <p>
              En <strong>DigiBot</strong>, solución operada por{" "}
              <strong>eKoddex</strong> (el “Proveedor”), respetamos tu derecho
              a decidir sobre tus datos personales. Esta página explica cómo
              solicitar la eliminación de los datos que tratamos en relación con
              nuestros servicios de automatización y atención a través de
              WhatsApp, Instagram, Facebook u otros canales compatibles (en
              conjunto, los “Servicios”), incluidos los datos obtenidos mediante
              las plataformas de Meta.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Qué datos podés solicitar eliminar
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Datos de contacto:</strong> nombre, email,
                teléfono/WhatsApp, empresa y cualquier otra información que nos
                hayas enviado mediante formularios o canales de soporte.
              </li>
              <li>
                <strong>Datos de mensajería:</strong> conversaciones, mensajes,
                identificadores de contacto (p. ej., tu número de WhatsApp) y
                metadatos asociados (marcas de tiempo y estado de entrega)
                almacenados por DigiBot.
              </li>
              <li>
                <strong>Datos de integraciones:</strong> si sos cliente, los
                datos de conexión de tu cuenta de WhatsApp Business (p. ej.,
                identificadores de cuenta y tokens de acceso) y las plantillas
                de mensajes sincronizadas.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Cómo solicitar la eliminación
            </h2>
            <p className="mb-2">
              Enviá un email a{" "}
              <a
                href="mailto:soporte@digibotlatam.com?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos"
                className="underline"
              >
                soporte@digibotlatam.com
              </a>{" "}
              con el asunto <strong>“Solicitud de eliminación de datos”</strong>{" "}
              e incluí:
            </p>
            <ol className="list-decimal pl-6 space-y-2">
              <li>Tu nombre completo.</li>
              <li>
                El número de teléfono/WhatsApp y/o el email con el que
                interactuaste con DigiBot o con el bot de alguno de nuestros
                clientes.
              </li>
              <li>
                Si sos cliente, el nombre de tu empresa y la cuenta de WhatsApp
                Business conectada.
              </li>
              <li>
                Si querés eliminar todos tus datos o solo una parte (p. ej., una
                conversación en particular).
              </li>
            </ol>
            <p className="mt-2 text-muted-foreground">
              Para proteger tu información, podemos pedirte que confirmes tu
              identidad (por ejemplo, respondiendo desde el mismo número de
              WhatsApp o email asociado) antes de procesar la solicitud.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Desvincular DigiBot desde Facebook
            </h2>
            <p className="mb-2">
              Si conectaste DigiBot con tu cuenta de Facebook o Meta Business,
              también podés quitarle el acceso en cualquier momento:
            </p>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                Ingresá a tu cuenta de Facebook y abrí{" "}
                <strong>Configuración y privacidad › Configuración</strong>.
              </li>
              <li>
                Entrá en <strong>Apps y sitios web</strong> (o en{" "}
                <strong>Integraciones comerciales</strong> si la conexión se
                hizo desde tu cuenta comercial).
              </li>
              <li>
                Buscá <strong>DigiBot</strong> y seleccioná{" "}
                <strong>Eliminar</strong>.
              </li>
            </ol>
            <p className="mt-2 text-muted-foreground">
              Esto revoca el acceso de DigiBot a tu cuenta. Para que además
              borremos los datos que ya tenemos almacenados, enviá la solicitud
              por email como se indica arriba.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Plazos y confirmación
            </h2>
            <p>
              Procesamos las solicitudes en un plazo máximo de{" "}
              <strong>30 días</strong> desde que recibimos la solicitud
              verificada. Una vez completada, te enviaremos una confirmación al
              medio de contacto que nos indicaste.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Datos que podríamos conservar
            </h2>
            <p className="mb-2">
              Podemos conservar cierta información, de forma limitada y segura,
              cuando sea necesario para:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Cumplir obligaciones legales, contables o fiscales.</li>
              <li>Resolver disputas o hacer valer nuestros acuerdos.</li>
              <li>Prevenir fraudes o abusos de los Servicios.</li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              Las copias de seguridad se eliminan en sus ciclos regulares de
              rotación. Los datos que permanezcan en plataformas de terceros
              (p. ej., los chats en tu propia app de WhatsApp o en los
              servidores de Meta) se rigen por las políticas de esas
              plataformas.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Contacto</h2>
            <p>
              Si tenés dudas sobre la eliminación de tus datos:
              <br />
              📧{" "}
              <a href="mailto:soporte@digibotlatam.com" className="underline">
                soporte@digibotlatam.com
              </a>
              <br />
              🌐{" "}
              <a
                href="https://digibotlatam.com"
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                digibotlatam.com
              </a>
            </p>
          </section>

          <footer className="pt-6 border-t border-border text-sm text-muted-foreground">
            También podés revisar nuestra{" "}
            <a href="/politica-de-privacidad" className="underline">
              Política de Privacidad
            </a>{" "}
            y nuestros{" "}
            <a href="/terminos-y-condiciones" className="underline">
              Términos y Condiciones
            </a>
            .
          </footer>
        </div>
      </div>

      <Footer />
    </main>
  );
}
