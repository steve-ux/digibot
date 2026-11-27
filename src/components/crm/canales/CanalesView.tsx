"use client";

import { useEffect, useMemo, useState } from "react";
import { useCrmShell } from "@/components/crm/CrmShell";
import Icon from "@/components/crm/Icon";
import { Modal } from "@/components/crm/Modal";
import PageHeader, { PageBody } from "@/components/crm/PageHeader";
import { useToast } from "@/components/crm/Toast";
import {
  PROVIDER_CHANNELS,
  type ChannelsOverview,
  type AssetChoice,
  type ConnectedAccount,
  type ProviderId,
} from "@/lib/channels/types";
import { avatarColor, CHANNELS, initialsOf, tiktokDemoEnabled } from "@/lib/crm/channels";
import { DEMO_TIKTOK_VIDEOS } from "@/lib/crm/demo-data";
import { accountApi } from "@/lib/crm/permissions";
import { loadFacebookSdk, runFacebookLogin } from "./facebook-sdk";
import WhatsAppSignupModal, { WA_MODES, type SignupRequest, type WaMode, type WaModeOption } from "./WhatsAppSignup";

export type ChannelsLoadState = { kind: "ready"; overview: ChannelsOverview } | { kind: "error"; message: string };

const PROVIDERS: {
  id: ProviderId;
  name: string;
  icon: string;
  description: string;
  connectLabel: string;
  moreLabel: string;
  // Lo que hace falta antes de tocar Conectar (se muestra arriba del botón)
  requirements?: string[];
}[] = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: CHANNELS.wa.icon,
    description: "Tu número de WhatsApp Business. Respondé chats y mandá plantillas aprobadas por Meta.",
    connectLabel: "Conectar WhatsApp",
    moreLabel: "Conectar otro número",
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: CHANNELS.ig.icon,
    description: "Mensajes directos y comentarios de tus publicaciones, para responderlos desde la bandeja.",
    connectLabel: "Conectar Instagram",
    moreLabel: "Conectar otra cuenta",
    requirements: [
      "Una cuenta profesional de Instagram (de empresa o de creador).",
      "Que la cuenta esté dentro de un portfolio comercial de Meta.",
      "En la app de Instagram del celular: Configuración → Mensajes y respuestas a historias → Controles de mensajes → Herramientas conectadas → Permitir acceso a los mensajes.",
      "Si Meta te pide elegir una cuenta publicitaria, no es obligatorio: podés seguir sin elegir ninguna.",
    ],
  },
  {
    id: "facebook",
    name: "Facebook",
    icon: CHANNELS.fbc.icon,
    description: "Mensajes de Messenger y comentarios en las publicaciones de tu página.",
    connectLabel: "Conectar Facebook",
    moreLabel: "Conectar otra página",
    requirements: ["Ser admin de la página de Facebook que vas a conectar."],
  },
  {
    id: "threads",
    name: "Threads",
    icon: CHANNELS.th.icon,
    description: "Las respuestas a tus hilos, para contestarlas desde la bandeja.",
    connectLabel: "Conectar Threads",
    moreLabel: "Conectar otro perfil",
  },
  {
    id: "tiktok",
    name: "TikTok",
    icon: "/crm/channels/log_tiktok.avif",
    description: "Los comentarios de tus videos de TikTok, para responderlos desde la bandeja.",
    connectLabel: "Conectar TikTok",
    moreLabel: "Conectar otra cuenta",
    requirements: ["Iniciar sesión en TikTok con la cuenta que vas a conectar y aceptar todos los permisos."],
  },
];

// Prototipo de TikTok con mensajes directos (solo superadmin en demo), hasta que TikTok
// apruebe Business Messaging API.
const TIKTOK_DEMO = {
  id: "tiktok",
  name: "TikTok",
  icon: "/crm/channels/log_tiktok.avif",
  description: "Mensajes directos y comentarios de tus videos de TikTok, para no perderte ninguna consulta.",
};

