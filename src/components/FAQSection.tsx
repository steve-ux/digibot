const FAQS = [
  {
    q: "¿Cómo funciona DigiBot?",
    a: "DigiBot es un asistente de Inteligencia Artificial que se integra con WhatsApp, Instagram y Facebook. Entrenamos la IA específicamente para tu negocio, aprendiendo sobre tus productos, servicios y la forma en que querés que responda a tus clientes. El bot puede responder preguntas, hacer seguimiento de ventas y derivar conversaciones a humanos cuando sea necesario.",
  },
  {
    q: "¿Mi bot tendrá nombre propio?",
    a: "¡Sí! Cuando personalizamos el bot con el sentido del humor y profesionalismo que más se ajuste a tu empresa, le asignamos también el nombre más acorde a tu marca.",
  },
  {
    q: "¿Cuánto tiempo tarda en estar listo mi bot?",
    a: "El tiempo de implementación depende de la complejidad de tu negocio y la información que necesitemos procesar. En general, un bot básico puede estar funcionando en 3-5 días hábiles, mientras que una implementación más avanzada puede tomar 1-2 semanas. Esto incluye el entrenamiento de la IA, la configuración de las plataformas, la aprobación de META y las pruebas necesarias.",
  },
  {
    q: "¿Puedo usar mi WhatsApp actual?",
    a: "Sí, podés usar tu número de WhatsApp actual. También te ofrecemos la opción de obtener un número nuevo habilitado por META Business específicamente para tu empresa. Ambas opciones son válidas y te ayudamos con la configuración. La ventaja de usar un número empresarial es que tus clientes verán el nombre de tu empresa en lugar de un número personal. De usar tu número actual, perdés acceso a usar la app de WhatsApp en el celular.",
  },
  {
    q: "¿Qué pasa si el bot no puede responder una pregunta?",
    a: "El bot está configurado para derivar automáticamente al cliente a un agente humano cuando no puede resolver una consulta o cuando el cliente lo solicita explícitamente. Esto asegura que ningún cliente quede sin respuesta.",
  },
  {
    q: "¿Puedo modificar las respuestas del bot después?",
    a: "Absolutamente. El bot aprende y mejora continuamente. Podés actualizar la información, agregar nuevos productos, modificar precios o ajustar las respuestas en cualquier momento a través de soporte. Los cambios se reflejan automáticamente en las conversaciones del bot. También podés revisar las conversaciones y ajustar las respuestas basándote en las consultas reales de tus clientes.",
  },
  {
    q: "¿Hay algún costo de configuración inicial?",
    a: "Sí, hay un único monto de configuración inicial. Luego se abona mensualmente la suscripción. El precio que ves en nuestros planes incluye todo: el entrenamiento de la IA, la configuración en las plataformas, las pruebas y el soporte. La tarifa mensual del plan que elijas no trae sorpresas ni costos adicionales. Podés dar de baja cuando quieras.",
  },
  {
    q: "¿El panel de cliente es fácil de usar?",
    a: "Totalmente. Nuestro panel es 100% intuitivo y minimalista, fácil de usar desde el primer uso. Además contás con todo el soporte necesario para su entendimiento y una introducción para usar el sistema.",
  },
];

export default function FAQSection() {
  return (
    <section id="faq" className="mx-auto max-w-[900px] px-5 py-16 sm:px-8 md:py-24">
      <h2 className="font-poppins text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-[44px]">
        Preguntas frecuentes
      </h2>
      <p className="mt-3.5 mb-11 text-lg text-muted-foreground">
        Resolvemos las dudas más comunes sobre DigiBot.
      </p>

      <div className="flex flex-col gap-3">
        {FAQS.map((faq) => (
          <details
            key={faq.q}
            className="group rounded-[18px] border border-border bg-card px-6 py-5 sm:px-7"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-4 font-poppins text-lg font-semibold text-foreground sm:text-[19px]">
              {faq.q}
              <span className="flex-none font-bold text-primary transition-transform duration-200 group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3.5 text-base leading-relaxed text-muted-foreground">
              {faq.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
