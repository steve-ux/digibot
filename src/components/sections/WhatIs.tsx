const TAGS = ["Escucha audios", "Agenda citas", "Hace seguimiento", "Deriva a un humano"];

const FEATURES = [
  {
    color: "bg-primary",
    title: "Lee y entiende el mensaje",
    text: "Texto, audio o imagen. No un árbol de opciones.",
  },
  {
    color: "bg-secondary",
    title: "Responde con tus datos reales",
    text: "Stock, precios e info de tu negocio, actualizados.",
  },
  {
    color: "bg-destructive",
    title: "Retoma la conversación",
    text: "Tiene memoria y sigue donde quedaron ayer.",
  },
  {
    color: "bg-neutral-800 dark:bg-neutral-600",
    title: "Te pasa la posta",
    text: "Cuando el cliente pide un humano, entrás vos.",
  },
];

export default function WhatIs() {
  return (
    <section id="que-es" className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 md:py-28">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <div className="font-poppins text-sm font-bold tracking-[2px] text-primary">
            DIGIBOT
          </div>
          <h2 className="mt-4 font-poppins text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-[46px]">
            Respuestas rápidas a tus clientes, sin que tengas que estar
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Desarrollamos una plataforma con Inteligencia Artificial en la que
            entrenamos por vos una IA que asesora a tus clientes a través de
            WhatsApp, Instagram y Facebook, escucha audios, lee los mensajes y
            los contesta, de esta forma te asegurás que tu empresa tenga una
            excelente atención al cliente y no pierdas ventas por no responder
            los mensajes a tiempo.
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            {TAGS.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border bg-muted px-4 py-2.5 text-sm font-medium text-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3.5 rounded-[26px] border border-border bg-card p-7">
          {FEATURES.map((feature, i) => (
            <div key={feature.title}>
              <div className="flex items-start gap-3.5">
                <div className={`h-9 w-9 flex-none rounded-[11px] ${feature.color}`} />
                <div>
                  <div className="font-poppins text-[17px] font-semibold text-foreground">
                    {feature.title}
                  </div>
                  <div className="mt-0.5 text-[15px] text-muted-foreground">
                    {feature.text}
                  </div>
                </div>
              </div>
              {i < FEATURES.length - 1 && (
                <div className="mt-3.5 h-px bg-border" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
