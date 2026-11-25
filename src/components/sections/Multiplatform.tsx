import Image from "next/image";

const CHANNELS = [
  "WhatsApp",
  "Instagram",
  "Facebook",
  "Messenger",
  "TikTok",
  "Threads",
  "YouTube",
  "Telegram",
];

export default function Multiplatform() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 md:py-28">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="order-2 flex justify-center lg:order-1">
          <Image
            src="/redes%20sociales%20digibot.png"
            alt="Celular rodeado de los íconos de WhatsApp, Instagram, Facebook, Messenger, TikTok, Threads, YouTube y Telegram"
            width={1200}
            height={896}
            sizes="(min-width: 1024px) 560px, 100vw"
            className="h-auto w-full max-w-[560px]"
          />
        </div>

        <div className="order-1 lg:order-2">
          <div className="font-poppins text-sm font-bold tracking-[2px] text-primary">
            MULTIPLATAFORMA
          </div>
          <h2 className="mt-4 font-poppins text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-[42px]">
            Un CRM para todas tus redes sociales
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            DigiBot no es solo WhatsApp. Centralizá en un único panel los
            mensajes y comentarios de todas las redes donde está tu marca:
            respondé desde un solo lugar, dejá que el bot atienda por vos y
            no pierdas ninguna conversación, venga de donde venga.
          </p>
          <ul className="mt-7 flex flex-wrap gap-2.5">
            {CHANNELS.map((name) => (
              <li
                key={name}
                className="rounded-full border border-border bg-muted px-4 py-2 font-poppins text-sm font-semibold text-foreground"
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