// Canales que todavía no se pueden conectar: se muestran con el botón deshabilitado.
const COMING_SOON: { id: string; name: string; icon: string; description: string }[] = [
  {
    id: "youtube",
    name: "YouTube",
    icon: "/crm/channels/YouTube-logo.png",
    description: "Los comentarios de tus videos, para responderlos desde la bandeja.",
  },
  {
    id: "telegram",
    name: "Telegram",
    icon: "/crm/channels/Telegram_logo.svg.webp",
    description: "Los chats de tu bot de Telegram, en la misma bandeja que el resto.",
  },
];

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } });
  } catch {
    throw new Error("No se pudo conectar con el servidor.");
  }
  const data = await res.json().catch(() => ({}));
  // Sin mensaje propio (ej. 502/504 del proxy): se muestra el código para poder rastrearlo.
  if (!res.ok) throw new Error(data.message || `Algo salió mal (error ${res.status}). Probá de nuevo.`);
  return data as T;
}

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

// ---------- Demo ----------

function demoOverview(): ChannelsOverview {
  const now = Math.floor(Date.now() / 1000);
  const available = { available: true, reason: null };
  return {
    accounts: [
      { key: "demo:wa", provider: "whatsapp", title: "+54 9 261 555-0100", subtitle: "Óptica Sol", pictureUrl: null, connectedAt: now - 40 * 86400, expiresAt: null, fromEnv: false },
      { key: "demo:ig", provider: "instagram", title: "@opticasol", subtitle: "Mensajes directos y comentarios", pictureUrl: null, connectedAt: now - 20 * 86400, expiresAt: null, fromEnv: false },
      { key: "demo:fb", provider: "facebook", title: "Óptica Sol", subtitle: "Messenger y comentarios de la página", pictureUrl: null, connectedAt: now - 20 * 86400, expiresAt: null, fromEnv: false },
    ],
    availability: { whatsapp: available, facebook: available, instagram: available, threads: available, tiktok: available },
    meta: { appId: null, graphVersion: "v23.0", whatsappConfigId: null, whatsappEsVersion: "v5", loginConfigId: null, instagramConfigId: null },
  };
}

const DEMO_NEW: Record<ProviderId, Omit<ConnectedAccount, "key" | "connectedAt">> = {
  whatsapp: { provider: "whatsapp", title: "+54 9 261 555-0199", subtitle: "Óptica Sol · Sucursal Centro", pictureUrl: null, expiresAt: null, fromEnv: false },
  instagram: { provider: "instagram", title: "@opticasol.centro", subtitle: "Mensajes directos y comentarios", pictureUrl: null, expiresAt: null, fromEnv: false },
  facebook: { provider: "facebook", title: "Óptica Sol Centro", subtitle: "Messenger y comentarios de la página", pictureUrl: null, expiresAt: null, fromEnv: false },
  threads: { provider: "threads", title: "@opticasol", subtitle: "Respuestas a tus hilos", pictureUrl: null, expiresAt: Math.floor(Date.now() / 1000) + 60 * 86400, fromEnv: false },
  tiktok: { provider: "tiktok", title: "@opticasol", subtitle: "Comentarios de tus videos", pictureUrl: null, expiresAt: null, fromEnv: false },
};

// ---------- Vista ----------

export default function CanalesView(props: {
  accountId: number;
  initialState: ChannelsLoadState;
  // Sesión de Embedded Signup creada al abrir la página
  initialSignupSessionId: string | null;
}) {
  const { demo, user } = useCrmShell();
  return <Canales key={demo ? "demo" : "real"} {...props} demo={demo} tiktok={tiktokDemoEnabled(demo, user.role)} />;
}

