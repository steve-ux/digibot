import VerifiedBadge from "@/components/VerifiedBadge";

export default function WhatsAppFeature() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 md:py-28">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <div className="font-poppins text-sm font-bold tracking-[2px] text-primary">
            WHATSAPP
          </div>
          <h2 className="mt-4 font-poppins text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-[42px]">
            Un número habilitado por{" "}
            <span className="inline-flex items-center gap-2">
              META Business
              <VerifiedBadge size={22} />
            </span>
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Te ofrecemos un perfil de WhatsApp único para vos con el nombre de
            tu empresa aprobado por META, de esta forma la información del
            usuario siempre estará segura, respaldada y encriptada por
            estándares internacionales. También podés usar el WhatsApp que
            actualmente uses en tu marca o empresa. Disponible en cualquier
            región.
          </p>
        </div>

        <div className="grid gap-5 rounded-[26px] border border-border bg-card p-8 sm:grid-cols-2">
          <div className="flex flex-col gap-3.5 rounded-[18px] bg-muted p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary font-poppins font-bold text-white">
                OS
              </div>
              <div>
                <div className="font-poppins text-base font-semibold text-foreground">
                  Óptica Sol
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
                  <span className="inline-block h-3.5 w-3.5 rounded-full bg-green-600" />
                  Cuenta verificada
                </div>
              </div>
            </div>
            <div className="text-sm leading-relaxed text-muted-foreground">
              Perfil de empresa aprobado por META, con nombre, logo y catálogo.
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-[18px] bg-muted p-5">
              <div className="font-poppins text-base font-semibold text-foreground">
                Cifrado de extremo a extremo
              </div>
              <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Estándares internacionales de seguridad.
              </div>
            </div>
            <div className="rounded-[18px] bg-muted p-5">
              <div className="font-poppins text-base font-semibold text-foreground">
                Tu número actual, si preferís
              </div>
              <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Disponible en cualquier región de LATAM.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
