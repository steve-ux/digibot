"use client";

import Link from "next/link";

export default function FAQSection() {
  const toggleFAQ = (faqId: string) => {
    const content = document.getElementById(`${faqId}-content`);
    const icon = document.getElementById(`${faqId}-icon`);
    if (content && icon) {
      content.classList.toggle('hidden');
      icon.classList.toggle('rotate-180');
    }
  };

  return (
    <section className="py-20 bg-card">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-inter-tight font-bold mb-4">
            Preguntas Frecuentes
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Resolvemos las dudas más comunes sobre DigiBot
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="space-y-4">
            {/* FAQ Item 1 */}
            <div className="bg-background border border-border rounded-lg overflow-hidden">
              <button 
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-muted/50 transition-colors duration-200"
                onClick={() => toggleFAQ('faq-1')}
              >
                <h3 className="text-lg font-medium">¿Cómo funciona DigiBot?</h3>
                <svg 
                  id="faq-1-icon"
                  className="w-5 h-5 transition-transform duration-200" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div id="faq-1-content" className="hidden px-6 pb-4">
                <p className="text-muted-foreground">
                  DigiBot es un asistente de Inteligencia Artificial que se integra con WhatsApp, Instagram y Facebook. Entrenamos la IA específicamente para tu negocio, aprendiendo sobre tus productos, servicios y la forma en que querés que responda a tus clientes. El bot puede responder preguntas, gestionar citas, hacer seguimiento de ventas y derivar conversaciones a humanos cuando sea necesario.
                </p>
              </div>
            </div>

            {/* FAQ Item 2 */}
            <div className="bg-background border border-border rounded-lg overflow-hidden">
              <button 
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-muted/50 transition-colors duration-200"
                onClick={() => toggleFAQ('faq-2')}
              >
                <h3 className="text-lg font-medium">¿Cuánto tiempo tarda en estar listo mi bot?</h3>
                <svg 
                  id="faq-2-icon"
                  className="w-5 h-5 transition-transform duration-200" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div id="faq-2-content" className="hidden px-6 pb-4">
                <p className="text-muted-foreground">
                  El tiempo de implementación depende de la complejidad de tu negocio y la información que necesitemos procesar. En general, un bot básico puede estar funcionando en 3-5 días hábiles, mientras que una implementación más avanzada puede tomar 1-2 semanas. Esto incluye el entrenamiento de la IA, la configuración de las plataformas y las pruebas necesarias.
                </p>
              </div>
            </div>

            {/* FAQ Item 3 */}
            <div className="bg-background border border-border rounded-lg overflow-hidden">
              <button 
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-muted/50 transition-colors duration-200"
                onClick={() => toggleFAQ('faq-3')}
              >
                <h3 className="text-lg font-medium">¿Puedo usar mi WhatsApp actual?</h3>
                <svg 
                  id="faq-3-icon"
                  className="w-5 h-5 transition-transform duration-200" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div id="faq-3-content" className="hidden px-6 pb-4">
                <p className="text-muted-foreground">
                  Sí, podés usar tu número de WhatsApp actual. También te ofrecemos la opción de obtener un número nuevo habilitado por META Business específicamente para tu empresa. Ambas opciones son válidas y te ayudamos con la configuración. La ventaja de usar un número empresarial es que tus clientes verán el nombre de tu empresa en lugar de un número personal.
                </p>
              </div>
            </div>

            {/* FAQ Item 4 */}
            <div className="bg-background border border-border rounded-lg overflow-hidden">
              <button 
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-muted/50 transition-colors duration-200"
                onClick={() => toggleFAQ('faq-4')}
              >
                <h3 className="text-lg font-medium">¿Qué pasa si el bot no puede responder una pregunta?</h3>
                <svg 
                  id="faq-4-icon"
                  className="w-5 h-5 transition-transform duration-200" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div id="faq-4-content" className="hidden px-6 pb-4">
                <p className="text-muted-foreground">
                  El bot está configurado para derivar automáticamente al cliente a un agente humano cuando no puede resolver una consulta o cuando el cliente lo solicita explícitamente. Además, podés configurar el bot para que te notifique sobre conversaciones que requieren atención humana. Esto asegura que ningún cliente quede sin respuesta.
                </p>
              </div>
            </div>

            {/* FAQ Item 5 */}
            <div className="bg-background border border-border rounded-lg overflow-hidden">
              <button 
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-muted/50 transition-colors duration-200"
                onClick={() => toggleFAQ('faq-5')}
              >
                <h3 className="text-lg font-medium">¿Puedo modificar las respuestas del bot después?</h3>
                <svg 
                  id="faq-5-icon"
                  className="w-5 h-5 transition-transform duration-200" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div id="faq-5-content" className="hidden px-6 pb-4">
                <p className="text-muted-foreground">
                  Absolutamente. El bot aprende y mejora continuamente. Podés actualizar la información, agregar nuevos productos, modificar precios o ajustar las respuestas en cualquier momento a través del panel de control. Los cambios se reflejan automáticamente en las conversaciones del bot. También podés revisar las conversaciones y ajustar las respuestas basándote en las consultas reales de tus clientes.
                </p>
              </div>
            </div>

            {/* FAQ Item 6 */}
            <div className="bg-background border border-border rounded-lg overflow-hidden">
              <button 
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-muted/50 transition-colors duration-200"
                onClick={() => toggleFAQ('faq-6')}
              >
                <h3 className="text-lg font-medium">¿Hay algún costo de configuración inicial?</h3>
                <svg 
                  id="faq-6-icon"
                  className="w-5 h-5 transition-transform duration-200" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div id="faq-6-content" className="hidden px-6 pb-4">
                <p className="text-muted-foreground">
                  No hay costos ocultos ni de configuración inicial. El precio que ves en nuestros planes incluye todo: el entrenamiento de la IA, la configuración en las plataformas, las pruebas y el soporte durante el primer mes. Solo pagás la tarifa mensual del plan que elijas, sin sorpresas ni costos adicionales.
                </p>
              </div>
            </div>

          </div>

          {/* <div className="text-center mt-12">
            <p className="text-muted-foreground mb-6">
              ¿Tenés más preguntas? Estamos para ayudarte
            </p>
            <Link href="https://api.whatsapp.com/send?phone=5492615131119&text=Hola!%20Tengo%20preguntas%20sobre%20DigiBot">
              <button className="bracket-button-dark">
                Contactanos
              </button>
            </Link>
          </div> */}
        </div>
      </div>
    </section>
  );
}