function Canales({
  accountId,
  initialState,
  initialSignupSessionId,
  demo,
  tiktok,
}: {
  accountId: number;
  initialState: ChannelsLoadState;
  initialSignupSessionId: string | null;
  demo: boolean;
  // Prototipo de TikTok (solo superadmin en demo)
  tiktok: boolean;
}) {
  const toast = useToast();
  const [overview, setOverview] = useState<ChannelsOverview | null>(
    demo ? demoOverview() : initialState.kind === "ready" ? initialState.overview : null
  );
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [toRemove, setToRemove] = useState<ConnectedAccount | null>(null);
  const [removing, setRemoving] = useState(false);
  const [signup, setSignup] = useState<SignupRequest | null>(null);

  // El SDK se precarga: FB.login tiene que salir directo del click (si no, el navegador bloquea el popup).
  const sdkConfig = overview?.meta;
  const metaAvailable = Boolean(
    overview &&
      (overview.availability.whatsapp.available || overview.availability.facebook.available || overview.availability.instagram.available)
  );
  useEffect(() => {
    if (demo || !sdkConfig?.appId || !metaAvailable) return;
    loadFacebookSdk(sdkConfig).catch(() => undefined);
  }, [demo, sdkConfig, metaAvailable]);

  // Vuelta de Threads: ?conectado=@usuario o ?error=...
  useEffect(() => {
    const url = new URL(window.location.href);
    const ok = url.searchParams.get("conectado");
    const error = url.searchParams.get("error");
    if (ok) toast(`Listo: ${ok} conectado`);
    if (error) toast(error, "error");
    if (ok || error) {
      url.searchParams.delete("conectado");
      url.searchParams.delete("error");
      window.history.replaceState(window.history.state, "", url);
    }
  }, [toast]);

  const reload = async () => {
    if (demo) return;
    try {
      setOverview(await call<ChannelsOverview>(accountApi(accountId, "canales")));
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const demoConnect = async (provider: ProviderId) => {
    setBusy(provider);
    await new Promise((r) => setTimeout(r, 900));
    setOverview((o) =>
      o ? { ...o, accounts: [...o.accounts, { ...DEMO_NEW[provider], key: `demo:${provider}:${Date.now()}`, connectedAt: Math.floor(Date.now() / 1000) }] } : o
    );
    setBusy(null);
    toast(`${DEMO_NEW[provider].title} conectado (demo)`);
  };

  const connect = async (provider: ProviderId, mode: WaMode = "new") => {
    if (!overview) return;
    if (demo) return demoConnect(provider);
    if (provider === "threads" || provider === "tiktok") {
      window.location.href = accountApi(accountId, `canales/${provider}`);
      return;
    }
    if (provider === "whatsapp") {
      setSignup({ key: Date.now(), reconnectId: null, mode });
      return;
    }
    setBusy(provider);
    try {
      const instagram = provider === "instagram";
      // Cada uno tiene su configuración de Facebook Login for Business.
      const code = await runFacebookLogin(overview.meta, instagram ? overview.meta.instagramConfigId : overview.meta.loginConfigId);
      if (!code) {
        toast("Se canceló la conexión. Cuando quieras, probá de nuevo.");
        return;
      }
      if (instagram) {
        const data = await call<{ accounts: AssetChoice[]; selection: string }>(accountApi(accountId, "canales/instagram/cuentas"), {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        setPicker({ provider: "instagram", items: data.accounts, selection: data.selection });
      } else {
        const data = await call<{ pages: AssetChoice[]; selection: string }>(accountApi(accountId, "canales/facebook/paginas"), {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        setPicker({ provider: "facebook", items: data.pages, selection: data.selection });
      }
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!toRemove) return;
    setRemoving(true);
    try {
      if (!demo) {
        await call(accountApi(accountId, "canales/desconectar"), { method: "POST", body: JSON.stringify({ key: toRemove.key }) });
      }
      setOverview((o) => (o ? { ...o, accounts: o.accounts.filter((a) => a.key !== toRemove.key) } : o));
      toast(`${toRemove.title} desconectado`);
      setToRemove(null);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <PageBody>
      <PageHeader title="Canales" description="Conectá tus cuentas y todos los mensajes llegan a la misma bandeja." />

      {!demo && initialState.kind === "error" && (
        <div className="rounded-card border border-crm-error-border bg-crm-error-bg px-5 py-4 text-sm text-crm-error-ink">
          {initialState.message}
        </div>
      )}

      {overview && (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]">
          {PROVIDERS.map((p) =>
            p.id === "tiktok" && tiktok ? (
              <TikTokDemoCard key={p.id} channel={TIKTOK_DEMO} />
            ) : (
            <ProviderCard
              key={p.id}
              provider={p}
              accounts={overview.accounts.filter((a) => a.provider === p.id)}
              availability={overview.availability[p.id]}
              busy={busy === p.id}
              disabled={busy !== null}
              onConnect={() => connect(p.id)}
              onRemove={setToRemove}
              modes={p.id === "whatsapp" ? WA_MODES : undefined}
              onPickMode={(mode) => connect(p.id, mode)}
              onReconnect={
                (p.id === "facebook" || p.id === "instagram") && !demo
                  ? // Volver a conectar la misma cuenta la deja sana otra vez
                    () => connect(p.id)
                  : p.id === "whatsapp" && !demo
                  ? (a) =>
                      setSignup({
                        key: Date.now(),
                        reconnectId: Number(a.key.replace(/^wa:/, "")),
                        // Se reconecta con la misma modalidad con la que se conectó
                        mode: a.coexistence ? "coexistence" : "new",
                      })
                  : undefined
              }
            />
            )
          )}
          {COMING_SOON.map((c) => (
            <SoonCard key={c.id} channel={c} />
          ))}
        </div>
      )}

      {overview && (
        <WhatsAppSignupModal
          accountId={accountId}
          meta={overview.meta}
          initialSessionId={initialSignupSessionId}
          request={signup}
          onClose={() => {
            setSignup(null);
            void reload();
          }}
        />
      )}

      <AssetPicker
        state={picker}
        accountId={accountId}
        onClose={() => setPicker(null)}
        onDone={async (accounts) => {
          setPicker(null);
          toast(accounts.length === 1 ? `Listo: ${accounts[0].title} conectado` : `Listo: ${accounts.length} cuentas conectadas`);
          await reload();
        }}
      />

      <Modal
        open={toRemove !== null}
        onClose={() => !removing && setToRemove(null)}
        title={`¿Desconectar ${toRemove?.title ?? ""}?`}
        description="Dejan de llegar mensajes nuevos de esta cuenta y no se puede responder desde la bandeja. Las conversaciones que ya tenés quedan guardadas."
        maxWidth={480}
        footer={
          <div className="flex flex-wrap justify-end gap-2.5">
            <button
              onClick={() => setToRemove(null)}
              disabled={removing}
              className="h-[46px] rounded-pill border border-crm-border-2 bg-crm-chip px-[22px] font-poppins text-sm font-semibold text-crm-ink"
            >
              Cancelar
            </button>
            <button
              onClick={remove}
              disabled={removing}
              className="h-[46px] rounded-pill bg-crm-error px-6 font-poppins text-sm font-semibold text-white disabled:opacity-60"
            >
              {removing ? "Desconectando…" : "Desconectar"}
            </button>
          </div>
        }
      >
        <span />
      </Modal>
    </PageBody>
  );
}

function ProviderCard({
  provider,
  accounts,
  availability,
  busy,
  disabled,
  onConnect,
  onRemove,
  modes,
  onPickMode,
  onReconnect,
}: {
  provider: (typeof PROVIDERS)[number];
  accounts: ConnectedAccount[];
  availability: ChannelsOverview["availability"][ProviderId];
  busy: boolean;
  disabled: boolean;
  onConnect: () => void;
  onRemove: (a: ConnectedAccount) => void;
  // WhatsApp: las dos formas de conectar, para elegir antes de abrir Meta
  modes?: WaModeOption[];
  onPickMode?: (mode: WaMode) => void;
  // Volver a lanzar la conexión sobre la misma cuenta (WhatsApp desconectado)
  onReconnect?: (a: ConnectedAccount) => void;
}) {
  const connected = accounts.length > 0;
  const down = accounts.filter((a) => a.health === "disconnected").length;
  return (
    <article
      aria-labelledby={`prov-${provider.id}`}
      // WhatsApp ocupa todo el ancho: las dos opciones van lado a lado.
      className={`flex flex-col gap-3.5 rounded-card border border-crm-border bg-crm-card p-[22px] ${modes ? "[grid-column:1/-1]" : ""}`}
    >
      <div className="flex items-center gap-3">
        <img src={provider.icon} alt="" width={40} height={40} className="block h-10 w-10 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <h2 id={`prov-${provider.id}`} className="m-0 font-poppins text-base font-semibold text-crm-ink">
            {provider.name}
          </h2>
          {down > 0 ? (
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-crm-error">
              <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-crm-error" />
              {down === accounts.length ? "Desconectado" : `${down} desconectado${down > 1 ? "s" : ""}`}
            </div>
          ) : (
            <div className={`flex items-center gap-1.5 text-[13px] font-semibold ${connected ? "text-crm-success-ink" : "text-crm-muted"}`}>
              <span aria-hidden className={`h-[7px] w-[7px] rounded-full ${connected ? "bg-crm-success" : "bg-crm-subtle"}`} />
              {connected ? (accounts.length > 1 ? `${accounts.length} conectadas` : "Conectado") : "Sin conectar"}
            </div>
          )}
        </div>
      </div>

      <p className="m-0 flex-1 text-sm leading-[1.45] text-crm-ink-2">{provider.description}</p>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-crm-muted">
        <span>En la bandeja:</span>
        {PROVIDER_CHANNELS[provider.id].map((c) => (
          <span key={c} className="flex items-center gap-1 rounded-pill bg-crm-surf px-2 py-[3px] font-semibold text-crm-ink-2">
            <img src={CHANNELS[c].icon} alt="" width={14} height={14} />
            {CHANNELS[c].name}
          </span>
        ))}
      </div>

      {accounts.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {accounts.map((a) => (
            <li key={a.key} className="flex items-center gap-2.5 rounded-field bg-crm-surf px-3 py-2.5">
              {a.pictureUrl || a.provider === "whatsapp" ? (
                <img
                  src={a.pictureUrl ?? CHANNELS.wa.icon}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: avatarColor(a.title.length) }}
                >
                  {initialsOf(a.title)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-crm-ink">{a.title}</div>
                {(a.subtitle || a.expiresAt || a.coexistence) && (
                  <div className="truncate text-xs text-crm-muted">
                    {a.subtitle}
                    {a.coexistence ? `${a.subtitle ? " · " : ""}también en la app de WhatsApp Business` : ""}
                    {a.expiresAt ? `${a.subtitle ? " · " : ""}se renueva solo (vence ${formatDate(a.expiresAt)})` : ""}
                  </div>
                )}
                {typeof a.syncProgress === "number" && a.health !== "disconnected" && (
                  <div className="text-xs font-semibold text-crm-primary">Sincronizando historial · {a.syncProgress}%</div>
                )}
                {a.health && a.health !== "active" && a.healthMessage && (
                  <div className={`text-xs font-semibold ${a.health === "disconnected" ? "text-crm-error" : "text-crm-warn-ink"}`}>
                    {a.health === "disconnected" ? `${provider.name} desconectado. ` : ""}
                    {a.healthMessage}
                  </div>
                )}
              </div>
              {a.health === "disconnected" && onReconnect && (
                <button
                  onClick={() => onReconnect(a)}
                  disabled={disabled}
                  className="min-h-[36px] shrink-0 rounded-pill bg-crm-primary px-3.5 text-[13px] font-semibold text-white hover:bg-crm-primary-hover disabled:opacity-60"
                >
                  Reconectar
                </button>
              )}
              {a.fromEnv ? (
                <span className="shrink-0 text-xs font-semibold text-crm-muted" title="Lo configuró el equipo de DigiBot en el servidor">
                  Por DigiBot
                </span>
              ) : (
                <button
                  onClick={() => onRemove(a)}
                  className="min-h-[36px] shrink-0 rounded-pill px-2 text-[13px] font-semibold text-crm-muted transition-colors hover:text-crm-error"
                >
                  Desconectar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {provider.requirements && (
        <div className="rounded-field bg-crm-surf px-3.5 py-3">
          <div className="mb-1.5 text-xs font-semibold text-crm-ink-2">Antes de conectar</div>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-xs leading-[1.4] text-crm-ink-2">
            {provider.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {availability.available && modes && onPickMode ? (
        <ModePicker modes={modes} connected={connected} disabled={disabled} onPick={onPickMode} />
      ) : availability.available ? (
        <button
          onClick={onConnect}
          disabled={disabled}
          aria-busy={busy}
          className={`h-11 rounded-pill font-poppins text-sm font-semibold transition-colors disabled:opacity-60 ${
            connected
              ? "border border-crm-border-2 bg-crm-chip text-crm-ink hover:border-crm-primary hover:text-crm-primary"
              : "bg-crm-primary text-white hover:bg-crm-primary-hover"
          }`}
        >
          {busy ? "Conectando…" : connected ? provider.moreLabel : provider.connectLabel}
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <button disabled className="h-11 cursor-not-allowed rounded-pill bg-crm-surf font-poppins text-sm font-semibold text-crm-muted">
            {connected ? provider.moreLabel : provider.connectLabel}
          </button>
          <p className="m-0 flex items-start gap-1.5 text-xs leading-[1.4] text-crm-muted">
            <Icon name="clock" size={14} className="mt-px shrink-0" />
            {availability.reason}
          </p>
        </div>
      )}
    </article>
  );
}

// WhatsApp: dos formas de conectar que son cosas distintas. Se elige antes de abrir Meta.
function ModePicker({
  modes,
  connected,
  disabled,
  onPick,
}: {
  modes: WaModeOption[];
  connected: boolean;
  disabled: boolean;
  onPick: (mode: WaMode) => void;
}) {
  return (
    <section aria-labelledby="wa-modes" className="flex flex-col gap-3">
      <div>
        <h3 id="wa-modes" className="m-0 font-poppins text-[15px] font-semibold text-crm-ink">
          {connected ? "Conectar otro número" : "¿Qué número vas a conectar?"}
        </h3>
        <p className="m-0 mt-0.5 text-[13px] text-crm-muted">Elegí una opción. Si tenés dudas, escribinos y lo hacemos juntos.</p>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        {modes.map((m) => (
          <div
            key={m.mode}
            className="flex flex-col gap-3 rounded-[16px] border border-crm-border-2 bg-crm-card p-4 transition-colors hover:border-crm-primary"
          >
            <div className="flex items-start gap-3">
              <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-crm-surf text-crm-primary">
                <Icon name={m.icon} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="m-0 font-poppins text-[15px] font-semibold text-crm-ink">{m.title}</h4>
                <span className="mt-1 inline-block rounded-pill bg-crm-surf px-2 py-[2px] text-[11px] font-semibold text-crm-ink-2">
                  {m.tag}
                </span>
              </div>
            </div>
            <p className="m-0 text-[13px] leading-[1.45] text-crm-ink-2">{m.description}</p>
            <div className="flex-1 rounded-field bg-crm-surf px-3.5 py-3">
              <div className="mb-1.5 text-xs font-semibold text-crm-ink-2">Qué necesitás</div>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-xs leading-[1.4] text-crm-ink-2">
                {m.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => onPick(m.mode)}
              disabled={disabled}
              className="h-11 rounded-pill bg-crm-primary font-poppins text-sm font-semibold text-white transition-colors hover:bg-crm-primary-hover disabled:opacity-60"
            >
              {m.button}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// Canal que todavía no se puede conectar: misma card, con el botón grisado.
function SoonCard({ channel }: { channel: (typeof COMING_SOON)[number] }) {
  return (
    <article
      aria-labelledby={`prov-${channel.id}`}
      className="flex flex-col gap-3.5 rounded-card border border-crm-border bg-crm-card p-[22px]"
    >
      <div className="flex items-center gap-3">
        <img src={channel.icon} alt="" width={40} height={40} className="block h-10 w-10 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <h2 id={`prov-${channel.id}`} className="m-0 font-poppins text-base font-semibold text-crm-ink">
            {channel.name}
          </h2>
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-crm-muted">
            <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-crm-subtle" />
            Próximamente
          </div>
        </div>
      </div>

      <p className="m-0 flex-1 text-sm leading-[1.45] text-crm-ink-2">{channel.description}</p>

      <div className="flex flex-col gap-1.5">
        <button disabled className="h-11 cursor-not-allowed rounded-pill bg-crm-surf font-poppins text-sm font-semibold text-crm-muted">
          Conectar {channel.name}
        </button>
        <p className="m-0 flex items-start gap-1.5 text-xs leading-[1.4] text-crm-muted">
          <Icon name="clock" size={14} className="mt-px shrink-0" />
          Estamos trabajando en esta integración. Te avisamos cuando esté lista.
        </p>
      </div>
    </article>
  );
}

// Prototipo de TikTok (solo superadmin en modo demo), para el video de revisión
// de TikTok. No llama a ninguna API: la autorización se simula.
function TikTokDemoCard({ channel }: { channel: typeof TIKTOK_DEMO }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<{ title: string; connectedAt: number } | null>(null);

  const authorize = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 1400));
    setBusy(false);
    setConfirming(false);
    setAccount({ title: "@cuenta_demo", connectedAt: Math.floor(Date.now() / 1000) });
    toast("Listo: @cuenta_demo conectado (demo)");
  };

  const connected = account !== null;
  return (
    <article
      aria-labelledby={`prov-${channel.id}`}
      className="flex flex-col gap-3.5 rounded-card border border-crm-border bg-crm-card p-[22px]"
    >
      <div className="flex items-center gap-3">
        <img src={channel.icon} alt="" width={40} height={40} className="block h-10 w-10 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <h2 id={`prov-${channel.id}`} className="m-0 font-poppins text-base font-semibold text-crm-ink">
            {channel.name}
          </h2>
          <div className={`flex items-center gap-1.5 text-[13px] font-semibold ${connected ? "text-crm-success-ink" : "text-crm-muted"}`}>
            <span aria-hidden className={`h-[7px] w-[7px] rounded-full ${connected ? "bg-crm-success" : "bg-crm-subtle"}`} />
            {connected ? `Conectado · ${account.title}` : "Sin conectar"}
          </div>
        </div>
      </div>

      <p className="m-0 flex-1 text-sm leading-[1.45] text-crm-ink-2">{channel.description}</p>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-crm-muted">
        <span>En la bandeja:</span>
        {["Mensajes directos", "Comentarios"].map((label) => (
          <span key={label} className="flex items-center gap-1 rounded-pill bg-crm-surf px-2 py-[3px] font-semibold text-crm-ink-2">
            <img src={channel.icon} alt="" width={14} height={14} />
            {label}
          </span>
        ))}
      </div>

      {account ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          <li className="flex items-center gap-2.5 rounded-field bg-crm-surf px-3 py-2.5">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: avatarColor(account.title.length) }}
            >
              {initialsOf(account.title)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-crm-ink">{account.title}</div>
              <div className="truncate text-xs text-crm-muted">Cuenta de empresa · conectada el {formatDate(account.connectedAt)}</div>
            </div>
            <button
              onClick={() => {
                setAccount(null);
                toast(`${account.title} desconectado`);
              }}
              className="min-h-[36px] shrink-0 rounded-pill px-2 text-[13px] font-semibold text-crm-muted transition-colors hover:text-crm-error"
            >
              Desconectar
            </button>
          </li>
        </ul>
      ) : null}

      {account && <TikTokVideos />}

      {!account && (
        <button
          onClick={() => setConfirming(true)}
          className="h-11 rounded-pill bg-crm-primary font-poppins text-sm font-semibold text-white transition-colors hover:bg-crm-primary-hover"
        >
          Conectar TikTok
        </button>
      )}

      <Modal
        open={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Conectar TikTok"
        description="Te vamos a redirigir a TikTok para que autorices a DigiBot a acceder a tu cuenta de empresa."
        maxWidth={480}
        footer={
          <div className="flex flex-wrap justify-end gap-2.5">
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="h-[46px] rounded-pill border border-crm-border-2 bg-crm-chip px-[22px] font-poppins text-sm font-semibold text-crm-ink"
            >
              Cancelar
            </button>
            <button
              onClick={authorize}
              disabled={busy}
              aria-busy={busy}
              className="h-[46px] rounded-pill bg-crm-primary px-6 font-poppins text-sm font-semibold text-white hover:bg-crm-primary-hover disabled:opacity-60"
            >
              {busy ? "Conectando…" : "Continuar"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-2 rounded-field bg-crm-surf px-3.5 py-3 text-[13px] leading-[1.45] text-crm-ink-2">
          <div className="font-semibold text-crm-ink">DigiBot va a poder:</div>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
            <li>Ver la información básica de tu cuenta de empresa.</li>
            <li>Ver los videos que publicaste.</li>
            <li>Leer los comentarios de tus videos y responderlos.</li>
            <li>Recibir y responder tus mensajes directos.</li>
          </ul>
          <div className="text-xs text-crm-muted">Podés desconectar la cuenta cuando quieras desde esta pantalla.</div>
        </div>
      </Modal>
    </article>
  );
}

// Videos de la cuenta conectada (prototipo): miniatura, vistas y comentarios.
function TikTokVideos() {
  const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} mil` : String(n));
  const now = Date.now();
  return (
    <section aria-labelledby="tt-videos" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="tt-videos" className="m-0 font-poppins text-[15px] font-semibold text-crm-ink">
          Tus videos
        </h3>
        <span className="text-xs text-crm-muted">{DEMO_TIKTOK_VIDEOS.length} recientes</span>
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-4">
        {DEMO_TIKTOK_VIDEOS.map((v) => (
          <li key={v.id} className="flex min-w-0 flex-col gap-1.5">
            <div className="relative overflow-hidden rounded-[10px] bg-crm-surf">
              <img src={v.thumbnailUrl ?? ""} alt="" className="block aspect-[9/16] w-full object-cover" />
              <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-pill bg-black/60 px-1.5 py-[2px] text-[11px] font-semibold text-white">
                ▶ {compact(v.views)}
              </span>
            </div>
            <p className="m-0 line-clamp-2 text-xs leading-[1.35] text-crm-ink-2" title={v.caption}>
              {v.caption}
            </p>
            <div className="text-[11px] text-crm-muted">
              {v.comments} comentarios · {new Date(now - v.postedAgo * 60000).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

type PickerState = { provider: "facebook" | "instagram"; items: AssetChoice[]; selection: string };

// Después del login: elegir qué páginas (Facebook) o cuentas (Instagram) conectar.
function AssetPicker({
  state,
  accountId,
  onClose,
  onDone,
}: {
  state: PickerState | null;
  accountId: number;
  onClose: () => void;
  onDone: (accounts: ConnectedAccount[]) => void;
}) {
  const instagram = state?.provider === "instagram";
  const initial = useMemo(() => {
    const free = (state?.items ?? []).filter((i) => !i.connectedHere && !i.takenElsewhere);
    // Si hay una sola disponible, ya viene marcada.
    return new Set(free.length === 1 ? [free[0].id] : []);
  }, [state]);
  const [picked, setPicked] = useState<Set<string>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setPicked(initial);
    setError(null);
  }, [initial]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    if (!state) return;
    if (picked.size === 0) {
      setError(instagram ? "Elegí al menos una cuenta de Instagram." : "Elegí al menos una página.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { accounts } = await call<{ accounts: ConnectedAccount[] }>(
        accountApi(accountId, instagram ? "canales/instagram" : "canales/facebook"),
        { method: "POST", body: JSON.stringify({ selection: state.selection, choices: Array.from(picked) }) }
      );
      onDone(accounts);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const icon = instagram ? CHANNELS.ig.icon : CHANNELS.fbc.icon;
  return (
    <Modal
      open={state !== null}
      onClose={() => !saving && onClose()}
      title={instagram ? "¿Qué cuenta de Instagram querés conectar?" : "¿Qué página querés conectar?"}
      description={
        instagram
          ? "Estas son las cuentas de Instagram a las que nos diste acceso. Llegan sus mensajes directos y comentarios."
          : "Estas son las páginas a las que nos diste acceso. Llegan sus mensajes de Messenger y comentarios."
      }
      maxWidth={560}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <button
            onClick={onClose}
            disabled={saving}
            className="h-[46px] rounded-pill border border-crm-border-2 bg-crm-chip px-[22px] font-poppins text-sm font-semibold text-crm-ink"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="h-[46px] rounded-pill bg-crm-primary px-6 font-poppins text-sm font-semibold text-white hover:bg-crm-primary-hover disabled:bg-crm-primary-soft"
          >
            {saving ? "Conectando…" : "Conectar"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        {state?.items.map((item) => {
          const id = `pick-${item.id}`;
          const locked = item.connectedHere || item.takenElsewhere;
          return (
            <label
              key={item.id}
              htmlFor={id}
              className={`flex min-h-[52px] items-center gap-3 rounded-[14px] border border-crm-border px-3 ${
                locked ? "opacity-60" : "cursor-pointer hover:bg-crm-surf"
              }`}
            >
              <input
                id={id}
                type="checkbox"
                disabled={locked}
                checked={item.connectedHere || picked.has(item.id)}
                onChange={() => toggle(item.id)}
                className="h-5 w-5 shrink-0 accent-[var(--crm-primary)]"
              />
              {item.pictureUrl ? (
                <img src={item.pictureUrl} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full object-cover" />
              ) : (
                <img src={icon} alt="" width={22} height={22} className="shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-crm-ink">{item.name}</span>
              {item.connectedHere && <span className="shrink-0 text-xs font-semibold text-crm-success-ink">Ya conectada</span>}
              {item.takenElsewhere && <span className="shrink-0 text-xs font-semibold text-crm-muted">En otra cuenta</span>}
            </label>
          );
        })}
        {error && (
          <p role="alert" className="m-0 rounded-field bg-crm-error-bg px-3 py-2 text-sm text-crm-error-ink">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
