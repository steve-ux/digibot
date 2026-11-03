"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const MIN = 10;

export default function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= MIN && confirm === password && !loading;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/invitacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.fields?.password || data.message || "No se pudo crear la contraseña.");
        setLoading(false);
        return;
      }
      router.push(typeof data.home === "string" ? data.home : "/admin");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
      setLoading(false);
    }
  };

  const input =
    "w-full rounded-xl border border-border bg-background py-3 pl-4 pr-12 text-foreground outline-none focus:border-primary";

  return (
    <form onSubmit={submit} className="mt-5">
      <label htmlFor="new-password" className="block text-sm font-medium">
        Contraseña
      </label>
      <div className="relative mt-2">
        <input
          id="new-password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={tooShort}
          aria-describedby="password-help"
          className={input}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-primary"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      <p id="password-help" className={`mt-1.5 text-xs ${tooShort ? "text-destructive" : "text-muted-foreground"}`}>
        Al menos {MIN} caracteres. Una frase que te acuerdes es ideal.
      </p>

      <label htmlFor="confirm-password" className="mt-4 block text-sm font-medium">
        Repetila
      </label>
      <input
        id="confirm-password"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        aria-invalid={mismatch}
        className={`mt-2 ${input}`}
      />
      {mismatch && <p className="mt-1.5 text-xs text-destructive">Las contraseñas no coinciden.</p>}

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-6 w-full rounded-full bg-primary py-3.5 font-poppins text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "Guardando..." : "Crear contraseña y entrar"}
      </button>
    </form>
  );
}
