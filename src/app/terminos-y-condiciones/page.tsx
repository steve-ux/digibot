import Link from "next/link";
import Image from "next/image";
import Footer from "../../components/Footer";
import { FaFacebookF, FaInstagram, FaWhatsapp } from "react-icons/fa";

export default function TerminosYCondiciones() {
  return (
    <main className="min-h-screen py-20 px-6 bg-background text-foreground">
      <header className="border-b border-border/10">
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center justify-between">
            <div className="flex items-center">
              <Link href="https://digibotlatam.com/">
              <Image
                src="/DigiBot Logo stext.png"
                alt="DigiBot Logo"
                width={100}
                height={100}
              />
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-8">
            <Link href="https://digibotlatam.com/">
              <span className="bracket-link">INICIO</span>
            </Link>
              <a href="https://digibotlatam.com/#digibot" className="bracket-link">
                ¿Qué es?
              </a>
              <a href="https://digibotlatam.com/#planes" className="bracket-link">
                Planes
              </a>
              <Link
                href="https://panel.digibotlatam.com/"
                target="_blank"
                rel="noreferrer noopener"
                className="bracket-link"
              >
                Panel de cliente
              </Link>
            </div>
          </nav>
        </div>
        <br />
        <br />
        <br />
      </header>

      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-4xl font-inter-tight font-bold mb-8">
          Términos y Condiciones
        </h1>
        <p className="text-sm text-muted-foreground">
          Última actualización: {new Date().toLocaleDateString("es-AR")}
        </p>
        <div className="space-y-10 leading-relaxed text-base">
          <section>
            <h2 className="text-xl font-semibold mb-2">Introducción</h2>
            <p>
              Bienvenido a <strong>DigiBot</strong>, una marca operada por{" "}
              <strong>eKoddex</strong>. Al utilizar nuestros servicios de
              automatización de atención y ventas mediante plataformas como
              WhatsApp, Instagram y Facebook, usted acepta quedar vinculado por
              estos Términos y Condiciones. Le recomendamos leer atentamente
              este documento antes de utilizar nuestros servicios.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Definiciones</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Servicio:</strong> cualquier producto, software o
                funcionalidad ofrecida por DigiBot, incluyendo, sin limitarse a,
                automatización de mensajes, gestión de consultas y asistencia
                virtual mediante WhatsApp, Instagram, Facebook u otros canales
                compatibles.
              </li>
              <li>
                <strong>Usuario:</strong> cualquier persona física o jurídica
                que contrate, acceda o utilice los servicios de DigiBot.
              </li>
              <li>
                <strong>Proveedor:</strong> <strong>eKoddex</strong>, titular de
                los derechos de DigiBot y responsable de su operación y
                mantenimiento.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Uso del Servicio</h2>
            <p className="mb-3">
              DigiBot permite la automatización de respuestas, la gestión de
              clientes y la integración de canales de mensajería para optimizar
              la comunicación entre empresas y sus clientes. El Usuario es
              responsable de proporcionar información veraz, actualizada y
              completa para la correcta configuración del Servicio.
            </p>
            <p className="text-muted-foreground">
              eKoddex no será responsable por fallas derivadas de datos
              incorrectos o del uso inadecuado de plataformas externas
              conectadas (Meta/Twilio/WhatsApp/Instagram/Facebook).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Responsabilidad sobre Cuentas de Redes Sociales
            </h2>
            <p>
              DigiBot opera de forma independiente a las plataformas de Meta.
              <strong> eKoddex no se responsabiliza</strong> por suspensiones,
              bloqueos o restricciones aplicadas a las cuentas de WhatsApp,
              Facebook o Instagram del Usuario. El uso de dichas cuentas es
              responsabilidad exclusiva del cliente.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Derechos de Propiedad Intelectual
            </h2>
            <p>
              Todo el contenido, diseño, código, documentación y material
              asociado con los servicios de DigiBot son propiedad exclusiva de{" "}
              <strong>eKoddex</strong> o de sus licenciantes y están protegidos
              por las leyes de derechos de autor, propiedad intelectual y marcas
              registradas vigentes en la República Argentina y convenios
              internacionales.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Licencia de Uso</h2>
            <p>
              DigiBot otorga al Usuario una licencia limitada, revocable, no
              exclusiva y no transferible para utilizar las herramientas del
              Servicio únicamente con fines empresariales o comerciales
              legítimos. Queda prohibido el uso con fines ilícitos, fraudulentos
              o que atenten contra terceros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Restricciones de Uso</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Modificar, copiar o crear obras derivadas del software o la
                plataforma.
              </li>
              <li>
                Intentar obtener acceso al código fuente mediante ingeniería
                inversa, descompilación o cualquier otro medio.
              </li>
              <li>
                Alquilar, vender, sublicenciar o redistribuir el Servicio.
              </li>
              <li>
                Utilizar DigiBot para el envío de spam, contenido ilegal o
                comunicaciones no autorizadas.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Política de Privacidad
            </h2>
            <p>
              La recolección, almacenamiento y uso de los datos personales se
              encuentran regulados en nuestra{" "}
              <a href="/politica-de-privacidad" className="underline">
                Política de Privacidad
              </a>
              , la cual forma parte integral de estos términos. Al utilizar
              DigiBot, el Usuario acepta dicha política.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Reembolsos</h2>
            <p>
              Debido a la naturaleza digital y personalizada de nuestros
              servicios, <strong>no se realizan reembolsos</strong> una vez que
              el Servicio haya sido activado o configurado.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Limitación de Responsabilidad
            </h2>
            <p>
              En ningún caso <strong>eKoddex</strong> o <strong>DigiBot</strong>{" "}
              serán responsables por daños directos, indirectos o consecuentes
              que resulten del uso o la imposibilidad de uso de los servicios,
              incluyendo, sin limitarse a, pérdidas de datos, interrupciones del
              servicio o daños derivados de fallas en plataformas de terceros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Indemnización</h2>
            <p>
              El Usuario acepta indemnizar y mantener indemne a{" "}
              <strong>eKoddex</strong>, sus directivos, empleados y
              representantes, frente a cualquier reclamo, daño o gasto
              resultante del uso indebido del Servicio o del incumplimiento de
              estos Términos y Condiciones.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Modificaciones</h2>
            <p>
              <strong>eKoddex</strong> se reserva el derecho de modificar en
              cualquier momento los presentes Términos y Condiciones. Las
              modificaciones entrarán en vigor una vez publicadas en nuestro
              sitio web{" "}
              <a
                href="https://digibotlatam.com"
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                https://digibotlatam.com
              </a>
              . El uso continuado del Servicio implica la aceptación de los
              cambios.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              Jurisdicción y Ley Aplicable
            </h2>
            <p>
              Estos términos se rigen por las leyes de la{" "}
              <strong>República Argentina</strong>. Cualquier controversia será
              resuelta en los{" "}
              <strong>tribunales ordinarios de la provincia de Mendoza</strong>,
              renunciando las partes a cualquier otro fuero o jurisdicción.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Contacto</h2>
            <p>
              Para consultas sobre DigiBot o estos Términos y Condiciones:
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
        </div>
        <br />
        <br />
        <br />
      </div>

      <footer className="px-6 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center">
            <Link href="https://digibotlatam.com/">
            <Image
                src="/DigiBot Logo new.png"
                alt="DigiBot Logo"
                width={150}
                height={150}
              />
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="https://www.facebook.com/people/DigiBot/61581166522492/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="group w-9 h-9 inline-flex items-center justify-center rounded-full border border-border text-foreground hover:border-accent/50 hover:text-accent/50 transition-colors duration-200"
              >
                <FaFacebookF className="text-[14px]" />
                <span className="sr-only menu-footer">Facebook</span>
              </a>

              <a
                href="https://www.instagram.com/digibot_ok/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="group w-9 h-9 inline-flex items-center justify-center rounded-full border border-border text-foreground hover:border-accent/50 hover:text-accent/50 transition-colors duration-200"
              >
                <FaInstagram className="text-[16px]" />
                <span className="sr-only">Instagram</span>
              </a>

              <a
                href="https://api.whatsapp.com/send?phone=5492615131119&text=Hola!%20Visit%C3%A9%20DigiBot%20y%20quisiera%20conocer%20m%C3%A1s%20sobre%20su%20chatbot"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="group w-9 h-9 inline-flex items-center justify-center rounded-full border border-border text-foreground hover:border-accent/50 hover:text-accent/50 transition-colors duration-200 "
              >
                <FaWhatsapp className="text-[16px]" />
                <span className="sr-only">WhatsApp</span>
              </a>
            </div>
          </div>

          <Footer />

          <div className="flex flex-wrap justify-center space-x-6 text-sm font-mono">
          <Link href="https://digibotlatam.com/">
              <span className="menu-footer">[ inicio ]</span>
            </Link>
            <Link href="mailto:info@digibotlatam.com">
              <span className="menu-footer">[ info@digibotlatam.com ]</span>
            </Link>
            <Link href="/terminos-y-condiciones">
              <span className="menu-footer">[ t&c ]</span>
            </Link>
            <Link href="/politica-de-privacidad">
              <span className="menu-footer">[ política de privacidad ]</span>
            </Link>
            <Link
              href="https://panel.digibotlatam.com/"
              target="_blank"
              rel="noreferrer noopener"
            >
              <span className="menu-footer">[ panel del cliente ]</span>
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
