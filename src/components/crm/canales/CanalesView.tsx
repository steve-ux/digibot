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
  type ConnectedAccount,
  type PageChoice,
  type ProviderId,
} from "@/lib/channels/types";
import { avatarColor, CHANNELS, initialsOf } from "@/lib/crm/channels";
import { accountApi } from "@/lib/crm/permissions";
import { runEmbeddedSignup, runFacebookLogin } from "./facebook-sdk";

export type ChannelsLoadState = { kind: "ready"; overview: ChannelsOverview } | { kind: "error"; message: string };

const PROVIDERS: { id: ProviderId; name: string; icon: string; description: string; connectLabel: string; moreLabel: string }[] = [
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
    description: "Mensajes directos y comentarios de tus publicaciones. Tiene que ser una cuenta profesional vinculada a una página.",
    connectLabel: "Conectar Instagram",
    moreLabel: "Conectar otra cuenta",
  },
  {
    id: "facebook",
    name: "Facebook",
    icon: CHANNELS.fbc.icon,
    description: "Mensajes de Messenger y comentarios en las publicaciones de tu página.",
    connectLabel: "Conectar página",
    moreLabel: "Conectar otra página",
  },
  {
    id: "threads",
    name: "Threads",
    icon: CHANNELS.th.icon,
    description: "Las respuestas a tus hilos, para contestarlas desde la bandeja.",
    connectLabel: "Conectar Threads",
    moreLabel: "Conectar otro perfil",
  },
];

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
  {
    id: "tiktok",
    name: "TikTok",
    icon: "/crm/channels/log_tiktok.avif",
    description: "Mensajes y comentarios de tu cuenta de TikTok, para no perderte ninguna consulta.",
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
  if (!res.ok) throw new Error(data.message || "Algo salió mal. Probá de nuevo.");
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
      { key: "demo:ig", provider: "instagram", title: "@opticasol", subtitle: "Vinculado a la página Óptica Sol", pictureUrl: null, connectedAt: now - 20 * 86400, expiresAt: null, fromEnv: false },
      { key: "demo:fb", provider: "facebook", title: "Óptica Sol", subtitle: "Messenger y comentarios de la página", pictureUrl: null, connectedAt: now - 20 * 86400, expiresAt: null, fromEnv: false },
    ],
    availability: { whatsapp: available, facebook: available, instagram: available, threads: available },
    meta: { appId: null, graphVersion: "v23.0", whatsappConfigId: null, loginConfigId: null },
  };
}

const DEMO_NEW: Record<ProviderId, Omit<ConnectedAccount, "key" | "connectedAt">> = {
  whatsapp: { provider: "whatsapp", title: "+54 9 261 555-0199", subtitle: "Óptica Sol · Sucursal Centro", pictureUrl: null, expiresAt: null, fromEnv: false },
  instagram: { provider: "instagram", title: "@opticasol.centro", subtitle: "Vinculado a la página Óptica Sol Centro", pictureUrl: null, expiresAt: null, fromEnv: false },
  facebook: { provider: "facebook", title: "Óptica Sol Centro", subtitle: "Messenger y comentarios de la página", pictureUrl: null, expiresAt: null, fromEnv: false },
  threads: { provider: "threads", title: "@opticasol", subtitle: "Respuestas a tus hilos", pictureUrl: null, expiresAt: Math.floor(Date.now() / 1000) + 60 * 86400, fromEnv: false },
};

// ---------- Vista ----------

export default function CanalesView(props: { accountId: number; initialState: ChannelsLoadState }) {
  const { demo } = useCrmShell();
  return <Canales key={demo ? "demo" : "real"} {...props} demo={demo} />;
}

