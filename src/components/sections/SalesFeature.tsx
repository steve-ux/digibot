import Image from "next/image";

export default function SalesFeature() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 md:py-28">
      <div className="flex flex-wrap items-center gap-10 lg:gap-16">
        <div className="min-w-0 flex-[1.3_1_430px] rounded-[26px] border border-border bg-card p-7">
          <div className="chat-pattern flex flex-col gap-3 rounded-2xl p-4">
            <div className="self-end max-w-[70%] rounded-2xl rounded-br-[4px] bg-card px-4 py-3 text-[15px] text-foreground shadow-sm">
              Cuánto sale el modelo Aura?
            </div>
            <div className="self-start max-w-[88%] rounded-2xl rounded-bl-[4px] bg-primary px-4 py-3.5 text-[15px] leading-relaxed text-white">
              Aura polarizado: $48.000 ARS. Tenemos stock en negro y tortuga.
              Te genero el link de pago?
            </div>
            <div className="self-end max-w-[70%] rounded-2xl rounded-br-[4px] bg-card px-4 py-3 text-[15px] text-foreground shadow-sm">
              Sí, en negro
            </div>
            <div className="flex max-w-[88%] flex-wrap items-center gap-3.5 self-start rounded-2xl border border-border bg-card p-4">
              <Image
                src="/aura-polarizado.webp"
                alt="Aura Polarizado · Negro"
                width={46}
                height={46}
                className="h-[46px] w-[46px] flex-none rounded-xl object-cover"
              />
              <div className="min-w-[120px] flex-1">
                <div className="font-poppins text-[15px] font-semibold text-foreground">
                  Aura Polarizado · Negro
                </div>
                <div className="text-[13px] text-muted-foreground">
                  Pago en 1 clic · $48.000 ARS
                </div>
              </div>
              <div className="w-full rounded-full bg-secondary py-2.5 text-center font-poppins text-[13px] font-bold text-secondary-foreground">
                Pagar ahora
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-[1_1_300px]">
          <div className="font-poppins text-sm font-bold tracking-[2px] text-primary">
            VENTAS
          </div>
          <h2 className="mt-4 font-poppins text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-[42px]">
            Vendé en automático tus productos, día y noche
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Entrenamos el bot para uso exclusivo de tu marca y lo nutrimos de
            una base de datos pensada y ajustada a cada necesidad. Mantenemos
            actualizado tu bot con datos en tiempo real de tus productos,
            precios o la información relevante de tu negocio.
          </p>
        </div>
      </div>
    </section>
  );
}
