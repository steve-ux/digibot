"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Logo from "@/components/Logo";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin/bandeja";

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

      <label
        htmlFor="admin-password"
        className="mt-6 block text-sm font-medium text-foreground"
      >
        Contraseña
      </label>
      <div className="relative mt-2">
        <input
          id="admin-password"
          type={showPassword ? "text" : "password"}
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-border bg-background py-3 pl-4 pr-12 text-foreground outline-none focus:border-primary"
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={
            showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
          }
          aria-pressed={showPassword}
          title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-primary"
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

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
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex flex-1 items-center justify-center px-5 py-16 sm:py-24">
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
