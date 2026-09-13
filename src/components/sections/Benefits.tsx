const BENEFITS = [
  {
    color: "bg-primary",
    title: "Responde como humano",
    text: "Le ponemos a tu bot el nombre y la personalización que decidas. Mensajes con humor y profesionalismo generan una conversación amena.",
  },
  {
    color: "bg-secondary",
    title: "Comunicación efectiva",
    text: "No se desvía de la conversación, siempre busca responder las dudas que puedan tener de tu negocio. Su objetivo es claro.",
  },
  {
    color: "bg-destructive",
    title: "Reduce cargas de trabajo",
    text: "Esas horas que destinabas a responder sin parar posibles clientes, ahora las podés destinar a otras áreas de tu empresa o vida personal.",
  },
  {
    color: "bg-secondary",
    title: "Automatización de ventas",
    text: "Responde las 24 horas, los 365 días del año. Apagalo y encendelo cuando vos decidas.",
  },
  {
    color: "bg-primary",
    title: "Análisis y estadísticas",
    text: "Tomá mejores decisiones en base a las estadísticas de tus chats y hacé tu propio análisis para un mejor rumbo de tu marca o empresa.",
  },
  {
    color: "bg-neutral-800 dark:bg-neutral-600",
    title: "Seguimiento para más ventas",
    text: "Tu bot tiene memoria y se programa para seguir la conversación que tuvo el día anterior de manera empática.",
  },
];

export default function Benefits() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 md:py-24">
      <h2 className="font-poppins text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-[44px]">
        Beneficios
      </h2>
      <p className="mt-3.5 text-lg text-muted-foreground">
        Lo que cambia en tu día a día desde la primera semana.
      </p>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((benefit) => (
          <div
            key={benefit.title}
            className="rounded-[22px] border border-border bg-card p-8 transition-colors hover:border-primary"
          >
            <div className={`h-[34px] w-[34px] rounded-[10px] ${benefit.color}`} />
            <h3 className="mt-5 mb-2.5 font-poppins text-xl font-bold text-foreground">
              {benefit.title}
            </h3>
            <p className="text-base leading-relaxed text-muted-foreground">
              {benefit.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
