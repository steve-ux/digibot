import { WA_LINKS } from "@/lib/whatsapp";

export default function CtaBanner() {
  return (
    <section className="bg-muted px-5 pb-24 pt-16 sm:px-8 sm:pt-20">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-12 rounded-[32px] bg-darksurface px-6 py-12 sm:px-12 sm:py-16 md:py-20">
        <div className="min-w-[320px] flex-1">
          <h2 className="max-w-[640px] font-poppins text-2xl font-extrabold leading-tight tracking-tight text-darksurface-foreground sm:text-4xl lg:text-[46px]">
            Comenzá a explorar el poder de la IA en tu negocio
          </h2>
          <p className="mt-4 text-base text-neutral-400 sm:mt-5 sm:text-lg">
            Contanos qué vendés y te mostramos el bot funcionando.
          </p>
        </div>
        <div className="flex flex-wrap gap-3.5">
          <a
            href={WA_LINKS.cita}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-full bg-secondary px-8 py-[18px] font-poppins text-base font-bold text-secondary-foreground transition-colors hover:opacity-90"
          >
            Agendá una cita
          </a>
          <a
            href={WA_LINKS.general}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-full border border-white/20 px-8 py-[18px] font-poppins text-base font-semibold text-white transition-colors hover:border-white"
          >
            Chatear con la IA
          </a>
        </div>
      </div>
    </section>
  );
}
