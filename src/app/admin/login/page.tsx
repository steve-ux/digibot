"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin/plantillas";

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Contraseña incorrecta.");
      return;
    }

    router.push(next);
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-5">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[380px] rounded-[26px] border border-border bg-card p-8 shadow-[0_30px_70px_-30px_rgba(28,28,28,0.25)]"
      >
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="font-poppins text-xl font-extrabold text-foreground">
            DigiBot
          </span>
        </div>
        <h1 className="mt-6 font-poppins text-2xl font-bold text-foreground">
          Panel interno
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Acceso exclusivo del equipo DigiBot.
        </p>

        <label className="mt-6 block text-sm font-medium text-foreground">
          Contraseña
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
            placeholder="••••••••"
          />
        </label>

        {error && (
          <p className="mt-3 text-sm font-medium text-destructive">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="mt-6 w-full rounded-full bg-primary py-3.5 font-poppins text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
