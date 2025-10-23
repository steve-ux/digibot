import Image from "next/image";
import Link from "next/link";
import { FaFacebookF, FaInstagram, FaWhatsapp } from "react-icons/fa";
import FAQSection from "../components/FAQSection";
import Footer from "../components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
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
              <a href="#digibot" className="bracket-link">
                ¿Qué es?
              </a>
              <a href="#planes" className="bracket-link">
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

            <Link
              href="https://api.whatsapp.com/send?phone=5492615131119&text=Hola!%20Visit%C3%A9%20DigiBot%20y%20estoy%20interesado%20en%20tener%20mi%20bot"
              target="_blank"
              rel="noopener noreferrer"
            >
              <button className="bracket-button-dark">CHATEAR CON IA</button>
            </Link>
          </div>
        </section>

        {/* Feature Sections */}
        <section
          id="digibot"
          className="py-20"
          style={{ backgroundColor: "#f2f2f2" }}
        >
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
              {/* Descubre Section - h2 > h3 > p > img */}
              <div>
                <div className="flex items-center mb-4">
                  <h2 className="text-2xl font-inter-tight font-bold text-[#1c1c1c]">
                    DigiBot
                  </h2>
                </div>
                <h3 className="text-xl font-medium mb-4 text-[#1c1c1c]">
                  Inteligencia Artificial para empresas
                </h3>
                <p className="mb-6 text-[#1c1c1c]">
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
                <h2 className="text-2xl font-inter-tight font-bold mb-4 text-[#1c1c1c]">
                  CMR
                </h2>
                <h3 className="text-xl font-medium mb-4 text-[#1c1c1c]">
                  Un panel propio para gestionar tus conversaciones
                </h3>
                <p className="text-[#1c1c1c]">
                  Controlá los diálogos que tiene el bot con tus clientes y tomá
                  el control cuando el usuario quiera ser derivado con un
                  humano. Podés encender y apagar el bot cuando vos quieras.
                  Accedé a estadísticas de tus chats.
                </p>
              </div>

              {/* Operate Section - h2 > h3 > p > img */}
              <div>
                <h2 className="text-2xl font-inter-tight font-bold mb-4 text-[#1c1c1c]">
                  WhatsApp
                </h2>
                <h3 className="text-xl font-medium mb-4 text-[#1c1c1c]">
                  Obtendrás un número habilitado por META Business
                </h3>
                <p className="mb-6 text-[#1c1c1c]">
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
                <h2 className="text-2xl font-inter-tight font-bold mb-4 text-[#1c1c1c]">
                  Ventas
                </h2>
                <h3 className="text-xl font-medium mb-4 text-[#1c1c1c]">
                  Vendé en automático tus productos online día y noche
                </h3>
                <p className="text-[#1c1c1c]">
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
            </h2><br />

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

              <br />
              <br />

              {/* DigiBot vs Otros Chats */}
              <div>
                <br />
                <h3 className="text-xl font-medium mb-2">Chatbots comunes vs DigiBot</h3>
                <p className="text-muted-foreground">
                    Un bot sin IA genera respuestas genéricas en base a un árbol de decisión, y cuando no sabe que responder desvaría.</p>
                    <p className="text-muted-foreground">DigiBot utiliza los últimos modelos de IA para generar respuestas inteligentes, personalizadas y adaptadas a tu negocio.</p>
             <br />
             <br />
                <div className="p-6">
                  <Image
                    src="/Digibot vs otros.png"
                    alt="Chatbots comunes vs DigiBot"
                    width={1400}
                    height={1400}
                  />
                </div>
              </div>
             <br />
             <br />
              <div className="flex justify-center">
                <Link
                  href="https://api.whatsapp.com/send?phone=5492615131119&text=Hola!%20Visit%C3%A9%20DigiBot%20y%20estoy%20interesado%20en%20tener%20mi%20bot"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <button className="bracket-button-dark">QUIERO MI BOT</button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Beneficios de DigiBot */}
        <section className="py-20" style={{ backgroundColor: "#f2f2f2" }}>
          <br />
          <div className="container mx-auto px-6">
            <h2 className="text-4xl font-inter-tight font-bold text-center mb-16 text-[#1c1c1c]">
              Beneficios de DigiBot
            </h2>
            <br />
            <br />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Gemini */}
              <Link
                href="#"
                className="group bg-card border border-border rounded-lg p-6 transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold text-[#66ff99]">
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
                className="group bg-card border border-border rounded-lg p-6 transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold text-[#66ff99]">
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
                className="group bg-card border border-border rounded-lg p-6 transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold text-[#66ff99]">
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
                className="group bg-card border border-border rounded-lg p-6 transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold text-[#66ff99]">
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
                className="group bg-card border border-border rounded-lg p-6 transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold text-[#66ff99]">
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
                className="group bg-card border border-border rounded-lg p-6 transition-colors"
              >
                <div className="flex items-center justify-between mb-4 ">
                  <h3 className="text-xl font-inter-tight font-bold text-[#66ff99]">
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
          <br />
          <br />
          <br />
          <br />
        </section>

        {/* Pricing Section */}
        <section id="planes" className="relative py-20 overflow-hidden">
          {/* Video de fondo */}
          <video
            src="/eKoddex glitch.mp4"
            autoPlay
            muted
            loop
            playsInline
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-10"
          />
          <div className="container mx-auto px-6">
            <div className="text-center mb-12 md:mb-16">
              <h2 className="text-3xl md:text-4xl font-inter-tight font-bold mb-4 scroll-mt-24">
                Nuestros Planes
              </h2>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
                Elige el plan que mejor se adapte a las necesidades de tu
                negocio
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto px-4">
              {/* Plan Básico */}
              <div className="bg-card border border-border rounded-lg p-6 md:p-8 relative hover:border-[#66ff99] transition-all duration-300 hover:shadow-lg h-full flex flex-col">
                <div className="text-center mb-6">
                  <h3 className="text-xl md:text-2xl font-inter-tight font-bold mb-2">
                    Básico
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Perfecto para empezar
                  </p>
                  <div className="mb-4">
                    <span className="text-3xl md:text-4xl font-bold titulo font-dsdigital">
                      $99
                    </span>
                    <span className="text-muted-foreground text-sm md:text-base">/mes</span>
                  </div>
                </div>

                <ul className="space-y-3 md:space-y-4 mb-6 md:mb-8">
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Hasta 1,000 mensajes/mes</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">WhatsApp Business</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Panel de control básico</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Soporte por email</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Entrenamiento básico de IA</span>
                  </li>
                </ul>

                <Link
                  href="https://api.whatsapp.com/send?phone=5492615131119&text=Hola!%20Visit%C3%A9%20DigiBot%20y%20estoy%20interesado%20en%20el%20plan%20básico"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-auto"
                >
                  <button className="w-full bracket-button-dark">
                    Elegir Básico
                  </button>
                </Link>
              </div>

              {/* Plan Premium - Destacado */}
              <div className="bg-card border-2 border-[#66ff99] rounded-lg p-6 md:p-8 relative hover:shadow-xl transition-all duration-300 transform hover:scale-105 h-full flex flex-col">
                <div className="absolute -top-3 md:-top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-[#66ff99] text-black px-3 md:px-4 py-1 rounded-full text-xs md:text-sm font-medium">
                    Más Popular
                  </span>
                </div>

                <div className="text-center mb-6">
                  <h3 className="text-xl md:text-2xl font-inter-tight font-bold mb-2">
                    Premium
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Ideal para marcas en crecimiento
                  </p>
                  <div className="mb-4">
                    <span className="text-3xl md:text-4xl font-bold titulo font-dsdigital">
                      $199
                    </span>
                    <span className="text-muted-foreground text-sm md:text-base">/mes</span>
                  </div>
                </div>

                <ul className="space-y-3 md:space-y-4 mb-6 md:mb-8">
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Hasta 5,000 mensajes/mes</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">
                      WhatsApp + Instagram + Facebook
                    </span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Panel de control avanzado</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Soporte prioritario</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">IA personalizada avanzada</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Estadísticas detalladas</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Integración con CRM</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Soporta audios e imágenes</span>
                  </li>
                </ul>

                <Link
                  href="https://api.whatsapp.com/send?phone=5492615131119&text=Hola!%20Visit%C3%A9%20DigiBot%20y%20estoy%20interesado%20en%20el%20plan%20premium"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-auto"
                >
                  <button className="w-full bracket-button-dark text-black border-[#66ff99]">
                    Elegir Premium
                  </button>
                </Link>
              </div>

              {/* Plan Plus+ */}
              <div className="bg-card border border-border rounded-lg p-6 md:p-8 relative hover:border-[#66ff99] transition-all duration-300 hover:shadow-lg h-full flex flex-col">
                <div className="text-center mb-6">
                  <h3 className="text-xl md:text-2xl font-inter-tight font-bold mb-2">
                    Plus+
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Para empresas grandes
                  </p>
                  <div className="mb-4">
                    <span className="text-3xl md:text-4xl font-bold titulo font-dsdigital">
                      $399
                    </span>
                    <span className="text-muted-foreground text-sm md:text-base">/mes</span>
                  </div>
                </div>

                <ul className="space-y-3 md:space-y-4 mb-6 md:mb-8">
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Mensajes ilimitados</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">
                      WhatsApp + Instagram + Facebook
                    </span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Panel empresarial completo</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Soporte 24/7</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">IA ultra personalizada</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Analytics avanzados</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Genera links de ventas</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Soporta audios e imágenes</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-[#66ff99] mr-3">✓</span>
                    <span className="text-xs md:text-sm">Entrenamiento personalizado</span>
                  </li>
                </ul>

                <Link
                  href="https://api.whatsapp.com/send?phone=5492615131119&text=Hola!%20Visit%C3%A9%20DigiBot%20y%20estoy%20interesado%20en%20el%20plan%20Plus+"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-auto"
                >
                  <button className="w-full bracket-button-dark">
                    Elegir Plus+
                  </button>
                </Link>
              </div>
            </div>
            <br />
            <br />
            <br />

            <div className="text-center mt-12">
              <p className="text-muted-foreground mb-6">
                ¿Necesitas un plan personalizado? Contáctanos para crearte una
                solución a medida
              </p>
              <Link
                href="https://api.whatsapp.com/send?phone=5492615131119&text=Hola!%20Visit%C3%A9%20DigiBot%20y%20quisiera%20conocer%20m%C3%A1s%20sobre%20sus%20planes"
                target="_blank"
                rel="noopener noreferrer"
              >
                <button className="bracket-button-dark">
                  Contactar Ventas
                </button>
              </Link>
              <br />
              <br />
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
            <Link
              href="https://api.whatsapp.com/send?phone=5492615131119&text=Hola!%20Visit%C3%A9%20DigiBot%20y%20quisiera%20agendar%20una%20cita"
              target="_blank"
              rel="noopener noreferrer"
              className="bracket-button-dark inline-block"
            >
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
                className="group w-9 h-9 inline-flex items-center justify-center rounded-full border border-border text-foreground hover:border-[#66ff99] hover:text-[#66ff99] transition-colors duration-200"
              >
                <FaFacebookF className="text-[14px]" />
                <span className="sr-only menu-footer">Facebook</span>
              </a>

              <a
                href="https://www.instagram.com/digibot_ok/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="group w-9 h-9 inline-flex items-center justify-center rounded-full border border-border text-foreground hover:border-[#66ff99] hover:text-[#66ff99] transition-colors duration-200"
              >
                <FaInstagram className="text-[16px]" />
                <span className="sr-only">Instagram</span>
              </a>

              <a
                href="https://api.whatsapp.com/send?phone=5492615131119&text=Hola!%20Visit%C3%A9%20DigiBot%20y%20quisiera%20conocer%20m%C3%A1s%20sobre%20su%20chatbot"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="group w-9 h-9 inline-flex items-center justify-center rounded-full border border-border text-foreground hover:border-[#66ff99] hover:text-[#66ff99] transition-colors duration-200 "
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
    </div>
  );
}
