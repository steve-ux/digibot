import { LEGAL_OWNER } from "@/lib/legal";

// Recuadro "Titular del servicio" al principio de los textos legales.
export default function LegalOwner() {
  return (
    <section aria-labelledby="titular" className="rounded-2xl border border-border bg-muted px-5 py-4 text-[15px]">
      <h2 id="titular" className="mb-1 text-base font-semibold">
        Titular del servicio
      </h2>
      <p>
        El sitio <strong>digibotlatam.com</strong> y el servicio <strong>DigiBot</strong> son operados por{" "}
        <strong>{LEGAL_OWNER.name}</strong>, {LEGAL_OWNER.taxId}, {LEGAL_OWNER.location}. En estos textos,{" "}
        <strong>{LEGAL_OWNER.tradeName}</strong> es el nombre comercial del titular.
      </p>
    </section>
  );
}
