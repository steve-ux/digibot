const STEPS = [
  {
    number: "01",
    title: "Nos contás tu negocio",
    text: "Productos, precios, horarios, forma de responder. Todo lo que hoy contestás a mano.",
  },
  {
    number: "02",
    title: "Entrenamos tu bot",
    text: "Le damos nombre, tono y personalidad. Conectamos WhatsApp, Instagram y Facebook.",
  },
  {
    number: "03",
    title: "Empieza a responder",
    text: "En 3 a 5 días hábiles tu bot está online. Vos seguís las conversaciones desde el panel.",
  },
];

export default function HowItWorks() {
  return (
    <section id="pasos" className="bg-muted px-5 py-16 sm:px-8 md:py-24">
      <div className="mx-auto max-w-[1200px]">
        <h2 className="font-poppins text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-[44px]">
          Cómo funciona
        </h2>
        <p className="mt-3.5 text-lg text-muted-foreground">
          Tres pasos. Nosotros hacemos el trabajo pesado.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="rounded-[22px] border border-border bg-card p-8"
            >
              <div className="font-poppins text-[15px] font-extrabold tracking-widest text-primary">
                {step.number}
              </div>
              <h3 className="mt-4 mb-2.5 font-poppins text-xl font-bold text-foreground">
                {step.title}
              </h3>
              <p className="text-base leading-relaxed text-muted-foreground">
                {step.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
