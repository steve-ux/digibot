"use client";

// Pestañas personales de Configuración (las ve cualquier rol): foto de perfil,
// sonidos de mensajes nuevos y datos para soporte (versión del panel).

import { useEffect, useRef, useState } from "react";
import { useCrmShell } from "@/components/crm/CrmShell";
import Icon from "@/components/crm/Icon";
import { useToast } from "@/components/crm/Toast";
import UserAvatar from "@/components/crm/UserAvatar";
import { playSound, unlockAudio } from "@/components/crm/sound-player";
import { CHANNEL_IDS, CHANNELS } from "@/lib/crm/channels";
import {
  SOUND_IDS,
  SOUND_LABELS,
  UPCOMING_SOUND_CHANNELS,
  type ChannelSound,
  type SoundChannelId,
  type SoundPrefs,
} from "@/lib/crm/sound-prefs";

// Filas de Sonidos: los canales de Meta y, al final, YouTube, Telegram y TikTok (plan Plus+).
const SOUND_ROWS: { id: SoundChannelId; name: string; icon: string }[] = [
  ...CHANNEL_IDS.map((id) => ({ id, name: CHANNELS[id].longName, icon: CHANNELS[id].icon })),
  ...UPCOMING_SOUND_CHANNELS,
];
import { currentBuild, isOutdated, type BuildInfo } from "@/lib/version";
import { waLink } from "@/lib/whatsapp";

const card = "rounded-card border border-crm-border bg-crm-card px-5 py-5 md:px-[22px]";
const chipButton =
  "flex h-10 items-center gap-2 rounded-pill border border-crm-border bg-crm-chip px-4 text-[13px] font-semibold text-crm-ink-2 transition-colors hover:border-crm-primary hover:text-crm-primary disabled:opacity-60";

async function send<T>(url: string, method: string, body?: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Algo salió mal.");
  return data as T;
}

// ---------- Mi perfil ----------

const AVATAR_SIZE = 256;

// Recorta al centro en cuadrado y lo achica a 256x256 (WebP si el navegador lo
// soporta; si no, JPEG). Así se sube una foto liviana aunque venga del celular.
async function toAvatarDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se pudo leer la imagen. Probá con un JPG o PNG."));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Tu navegador no permite procesar la imagen.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE
    );
    const webp = canvas.toDataURL("image/webp", 0.85);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProfilePanel() {
  const { user, avatarUrl, setAvatarUrl } = useCrmShell();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Elegí una imagen (JPG, PNG o WebP).");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("La imagen pesa más de 15 MB. Probá con otra.");
      return;
    }
    setBusy(true);
    try {
      const image = await toAvatarDataUrl(file);
      const data = await send<{ avatarUrl: string | null }>("/api/admin/perfil/avatar", "PUT", { image });
      setAvatarUrl(data.avatarUrl);
      toast("Foto actualizada");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setError("");
    setBusy(true);
    try {
      await send("/api/admin/perfil/avatar", "DELETE");
      setAvatarUrl(null);
      toast("Foto quitada");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className={`${card} flex flex-wrap items-center gap-5`}>
        <UserAvatar name={user.name} url={avatarUrl} size={88} />
        <div className="min-w-[200px] flex-1">
          <div className="text-[17px] font-semibold text-crm-ink">{user.name}</div>
          {user.email && <div className="text-sm text-crm-muted">{user.email}</div>}
          <div className="mt-1.5 inline-flex rounded-pill border border-crm-tint-border bg-crm-tint px-3 py-[3px] text-xs font-semibold text-crm-primary">
            {user.roleLabel}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            className="hidden"
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <button
            onClick={() => input.current?.click()}
            disabled={busy || user.bootstrap}
            className="flex h-[46px] items-center gap-2 rounded-pill bg-crm-primary px-[22px] font-poppins text-[15px] font-semibold text-white transition-colors hover:bg-crm-primary-hover disabled:bg-crm-primary-soft"
          >
            {busy ? "Guardando…" : avatarUrl ? "Cambiar foto" : "Subir foto"}
          </button>
          {avatarUrl && (
            <button onClick={remove} disabled={busy} className={`${chipButton} h-[46px]`}>
              <Icon name="trash" size={16} />
              Quitar
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="m-0 rounded-field bg-crm-error-bg px-3 py-2 text-sm text-crm-error-ink">
          {error}
        </p>
      )}
      <p className="m-0 text-[13px] text-crm-muted">
        {user.bootstrap
          ? "Estás con el acceso inicial: creá tu usuario en Cuentas → Superadmins para tener foto propia."
          : "Se recorta en cuadrado y se ve en el menú del panel. JPG, PNG o WebP."}
      </p>
    </div>
  );
}

// ---------- Sonidos ----------

const SAVE_DELAY_MS = 600;