function Canales({ accountId, initialState, demo }: { accountId: number; initialState: ChannelsLoadState; demo: boolean }) {
  const toast = useToast();
  const [overview, setOverview] = useState<ChannelsOverview | null>(
    demo ? demoOverview() : initialState.kind === "ready" ? initialState.overview : null
  );
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [picker, setPicker] = useState<{ provider: ProviderId; pages: PageChoice[]; selection: string } | null>(null);
  const [toRemove, setToRemove] = useState<ConnectedAccount | null>(null);
  const [removing, setRemoving] = useState(false);

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

  const connect = async (provider: ProviderId) => {
    if (!overview) return;
    if (demo) return demoConnect(provider);
    if (provider === "threads") {
      window.location.href = accountApi(accountId, "canales/threads");
      return;
    }
    setBusy(provider);
    try {
      if (provider === "whatsapp") {
        const result = await runEmbeddedSignup(overview.meta);
        if (result === "cancel") {
          toast("Se canceló la conexión. Cuando quieras, probá de nuevo.");
          return;
        }
        const { account } = await call<{ account: ConnectedAccount | null }>(accountApi(accountId, "canales/whatsapp"), {
          method: "POST",
          body: JSON.stringify(result),
        });
        toast(account ? `Listo: ${account.title} conectado` : "WhatsApp conectado");
        await reload();
      } else {
        const code = await runFacebookLogin(overview.meta);
        if (!code) {
          toast("Se canceló la conexión. Cuando quieras, probá de nuevo.");
          return;
        }
        const data = await call<{ pages: PageChoice[]; selection: string }>(accountApi(accountId, "canales/facebook/paginas"), {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        setPicker({ provider, ...data });
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
          {PROVIDERS.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              accounts={overview.accounts.filter((a) => a.provider === p.id)}
              availability={overview.availability[p.id]}
              busy={busy === p.id}
              disabled={busy !== null}
              onConnect={() => connect(p.id)}
              onRemove={setToRemove}
            />
          ))}
          {COMING_SOON.map((c) => (
            <SoonCard key={c.id} channel={c} />
          ))}
        </div>
      )}

      <PagePicker
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
}: {
  provider: (typeof PROVIDERS)[number];
  accounts: ConnectedAccount[];
  availability: ChannelsOverview["availability"][ProviderId];
  busy: boolean;
  disabled: boolean;
  onConnect: () => void;
  onRemove: (a: ConnectedAccount) => void;
}) {
  const connected = accounts.length > 0;
  return (
    <article
      aria-labelledby={`prov-${provider.id}`}
      className="flex flex-col gap-3.5 rounded-card border border-crm-border bg-crm-card p-[22px]"
    >
      <div className="flex items-center gap-3">
        <img src={provider.icon} alt="" width={40} height={40} className="block h-10 w-10 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <h2 id={`prov-${provider.id}`} className="m-0 font-poppins text-base font-semibold text-crm-ink">
            {provider.name}
          </h2>
          <div className={`flex items-center gap-1.5 text-[13px] font-semibold ${connected ? "text-crm-success-ink" : "text-crm-muted"}`}>
            <span aria-hidden className={`h-[7px] w-[7px] rounded-full ${connected ? "bg-crm-success" : "bg-crm-subtle"}`} />
            {connected ? (accounts.length > 1 ? `${accounts.length} conectadas` : "Conectado") : "Sin conectar"}
          </div>
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
                {(a.subtitle || a.expiresAt) && (
                  <div className="truncate text-xs text-crm-muted">
                    {a.subtitle}
                    {a.expiresAt ? `${a.subtitle ? " · " : ""}se renueva solo (vence ${formatDate(a.expiresAt)})` : ""}
                  </div>
                )}
              </div>
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

      {availability.available ? (
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

// Después del login de Facebook: elegir qué páginas y qué Instagram conectar.
function PagePicker({
  state,
  accountId,
  onClose,
  onDone,
}: {
  state: { provider: ProviderId; pages: PageChoice[]; selection: string } | null;
  accountId: number;
  onClose: () => void;
  onDone: (accounts: ConnectedAccount[]) => void;
}) {
  type Pick = { facebook: boolean; instagram: boolean };
  const initial = useMemo(() => {
    const picks: Record<string, Pick> = {};
    for (const p of state?.pages ?? []) {
      const wantsIg = state?.provider === "instagram";
      picks[p.id] = {
        facebook: !wantsIg && !p.takenElsewhere.facebook && !p.connectedHere.facebook && (state?.pages.length ?? 0) === 1,
        instagram: wantsIg && Boolean(p.instagram) && !p.takenElsewhere.instagram && !p.connectedHere.instagram,
      };
    }
    return picks;
  }, [state]);
  const [picks, setPicks] = useState<Record<string, Pick>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setPicks(initial);
    setError(null);
  }, [initial]);

  const toggle = (pageId: string, key: keyof Pick) =>
    setPicks((prev) => ({ ...prev, [pageId]: { ...prev[pageId], [key]: !prev[pageId]?.[key] } }));

  const save = async () => {
    if (!state) return;
    const choices = Object.entries(picks).map(([pageId, p]) => ({ pageId, ...p }));
    if (!choices.some((c) => c.facebook || c.instagram)) {
      setError("Elegí al menos una página o cuenta de Instagram.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { accounts } = await call<{ accounts: ConnectedAccount[] }>(accountApi(accountId, "canales/facebook"), {
        method: "POST",
        body: JSON.stringify({ selection: state.selection, choices }),
      });
      onDone(accounts);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const option = (
    pageId: string,
    key: keyof Pick,
    label: string,
    icon: string,
    connectedHere: boolean,
    taken: boolean
  ) => {
    const id = `pick-${pageId}-${key}`;
    return (
      <label
        htmlFor={id}
        className={`flex min-h-[44px] items-center gap-2.5 rounded-field px-2.5 ${taken || connectedHere ? "opacity-60" : "cursor-pointer hover:bg-crm-surf"}`}
      >
        <input
          id={id}
          type="checkbox"
          disabled={taken || connectedHere}
          checked={connectedHere || Boolean(picks[pageId]?.[key])}
          onChange={() => toggle(pageId, key)}
          className="h-5 w-5 shrink-0 accent-[var(--crm-primary)]"
        />
        <img src={icon} alt="" width={20} height={20} />
        <span className="min-w-0 flex-1 truncate text-sm text-crm-ink">{label}</span>
        {connectedHere && <span className="shrink-0 text-xs font-semibold text-crm-success-ink">Ya conectada</span>}
        {taken && <span className="shrink-0 text-xs font-semibold text-crm-muted">En otra cuenta</span>}
      </label>
    );
  };

  return (
    <Modal
      open={state !== null}
      onClose={() => !saving && onClose()}
      title="¿Qué querés conectar?"
      description="Estas son las páginas a las que nos diste acceso. Elegí la página y/o su Instagram."
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
      <div className="flex flex-col gap-3">
        {state?.pages.map((p) => (
          <div key={p.id} className="rounded-[14px] border border-crm-border p-3">
            <div className="mb-1 flex items-center gap-2.5 px-1">
              {p.pictureUrl ? (
                <img src={p.pictureUrl} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-crm-surf text-xs font-bold text-crm-ink-2">
                  {initialsOf(p.name)}
                </span>
              )}
              <span className="truncate font-semibold text-crm-ink">{p.name}</span>
            </div>
            {option(p.id, "facebook", "Messenger y comentarios de la página", CHANNELS.fbc.icon, p.connectedHere.facebook, p.takenElsewhere.facebook)}
            {p.instagram ? (
              option(p.id, "instagram", `Instagram @${p.instagram.username}`, CHANNELS.ig.icon, p.connectedHere.instagram, p.takenElsewhere.instagram)
            ) : (
              <p className="m-0 px-2.5 py-2 text-xs text-crm-muted">
                Esta página no tiene una cuenta profesional de Instagram vinculada.
              </p>
            )}
          </div>
        ))}
        {error && (
          <p role="alert" className="m-0 rounded-field bg-crm-error-bg px-3 py-2 text-sm text-crm-error-ink">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
