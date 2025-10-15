import Image from "next/image";
import Link from "next/link";
import { FaFacebookF, FaInstagram, FaWhatsapp } from "react-icons/fa";
import FAQSection from "../components/FAQSection";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/10">
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center justify-between">
            <div className="flex items-center">
              <Image
                src="/DigiBot Logo stext.png"
                alt="DigiBot Logo"
                width={100}
                height={100}
              />
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="#" className="bracket-link">
                Planes
              </Link>
              <Link href="#" className="bracket-link">
                Nosotros
              </Link>
              <Link href="#" className="bracket-link">
                Soporte
              </Link>
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
      </header>

      {/* Banner de anuncios, descomentar para notificaciones importantes*/}
      {/* <div className="bg-accent/10 border-b border-accent/20">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center justify-center space-x-2 text-sm">
            <Image
              src="https://ext.same-assets.com/1290273661/1102959114.svg"
              alt="New"
              width={16}
              height={16}
            />
            <span className="text-accent font-medium">New</span>
            <span className="text-foreground">Veo 3</span>
            <span className="text-muted-foreground">Our state-of-the-art video generation model</span>
          </div>
        </div>
      </div> */}

      <main>
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
          {/* Video Background : /eKoddex web.mp4*/}
          <video
            src="/DigiBot glitch.mp4"
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-20"
          />

          {/* Dark overlay for better text readability */}
          <div className="absolute inset-0 bg-black/40"></div>

          {/* Content */}
          <div className="relative z-10 container mx-auto px-6 text-center">
            <div className="flex items-center justify-center flex-col mb-8">
              <Image
                src="/DigiBot Logo new.png"
                alt="DigiBot LATAM"
                width={600}
                height={600}
              />
              <p className="text-xl md:text-2xl text-white/90 mb-12 max-w-2xl mx-auto">
                AI-Powered Chat Agent for Business LATAM
              </p>
            </div>
            <h1 className="text-5xl md:text-7xl font-inter-tight font-bold mb-6">
              Tu negocio, con el poder de la IA.
            </h1>
            <br></br>

            <Link href="#">
              <button className="bracket-button-dark">CHATEAR CON IA</button>
            </Link>
          </div>
        </section>

        {/* Feature Sections */}
        <section className="py-20">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
              {/* Descubre Section - h2 > h3 > p > img */}
              <div>
                <div className="flex items-center mb-4">
                  <h2 className="text-2xl font-inter-tight font-bold">
                    DigiBot
                  </h2>
                </div>
                <h3 className="text-xl font-medium mb-4">
                  Inteligencia Artificial para empresas
                </h3>
                <p className="text-muted-foreground mb-6">
                  Desarrollamos una plataforma con Inteligencia Artificial en la
                  que entrenamos por vos una IA que asesora a tus clientes a
                  través de WhatsApp, Instagram y Facebook, escucha audios, lee
                  los mensajes y los contesta, de esta forma te aseguras que tu
                  empresa tenga una excelente atención al cliente y no pierdas
                  ventas por no responder los mensajes a tiempo.
                </p>
              </div>
              <div>
                <Image
                  src="/Feautures DigiBot.png"
                  alt="Características principales de DigiBot"
                  width={500}
                  height={300}
                  className="w-full h-auto rounded-lg"
                />
              </div>

              {/* Build Section - img > h2 > h3 > p */}
              <div>
                <Image
                  src="/Feautures Panel DigiBot.png"
                  alt="Panel CMR de DigiBot"
                  width={500}
                  height={500}
                  className="w-full h-auto rounded-lg mb-6"
                />
              </div>
              <div>
                <h2 className="text-2xl font-inter-tight font-bold mb-4">
                  CMR
                </h2>
                <h3 className="text-xl font-medium mb-4">
                  Un panel propio para gestionar tus conversaciones
                </h3>
                <p className="text-muted-foreground">
                  Controlá los diálogos que tiene el bot con tus clientes y tomá
                  el control cuando el usuario quiera ser derivado con un
                  humano. Podés encender y apagar el bot cuando vos quieras.
                  Accedé a estadísticas de tus chats.
                </p>
              </div>

              {/* Operate Section - h2 > h3 > p > img */}
              <div>
                <h2 className="text-2xl font-inter-tight font-bold mb-4">
                  WhatsApp
                </h2>
                <h3 className="text-xl font-medium mb-4">
                  Obtendrás un número habilitado por META Business
                </h3>
                <p className="text-muted-foreground mb-6">
                  Te ofrecemos un perfil de WhatsApp único para vos con el
                  nombre de tu empresa aprobado por META, de esta forma la
                  información del usuario siempre estará segura, respaldada y
                  encriptada por estándares internacionales. También podés usar
                  el WhatsApp que actualmente uses en tu marca o empresa.
                  Disponible en cualquier región.
                </p>
              </div>
              <div>
                <Image
                  src="/Feautures WhatsApp DigiBot.png"
                  alt="Perfil de WhatsApp"
                  width={500}
                  height={300}
                  className="w-full h-auto rounded-lg"
                />
              </div>

              {/* Learn Section - img > h2 > h3 > p */}
              <div>
                <Image
                  src="/Feautures Ventas DigiBot.png"
                  alt="Base de datos"
                  width={500}
                  height={300}
                  className="w-full h-auto rounded-lg mb-6"
                />
              </div>
              <div>
                <h2 className="text-2xl font-inter-tight font-bold mb-4">
                  Ventas
                </h2>
                <h3 className="text-xl font-medium mb-4">
                  Vendé en automático tus productos online día y noche
                </h3>
                <p className="text-muted-foreground">
                  Entrenamos el bot para uso exclusivo de tu marca y lo nutrimos
                  de una base de datos pensada y ajustada a cada necesidad.
                  Mantenemos actualizado tu bot con datos en tiempo real de tus
                  productos, precios o la información relevante de tu negocio.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Developer Quickstart */}
        <section className="relative py-20 overflow-hidden">
          {/* Video Background */}
          <video
            src="/eKoddex glitch.mp4"
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-10"
          />

          {/* Dark overlay for better text readability */}
          <div className="absolute inset-0 bg-black/60"></div>

          {/* Content */}
          <div className="relative z-10 container mx-auto px-6">
            <h2 className="text-4xl font-inter-tight font-bold text-center mb-4">
              ¿Por qué DigiBot?
            </h2>

            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-medium mb-2">
                    Tu asistente de Inteligencia Artificial
                  </h3>
                  <p className="text-muted-foreground">
                    DigiBot es un agente de IA que se adapta y aprende
                    continuamente sobre tu negocio, gestionando desde preguntas
                    frecuentes hasta el seguimiento automático a tus clientes,
                    la programación de citas y eventos. <br />
                    <br />
                    Responde las consultas de tu WhatsApp, Instagram y Facebook,
                    escucha audios, gestiona la atención al cliente, también
                    promueve tus productos y asesora de manera precisa,
                    asegurando que ningún mensaje quede sin respuesta en tu
                    WhatsApp. A DigiBot lo puedes entrenar para que responda de
                    la forma que más te guste, ya que es 100% personalizado.
                    <br />
                    <br />
                    Una de las diferencias claves de DigiBot frente a otros
                    chatbots es que realiza un seguimiento y personalización
                    como si fueras vos mismo el que responde. Otros chatbots
                    solo responden respuestas automáticas sin personalización y
                    razonamiento, por lo tanto tampoco hacen un seguimiento.
                  </p>
                </div>
              </div>
              <Link href="#">
                <button className="bracket-button-dark">QUIERO MI BOT</button>
              </Link>
              <br />
              <br />

              {/* DigiBot vs Otros Chats */}
              <div>
                <div className="p-6">
                  <Image
                    src="/DigiBot vs Otros chatbots.png"
                    alt="Base de datos"
                    width={500}
                    height={300}
                    className="w-full h-auto rounded-lg mb-6"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Explore Models */}
        <section className="py-20">
          <div className="container mx-auto px-6">
            <h2 className="text-4xl font-inter-tight font-bold text-center mb-16">
              Beneficios de DigiBot
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Gemini */}
              <Link
                href="#"
                className="group bg-card border border-border rounded-lg p-6 hover:border-accent transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold">
                    Responde como humano
                  </h3>
                  <Image
                    src="/Favicones Human.png"
                    alt="Gemini"
                    width={48}
                    height={48}
                    className="w-12 h-12"
                  />
                </div>
                <p className="text-muted-foreground">
                  Le ponemos a tu bot el nombre y la personalización que
                  decidas. Mensajes con humor y profesionalismo generan una
                  conversación amena.
                </p>
              </Link>

              {/* Imagen */}
              <Link
                href="#"
                className="group bg-card border border-border rounded-lg p-6 hover:border-accent transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold">
                    Comunicación efectiva
                  </h3>
                  <Image
                    src="/Sound.png"
                    alt="Imagen"
                    width={48}
                    height={48}
                    className="w-12 h-12"
                  />
                </div>
                <p className="text-muted-foreground">
                  No se desvía de conversación, siempre busca responder las
                  dudas que puedan tener de tu negocio, su objetivo es claro.
                </p>
              </Link>

              {/* Veo */}
              <Link
                href="#"
                className="group bg-card border border-border rounded-lg p-6 hover:border-accent transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold">
                    Reduce cargas de trabajo
                  </h3>
                  <Image
                    src="/Work.png"
                    alt="Veo"
                    width={48}
                    height={48}
                    className="w-12 h-12"
                  />
                </div>
                <p className="text-muted-foreground">
                  Esas horas que destinabas a responder sin parar posibles
                  clientes, ahora las podés destinar a otras áreas de tu empresa
                  o vida personal.
                </p>
              </Link>

              {/* Gemini TTS */}
              <Link
                href="#"
                className="group bg-card border border-border rounded-lg p-6 hover:border-accent transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold">
                    Automatización de ventas
                  </h3>
                  <Image
                    src="/Money.png"
                    alt="Gemini TTS"
                    width={48}
                    height={48}
                    className="w-12 h-12"
                  />
                </div>
                <p className="text-muted-foreground">
                  Responde las 24 horas, los 365 días del año. Apagalo/encendelo
                  cuando vos decidas.
                </p>
              </Link>

              {/* Gemini Native Audio */}
              <Link
                href="#"
                className="group bg-card border border-border rounded-lg p-6 hover:border-accent transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold">
                    Análisis y estadísticas
                  </h3>
                  <Image
                    src="/Stats.png"
                    alt="Gemini Native Audio"
                    width={48}
                    height={48}
                    className="w-12 h-12"
                  />
                </div>
                <p className="text-muted-foreground">
                  Toma mejores decisiones en base a las estadísticas de tus
                  chats y haz tu propio análisis para un mejor rumbo de tu marca
                  o empresa.
                </p>
              </Link>

              {/* Gemma */}
              <Link
                href="#"
                className="group bg-card border border-border rounded-lg p-6 hover:border-accent transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold">
                    Seguimiento para más ventas
                  </h3>
                  <Image
                    src="/Track.png"
                    alt="Gemma"
                    width={48}
                    height={48}
                    className="w-12 h-12"
                  />
                </div>
                <p className="text-muted-foreground">
                  Tu bot tiene memoria y se programa para seguir la conversación
                  que tuvo el día anterior de manera empática.
                </p>
              </Link>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-inter-tight font-bold mb-4">
                Nuestros Planes
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Elige el plan que mejor se adapte a las necesidades de tu
                negocio
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Plan Básico */}
              <div className="bg-card border border-border rounded-lg p-8 relative hover:border-accent/50 transition-all duration-300 hover:shadow-lg h-full flex flex-col">
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-inter-tight font-bold mb-2">
                    Básico
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Perfecto para empezar
                  </p>
                  <div className="mb-4">
                    <span className="text-4xl font-bold titulo font-dsdigital">
                      $99
                    </span>
                    <span className="text-muted-foreground">/mes</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8">
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Hasta 1,000 mensajes/mes</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">WhatsApp Business</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Panel de control básico</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Soporte por email</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Entrenamiento básico de IA</span>
                  </li>
                </ul>

                <Link href="#" className="block mt-auto">
                  <button className="w-full bracket-button-dark">
                    Elegir Básico
                  </button>
                </Link>
              </div>

              {/* Plan Premium - Destacado */}
              <div className="bg-card border-2 border-accent rounded-lg p-8 relative hover:shadow-xl transition-all duration-300 transform hover:scale-105 h-full flex flex-col">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-accent text-accent-foreground px-4 py-1 rounded-full text-sm font-medium">
                    Más Popular
                  </span>
                </div>

                <div className="text-center mb-6">
                  <h3 className="text-2xl font-inter-tight font-bold mb-2">
                    Premium
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Ideal para marcas en crecimiento
                  </p>
                  <div className="mb-4">
                    <span className="text-4xl font-bold titulo font-dsdigital">
                      $199
                    </span>
                    <span className="text-muted-foreground">/mes</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8">
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Hasta 5,000 mensajes/mes</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">
                      WhatsApp + Instagram + Facebook
                    </span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Panel de control avanzado</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Soporte prioritario</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">IA personalizada avanzada</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Estadísticas detalladas</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Integración con CRM</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Soporta audios e imágenes</span>
                  </li>
                </ul>

                <Link href="#" className="block mt-auto">
                  <button className="w-full bracket-button-dark text-accent-foreground border-accent">
                    Elegir Premium
                  </button>
                </Link>
              </div>

              {/* Plan Plus+ */}
              <div className="bg-card border border-border rounded-lg p-8 relative hover:border-accent/50 transition-all duration-300 hover:shadow-lg h-full flex flex-col">
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-inter-tight font-bold mb-2">
                    Plus+
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Para empresas grandes
                  </p>
                  <div className="mb-4">
                    <span className="text-4xl font-bold titulo font-dsdigital">
                      $399
                    </span>
                    <span className="text-muted-foreground">/mes</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8">
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Mensajes ilimitados</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">WhatsApp + Instagram + Facebook</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Panel empresarial completo</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Soporte 24/7</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">IA ultra personalizada</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Analytics avanzados</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Genera links de ventas</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Soporta audios e imágenes</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-accent mr-3">✓</span>
                    <span className="text-sm">Entrenamiento personalizado</span>
                  </li>
                </ul>

                <Link href="#" className="block mt-auto">
                  <button className="w-full bracket-button-dark">
                    Elegir Plus+
                  </button>
                </Link>
              </div>
            </div><br/><br/><br/>

            <div className="text-center mt-12">
              <p className="text-muted-foreground mb-6">
                ¿Necesitas un plan personalizado? Contáctanos para crearte una
                solución a medida
              </p>
              <Link href="#">
                <button className="bracket-button-dark">
                  Contactar Ventas
                </button>
              </Link><br/><br/>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <FAQSection />

        {/* Bottom CTA */}
        <section className="relative py-20 overflow-hidden">
          {/* video de fondo */}
          <video
            src="/eKoddex glitch.mp4"
            autoPlay
            muted
            loop
            playsInline
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30"
          />

          {/* overlay suave por si querés más contraste */}
          <div className="absolute inset-0 bg-background/30" />

          {/* contenido */}
          <div className="relative z-10 container mx-auto px-6 text-center">
            <div className="flex items-center justify-center mb-6">
              <br />
              <br />
              <br />
              <br />
            </div>

            <h2 className="text-3xl font-inter-tight font-bold mb-4">
              Comenzá a explorar el poder de la IA en tu negocio
            </h2>
            <br />
            <Link href="#" className="bracket-button-dark inline-block">
              Agendá una cita
            </Link>
          </div>
          <br />
          <br />
          <br />
          <br />
        </section>
      </main>

      {/* Footer */}
      <footer className="px-6 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center">
              <Image
                src="/DigiBot Logo new.png"
                alt="DigiBot Logo"
                width={150}
                height={150}
              />
            </div>
            <div className="flex items-center gap-3">
              <a
                href="https://www.facebook.com/ekoddex"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="group w-9 h-9 inline-flex items-center justify-center rounded-full border border-border text-foreground hover:border-accent/50 hover:text-accent/50 transition-colors duration-200"
              >
                <FaFacebookF className="text-[14px]" />
                <span className="sr-only menu-footer">Facebook</span>
              </a>

              <a
                href="https://www.instagram.com/ekoddex"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="group w-9 h-9 inline-flex items-center justify-center rounded-full border border-border text-foreground hover:border-accent/50 hover:text-accent/50 transition-colors duration-200"
              >
                <FaInstagram className="text-[16px]" />
                <span className="sr-only">Instagram</span>
              </a>

              <a
                href="https://api.whatsapp.com/send?phone=5492615131119&text=Hola!%20Visit%C3%A9%20su%20web%20y%20quisiera%20conocer%20m%C3%A1s%20sobre%20su%20chatbot"
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

          <div className="text-center text-sm text-gray-500 mb-6">
            © 2025 DigiBot LATAM. All rights reserved.
          </div>

          <div className="flex flex-wrap justify-center space-x-6 text-sm font-mono">
            <Link href="mailto:info@digibotlatam.com">
              <span className="menu-footer">[ info@digibotlatam.com ]</span>
            </Link>
            <Link href="#">
              <span className="menu-footer">[ términos & condiciones ]</span>
            </Link>
            <Link href="#">
              <span className="menu-footer">[ inicio ]</span>
            </Link>
            <Link href="#">
              <span className="menu-footer">[ planes ]</span>
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
    </div>
  );
}
