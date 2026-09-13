import Header from "../../components/Header";
import Footer from "../../components/Footer";

export default function PoliticaDePrivacidad() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />

      <div className="max-w-4xl mx-auto space-y-6 py-20 px-6">
        <h1 className="text-4xl font-inter-tight font-bold mb-8">
          Política de Privacidad
        </h1>
        <p className="text-sm text-muted-foreground">
          Última actualización: {new Date().toLocaleDateString("es-AR")}
        </p>
        <div className="space-y-10 leading-relaxed text-base">
          <section>
            <h2 className="text-xl font-semibold mb-2">Quiénes somos</h2>
            <p>
              <strong>DigiBot</strong> es una solución operada por{" "}
              <strong>eKoddex</strong> (el “Proveedor”). Esta Política describe
              cómo recopilamos, utilizamos y protegemos los datos personales en
              relación con nuestros servicios de automatización y atención a
              través de WhatsApp, Instagram, Facebook u otros canales
              compatibles (en conjunto, los “Servicios”).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Ámbito de aplicación</h2>
            <p>
              Esta Política aplica a los datos personales que tratamos cuando
              visitás nuestro sitio web, utilizás nuestros formularios de
              contacto o contratás/operás los Servicios de DigiBot. Al utilizar
              nuestros Servicios, aceptás las prácticas aquí descriptas.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Datos que recopilamos
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Datos que nos proporcionás:</strong> nombre, email,
                teléfono/WhatsApp, empresa, cargo, mensaje o requerimiento,
                preferencias y cualquier otra información que envíes mediante
                formularios o canales de soporte.
              </li>
              <li>
                <strong>Datos técnicos y de uso:</strong> dirección IP,
                dispositivo, navegador, páginas visitadas, eventos básicos de
                navegación, fecha y hora, y métricas de rendimiento.
              </li>
              <li>
                <strong>Metadatos de mensajería:</strong> identificadores de
                conversación, marcas de tiempo y estado de entrega.{" "}
                <em>No accedemos al contenido de tus chats personales</em> salvo
                que nos lo compartas explícitamente para soporte o
                configuración.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Finalidades del tratamiento
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Brindar, mantener y mejorar los Servicios de DigiBot.</li>
              <li>Atender consultas comerciales y de soporte.</li>
              <li>
                Configurar integraciones y automatizaciones a solicitud del
                cliente.
              </li>
              <li>Realizar analítica básica de uso, performance y calidad.</li>
              <li>Cumplir obligaciones legales y/o contractuales.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Base legal</h2>
            <p>
              Tratamos datos sobre la base de <strong>consentimiento</strong>{" "}
              (p. ej., al enviar un formulario),
              <strong> ejecución de contrato</strong> (provisión de los
              Servicios) y <strong>interés legítimo </strong>
              (seguridad, mejora y analítica operativa), según corresponda y
              conforme a la normativa aplicable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Plataformas de terceros
            </h2>
            <p className="mb-2">
              DigiBot se integra con plataformas externas (p. ej.,
              Meta/Twilio/WhatsApp/Instagram/Facebook/Chatwoot). Dichas plataformas pueden
              tratar datos como responsables independientes según sus propias
              políticas.
            </p>
            <p className="text-muted-foreground">
              Te recomendamos revisar las políticas de privacidad de cada
              plataforma conectada antes de utilizarlas con DigiBot.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Cookies y tecnologías similares
            </h2>
            <p className="mb-2">
              Podemos utilizar cookies esenciales para el funcionamiento del
              sitio y, opcionalmente, cookies de medición/analítica. Podés
              configurar tu navegador para bloquearlas o borrarlas; sin embargo,
              algunas funcionalidades podrían verse afectadas.
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>
                <strong>Esenciales:</strong> necesarias para seguridad y
                navegación.
              </li>
              <li>
                <strong>Analíticas (opcionales):</strong> ayudan a entender uso
                y mejorar la experiencia.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Con quién compartimos datos
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Proveedores y encargados de tratamiento:</strong>{" "}
                hosting, correo, analítica, automatización y soporte (solo lo
                necesario para prestar el servicio).
              </li>
              <li>
                <strong>Plataformas integradas:</strong> cuando habilitás
                voluntariamente integraciones, los datos pueden fluir según tu
                configuración.
              </li>
              <li>
                <strong>Autoridades:</strong> cuando exista obligación legal o
                requerimiento válido.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Transferencias internacionales
            </h2>
            <p>
              Algunos proveedores pueden estar ubicados fuera de tu país.
              Adoptamos medidas razonables para asegurar un nivel adecuado de
              protección conforme a la normativa aplicable y a los contratos con
              dichos proveedores.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Seguridad</h2>
            <p>
              Implementamos medidas técnicas y organizativas proporcionales para
              proteger los datos contra acceso, alteración o divulgación no
              autorizada. Aun así, ningún sistema es 100% infalible y no podemos
              garantizar seguridad absoluta.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Conservación</h2>
            <p>
              Conservamos los datos por el tiempo necesario para cumplir las
              finalidades informadas, atender obligaciones legales y resolver
              disputas. Luego se eliminan o anonimizan de forma segura.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Tus derechos</h2>
            <p className="mb-2">
              Podés ejercer tus derechos de acceso, actualización, rectificación
              y supresión, así como retirar tu consentimiento cuando
              corresponda.
            </p>
            <p>
              Para hacerlo, escribinos a{" "}
              <a href="mailto:soporte@digibotlatam.com" className="underline">
                soporte@digibotlatam.com
              </a>{" "}
              indicando tu solicitud y un medio de contacto. Te responderemos
              dentro de los plazos razonables conforme a la normativa vigente.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Menores de edad</h2>
            <p>
              Nuestros Servicios no están dirigidos a menores. Si sospechás que
              un menor nos ha proporcionado datos personales sin autorización,
              contactanos para eliminar esa información.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Cambios en esta Política
            </h2>
            <p>
              Podemos actualizar esta Política para reflejar cambios en nuestras
              prácticas o por razones legales/operativas. Publicaremos la
              versión vigente en{" "}
              <a
                href="https://digibotlatam.com"
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                digibotlatam.com
              </a>
              . El uso continuado implica la aceptación de las modificaciones.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Contacto</h2>
            <p>
              Si tenés dudas sobre esta Política o el tratamiento de tus datos:
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
            {/* <p className="text-xs text-muted-foreground mt-4">
              Este documento es informativo y puede requerir ajustes para tu
              caso concreto. No constituye asesoramiento legal.
            </p> */}
          </section>

          <footer className="pt-6 border-t border-border text-sm text-muted-foreground">
            También podés revisar nuestros{" "}
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
