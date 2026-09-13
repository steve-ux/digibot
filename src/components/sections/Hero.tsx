import { WA_LINKS } from "@/lib/whatsapp";
import VerifiedBadge from "@/components/VerifiedBadge";

const STATS = [
  { value: "24/7", label: "Sin horarios ni feriados" },
  { value: "3-5 días", label: "Y tu bot está online" },
  { value: "100%", label: "Personalizado a tu marca" },
];

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <video
        src="/eKoddex glitch.mp4"
        autoPlay
        muted
        loop
        playsInline
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
      />
      <div className="absolute inset-0 bg-background/85" />

      <div className="relative mx-auto grid max-w-[1200px] items-center gap-10 px-5 py-16 sm:px-8 md:grid-cols-2 md:py-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-2 text-[13px] font-semibold text-primary">
            <span
              className="inline-block h-[7px] w-[7px] rounded-full bg-secondary"
              style={{ animation: "beat 1.6s ease-in-out infinite" }}
            />
            WhatsApp · Instagram · Facebook
          </div>

          <h1 className="mt-6 font-poppins text-[38px] font-extrabold leading-[1.04] tracking-tight text-foreground sm:text-5xl lg:text-[72px]">
            Conversaciones
            <br />
            que <span className="text-primary">venden.</span>
          </h1>

          <p className="mt-6 max-w-[520px] text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Tu negocio nunca duerme. Nuestro chatbot tampoco. Entrenamos una IA
            con la información de tu empresa para que responda, asesore y
            venda por vos, las 24 horas.
          </p>

          <div className="mt-9 flex flex-wrap gap-3.5">
            <a
              href={WA_LINKS.general}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full bg-primary px-7 py-4 font-poppins text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Chatear con la IA
            </a>
            <a
              href="#planes"
              className="rounded-full border border-border bg-background px-7 py-4 font-poppins text-base font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              Ver planes
            </a>
          </div>

          <div className="mt-12 flex gap-10">
            {STATS.map((stat) => (
              <div key={stat.value}>
                <div className="font-poppins text-[30px] font-bold text-foreground">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-border bg-card p-5 shadow-[0_30px_70px_-30px_rgba(28,28,28,0.25)]">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-poppins text-[15px] font-bold text-white">
              D
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-poppins text-[15px] font-semibold text-foreground">
                DigiBot · Óptica Sol
                <VerifiedBadge size={14} />
              </div>
              <div className="text-xs font-semibold text-green-600">
                en línea
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-secondary" />
              <span className="text-[11px] font-semibold text-muted-foreground">
                IA activa
              </span>
            </div>
          </div>

          <div className="chat-pattern mt-4 flex flex-col gap-3 rounded-2xl p-4">
            <div className="self-end max-w-[78%] rounded-2xl rounded-br-[4px] bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground shadow-sm">
              Hola, tienen lentes de sol polarizados?
            </div>
            <div className="self-start max-w-[82%] rounded-2xl rounded-bl-[4px] bg-primary px-4 py-3 text-[15px] leading-relaxed text-white">
              Sí! Tenemos 4 modelos polarizados desde $48.000. Te muestro los
              dos más vendidos?
            </div>
            <div className="self-end max-w-[78%] rounded-2xl rounded-br-[4px] bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground shadow-sm">
              Dale. Los tienen en Mendoza?
            </div>
            <div className="flex items-center gap-1.5 self-start rounded-2xl rounded-bl-[4px] bg-primary px-[18px] py-4">
              <span
                className="inline-block h-[7px] w-[7px] rounded-full bg-secondary"
                style={{ animation: "dot 1.4s infinite" }}
              />
              <span
                className="inline-block h-[7px] w-[7px] rounded-full bg-secondary"
                style={{ animation: "dot 1.4s infinite", animationDelay: "0.2s" }}
              />
              <span
                className="inline-block h-[7px] w-[7px] rounded-full bg-secondary"
                style={{ animation: "dot 1.4s infinite", animationDelay: "0.4s" }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