export function SoundsPanel() {
  const { sounds, setSounds } = useCrmShell();
  const toast = useToast();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  // Se aplica al instante en el panel y se guarda un momento después (el volumen cambia seguido).
  const update = (next: SoundPrefs) => {
    setSounds(next);
    setState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await send("/api/admin/perfil", "PATCH", { sounds: next });
        setState("saved");
      } catch (err) {
        setState("error");
        toast((err as Error).message, "error");
      }
    }, SAVE_DELAY_MS);
  };

  const test = (sound: ChannelSound) => {
    if (sound === "off") return;
    unlockAudio();
    playSound(sound, sounds.volume || 70, true);
  };

  const setChannel = (id: SoundChannelId, sound: ChannelSound) => {
    update({ ...sounds, channels: { ...sounds.channels, [id]: sound } });
    test(sound);
  };

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className={`${card} flex flex-col gap-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="text-[15px] font-semibold text-crm-ink">Sonar cuando llega un mensaje</div>
            <div className="text-[13px] text-crm-muted">
              Cada canal tiene su sonido para que sepas de dónde viene sin mirar. Solo suenan los mensajes de clientes.
            </div>
          </div>
          <button
            role="switch"
            aria-checked={sounds.enabled}
            aria-label="Sonidos de mensajes nuevos"
            onClick={() => update({ ...sounds, enabled: !sounds.enabled })}
            className={`relative h-8 w-14 shrink-0 rounded-pill transition-colors ${sounds.enabled ? "bg-crm-primary" : "bg-crm-border-2"}`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${sounds.enabled ? "left-7" : "left-1"}`}
            />
          </button>
        </div>

        <div className={`flex flex-wrap items-center gap-3 ${sounds.enabled ? "" : "opacity-50"}`}>
          <label htmlFor="sound-volume" className="w-20 text-sm font-semibold text-crm-ink">
            Volumen
          </label>
          <input
            id="sound-volume"
            type="range"
            min={0}
            max={100}
            step={5}
            value={sounds.volume}
            disabled={!sounds.enabled}
            onChange={(e) => update({ ...sounds, volume: Number(e.target.value) })}
            onPointerUp={() => test(sounds.channels.wa === "off" ? "bubble" : sounds.channels.wa)}
            className="min-w-[160px] flex-1 accent-[var(--crm-primary)]"
          />
          <span className="w-12 text-right text-sm tabular-nums text-crm-muted">{sounds.volume}%</span>
        </div>
      </div>

      <div className={`rounded-card border border-crm-border bg-crm-card px-4 py-1.5 md:px-[22px] ${sounds.enabled ? "" : "opacity-50"}`}>
        {SOUND_ROWS.map(({ id, name, icon }, i) => {
          const value = sounds.channels[id];
          return (
            <div key={id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 ${i ? "border-t border-crm-border" : ""}`}>
              <div className="flex min-w-0 flex-[1_1_200px] items-center gap-3">
                <img src={icon} alt="" width={26} height={26} className="h-[26px] w-[26px] shrink-0 object-contain" />
                <label htmlFor={`sound-${id}`} className="truncate text-[15px] font-semibold text-crm-ink">
                  {name}
                </label>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <select
                  id={`sound-${id}`}
                  value={value}
                  disabled={!sounds.enabled}
                  onChange={(e) => setChannel(id, e.target.value as ChannelSound)}
                  className="h-10 cursor-pointer rounded-field border border-crm-border bg-crm-surf px-3 text-sm text-crm-ink outline-none focus:border-crm-primary"
                >
                  {SOUND_IDS.map((s) => (
                    <option key={s} value={s}>
                      {SOUND_LABELS[s]}
                    </option>
                  ))}
                  <option value="off">Sin sonido</option>
                </select>
                <button
                  onClick={() => test(value)}
                  disabled={!sounds.enabled || value === "off"}
                  aria-label={`Probar el sonido de ${name}`}
                  title="Probar"
                  className="flex h-10 w-10 items-center justify-center rounded-pill border border-crm-border bg-crm-chip text-crm-ink-2 transition-colors hover:border-crm-primary hover:text-crm-primary disabled:opacity-50"
                >
                  <Icon name="play" size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="m-0 text-[13px] text-crm-muted" aria-live="polite">
        {state === "saving" ? "Guardando…" : state === "saved" ? "Guardado. Se aplica en todos tus dispositivos." : "Se guarda en tu usuario: aplica en todos tus dispositivos."}{" "}
        El navegador recién deja sonar después de que tocás algo en el panel; con la pestaña en segundo plano también suena.
      </p>
    </div>
  );
}

// ---------- Soporte ----------

type ServerVersion = BuildInfo;

function browserName(ua: string) {
  const match =
    /(Edg|OPR|SamsungBrowser|Firefox|Chrome|CriOS|FxiOS|Version)\/([\d.]+)/.exec(ua) ?? null;
  if (!match) return "Desconocido";
  const names: Record<string, string> = {
    Edg: "Edge",
    OPR: "Opera",
    SamsungBrowser: "Samsung Internet",
    Firefox: "Firefox",
    FxiOS: "Firefox",
    Chrome: "Chrome",
    CriOS: "Chrome",
    Version: "Safari",
  };
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return `${names[match[1]]} ${match[2].split(".")[0]}${os ? ` · ${os}` : ""}`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
}

export function SupportPanel({ account }: { account: { id: number; name: string } }) {
  const { user } = useCrmShell();
  const toast = useToast();
  const mine = currentBuild();
  const [server, setServer] = useState<ServerVersion | null | "error">(null);
  const [env, setEnv] = useState({ browser: "", screen: "", timezone: "" });

  useEffect(() => {
    fetch("/api/version", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: ServerVersion) => setServer(d))
      .catch(() => setServer("error"));
    setEnv({
      browser: browserName(navigator.userAgent),
      screen: `${window.screen.width}×${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }, []);

  const outdated = Boolean(server && server !== "error" && isOutdated(mine, server));
  const versionLabel = mine.version ? `v${mine.version}` : "Desarrollo";

  const status =
    server === null
      ? { tone: "muted", text: "Buscando la última versión…" }
      : server === "error"
        ? { tone: "muted", text: "No se pudo consultar la última versión." }
        : outdated
          ? {
              tone: "warn",
              text:
                server.version && server.version !== mine.version
                  ? `Hay una versión más nueva (v${server.version}). Recargá la página.`
                  : "Hay una actualización del panel. Recargá la página.",
            }
          : { tone: "ok", text: "Estás usando la última versión." };

  const rows: [string, string][] = [
    ["Versión del panel", versionLabel],
    ["Publicada", formatDate(mine.buildTime)],
    ["Cuenta", `${account.name} (#${account.id})`],
    ["Usuario", `${user.name}${user.email ? ` · ${user.email}` : ""} (#${user.id})`],
    ["Rol", user.roleLabel],
    ["Navegador", env.browser || "—"],
    ["Pantalla", env.screen || "—"],
    ["Zona horaria", env.timezone || "—"],
  ];

  const report = [
    "Datos de soporte · DigiBot",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    `Última versión: ${server && server !== "error" ? (server.version ? `v${server.version}` : "desarrollo") : "sin datos"}${outdated ? " (desactualizado)" : ""}`,
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      toast("Datos copiados");
    } catch {
      toast("No se pudo copiar", "error");
    }
  };

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className={`${card} flex flex-wrap items-center gap-4`}>
        <div className="min-w-[200px] flex-1">
          <div className="text-[13px] font-semibold uppercase tracking-[1px] text-crm-muted">Versión</div>
          <div className="font-poppins text-[28px] font-bold tracking-[-.5px] text-crm-ink">{versionLabel}</div>
          <div
            className={`mt-1 flex items-center gap-2 text-sm font-semibold ${
              status.tone === "ok" ? "text-crm-success-ink" : status.tone === "warn" ? "text-crm-warn-ink" : "text-crm-muted"
            }`}
          >
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${
                status.tone === "ok" ? "bg-crm-success" : status.tone === "warn" ? "bg-crm-warn" : "bg-crm-border-2"
              }`}
            />
            {status.text}
          </div>
        </div>
        {outdated && (
          <button
            onClick={() => window.location.reload()}
            className="flex h-[46px] items-center gap-2 rounded-pill bg-crm-primary px-[22px] font-poppins text-[15px] font-semibold text-white hover:bg-crm-primary-hover"
          >
            <Icon name="retry" size={18} />
            Recargar
          </button>
        )}
      </div>

      <div className="rounded-card border border-crm-border bg-crm-card px-4 py-1.5 md:px-[22px]">
        {rows.map(([k, v], i) => (
          <div key={k} className={`flex flex-wrap gap-x-4 gap-y-0.5 py-3 text-sm ${i ? "border-t border-crm-border" : ""}`}>
            <span className="w-40 shrink-0 text-crm-muted">{k}</span>
            <span className="min-w-0 flex-1 break-words font-semibold text-crm-ink">{v}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={copy} className={chipButton}>
          <Icon name="copy" size={16} />
          Copiar datos para soporte
        </button>
        <a
          href={waLink(`Hola! Necesito ayuda con el panel.\n\n${report}`)}
          target="_blank"
          rel="noreferrer noopener"
          className={chipButton}
        >
          <Icon name="send" size={16} />
          Escribir a soporte
        </a>
      </div>
      <p className="m-0 text-[13px] text-crm-muted">
        Si nos escribís, mandanos estos datos: así vemos al toque qué versión estás usando.
      </p>
    </div>
  );
}
