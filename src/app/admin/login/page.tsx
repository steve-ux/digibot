"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Logo from "@/components/Logo";

// Solo se sigue un "next" interno del panel (evita redirecciones a otros sitios).
// Sin "next" (o "/admin") se va al inicio de cada persona, que devuelve el login.
function safeNext(value: string | null) {
  return value && value.startsWith("/admin/") && !value.startsWith("//") ? value : null;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const expired = searchParams.get("expirada") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrap, setBootstrap] = useState(false);

  // Mientras no haya superadmins, se puede entrar con la contraseña del panel.
  useEffect(() => {
    fetch("/api/admin/login")
      .then((r) => r.json())
      .then((d) => setBootstrap(Boolean(d.bootstrap)))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "El email o la contraseña no son correctos.");
        setLoading(false);
        return;
      }
      // Navegación completa (no router.push + refresh): el router del cliente puede tener
      // cacheada la redirección al login de antes de tener la cookie, y el refresh
      // cancelaba el push. Así se quedaba en "Ingresando..." y había que entrar dos veces.
      window.location.assign(next ?? (typeof data.home === "string" ? data.home : "/admin"));
    } catch {
      setError("No se pudo conectar con el servidor.");
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-border bg-background py-3 pl-4 text-foreground outline-none focus:border-primary";

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-[400px] rounded-[26px] border border-border bg-card p-8 shadow-[0_30px_70px_-30px_rgba(28,28,28,0.25)]"
    >
      <div className="flex items-center gap-2.5">
        <Logo />
        <span className="font-poppins text-xl font-extrabold text-foreground">DigiBot</span>
      </div>
      <h1 className="mt-6 font-poppins text-2xl font-bold text-foreground">Entrá al panel</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Usá el email y la contraseña de tu usuario.</p>

      {expired && (
        <p className="mt-4 rounded-xl bg-muted px-3 py-2 text-sm text-foreground">
          Tu sesión venció o cambió tu acceso. Volvé a entrar.
        </p>
      )}

      {bootstrap && (
        <p className="mt-4 rounded-xl border border-yellow-400/40 bg-yellow-400/10 px-3 py-2 text-sm text-foreground">
          <strong>Primera vez:</strong> todavía no hay superadmins. Entrá con la contraseña del panel (el email
          puede quedar vacío) y creá tu usuario en Cuentas → Superadmins.
        </p>
      )}

      <label htmlFor="admin-email" className="mt-6 block text-sm font-medium text-foreground">
        Email
      </label>
      <input
        id="admin-email"
        type="email"
        autoFocus
        autoComplete="username"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={`mt-2 pr-4 ${inputClass}`}
        placeholder="vos@tunegocio.com"
      />

      <label htmlFor="admin-password" className="mt-4 block text-sm font-medium text-foreground">
        Contraseña
      </label>
      <div className="relative mt-2">
        <input
          id="admin-password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`pr-12 ${inputClass}`}
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={showPassword}
          title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-primary"
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || password.length === 0 || (!bootstrap && email.trim().length === 0)}
        className="mt-6 w-full rounded-full bg-primary py-3.5 font-poppins text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "Ingresando..." : "Ingresar"}
      </button>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        ¿Te olvidaste la contraseña? Pedile a un administrador un link nuevo desde Equipo.
      </p>
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
