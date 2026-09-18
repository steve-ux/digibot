"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Status = "idle" | "loading" | "success" | "error";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!acceptedPolicy) {
      setStatus("error");
      setErrorMessage("Tenés que aceptar la política de privacidad para continuar.");
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, acceptedPolicy, website }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data?.message || "Algo salió mal. Probá de nuevo.");
        return;
      }

      setStatus("success");
      setName("");
      setPhone("");
      setAcceptedPolicy(false);
    } catch {
      setStatus("error");
      setErrorMessage("No pudimos conectar con el servidor. Probá de nuevo en un momento.");
    }
  }

  if (status === "success") {
    return (
      <section id="contacto" className="bg-darksurface px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-[720px] rounded-[32px] border border-white/10 bg-white/5 px-6 py-14 text-center sm:px-12">
          <h2 className="font-poppins text-2xl font-extrabold tracking-tight text-darksurface-foreground sm:text-3xl">
            ¡Listo, recibimos tus datos!
          </h2>
          <p className="mt-3 text-base text-neutral-400">
            En breve nos contactamos con vos por WhatsApp o teléfono.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="contacto" className="bg-darksurface px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-[720px] text-center">
        <h2 className="font-poppins text-2xl font-extrabold tracking-tight text-darksurface-foreground sm:text-3xl lg:text-[38px]">
          Dejanos tus datos y te contactamos
        </h2>
        <p className="mt-3 text-base text-neutral-400 sm:text-lg">
          Contanos cómo comunicarnos con vos y te asesoramos sin compromiso.
        </p>

        <form onSubmit={handleSubmit} className="mt-8" noValidate>
          {/* Honeypot: oculto para personas, visible para bots */}
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />

          <div className="flex flex-wrap items-center justify-center gap-3.5">
            <input
              type="text"
              required
              placeholder="Ingresa tu nombre*"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-[220px] flex-1 rounded-full border border-white/20 bg-white/5 px-6 py-[18px] text-base text-darksurface-foreground placeholder:text-neutral-500 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
            <input
              type="tel"
              required
              placeholder="Ingresa tu número*"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="min-w-[220px] flex-1 rounded-full border border-white/20 bg-white/5 px-6 py-[18px] text-base text-darksurface-foreground placeholder:text-neutral-500 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="rounded-full bg-secondary px-8 py-[18px] font-poppins text-base font-bold text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "loading" ? "Enviando..." : "Lo quiero"}
            </button>
          </div>

          <label className="mt-5 flex items-center justify-center gap-2 text-sm text-neutral-400">
            <input
              type="checkbox"
              required
              checked={acceptedPolicy}
              onChange={(e) => setAcceptedPolicy(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/5 accent-secondary focus:ring-secondary/30"
            />
            He leído y acepto la{" "}
            <Link href="/politica-de-privacidad" className="text-secondary underline hover:text-white">
              política de privacidad
            </Link>
          </label>

          {status === "error" && (
            <p className="mt-3 text-sm text-destructive">{errorMessage}</p>
          )}
        </form>
      </div>
    </section>
  );
}
