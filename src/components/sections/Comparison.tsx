const WEAK_POINTS = [
  "Menús de opciones numeradas",
  "Sin memoria de la charla anterior",
  "No hace seguimiento",
  "No entiende audios",
];

const STRONG_POINTS = [
  "Conversa como una persona",
  "Recuerda y retoma la conversación",
  "Hace seguimiento para cerrar la venta",
  "Escucha audios y lee imágenes",
];

export default function Comparison() {
  return (
    <section className="bg-darksurface px-5 py-16 sm:px-8 md:py-24">
      <div className="mx-auto max-w-[1200px]">
        <div className="max-w-[640px]">
          <div className="font-poppins text-sm font-bold tracking-[2px] text-secondary">
            LA DIFERENCIA
          </div>
          <h2 className="mt-4 font-poppins text-3xl font-extrabold leading-tight tracking-tight text-darksurface-foreground sm:text-4xl lg:text-[46px]">
            Chatbots comunes vs DigiBot
          </h2>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-9">
            <div className="font-poppins text-xl font-bold text-neutral-400">
              Un bot sin IA
            </div>
            <p className="mt-3.5 mb-6 text-[17px] leading-relaxed text-neutral-400">
              Genera respuestas genéricas en base a un árbol de decisión, y
              cuando no sabe qué responder, desvaría.
            </p>
            <div className="flex flex-col gap-3">
              {WEAK_POINTS.map((point) => (
                <div key={point} className="flex items-center gap-3 text-base text-neutral-400">
                  <span className="h-[2px] w-5 flex-none bg-destructive" />
                  {point}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] bg-primary p-9">
            <div className="font-poppins text-xl font-bold text-white">
              DigiBot
            </div>
            <p className="mt-3.5 mb-6 text-[17px] leading-relaxed text-white/90">
              Utiliza los últimos modelos de IA para generar respuestas
              inteligentes, personalizadas y adaptadas a tu negocio.
            </p>
            <div className="flex flex-col gap-3">
              {STRONG_POINTS.map((point) => (
                <div key={point} className="flex items-center gap-3 text-base font-medium text-white">
                  <span className="h-2 w-2 flex-none rounded-full bg-secondary" />
                  {point}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
