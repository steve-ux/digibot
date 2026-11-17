"use client";

// Embedded Signup de WhatsApp: lanza el popup de Meta, reenvía al servidor el code y
// los eventos apenas llegan, y muestra el progreso (polling):
// Conectando → Configurando → Sincronizando (coexistencia, con %) → Listo.

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/crm/Icon";
import { Modal } from "@/components/crm/Modal";
import type { MetaClientConfig } from "@/lib/channels/types";
import { accountApi } from "@/lib/crm/permissions";
import type { SignupPhase, SignupProgress } from "@/lib/whatsapp-accounts/types";
import { launchEmbeddedSignup } from "./facebook-sdk";

// Las dos formas de conectar un número. Son cosas distintas y la persona elige antes de abrir Meta.
export type WaMode = "new" | "coexistence";

export interface WaModeOption {
  mode: WaMode;
  icon: "plus" | "retry";
  title: string;
  // Etiqueta corta: dónde se usa el número
  tag: string;
  description: string;
  requirements: string[];
  button: string;
}

const COMMON_REQUIREMENTS = [
  "Ser administrador del portfolio comercial de Meta.",
  "Una tarjeta para pagarle a Meta las conversaciones.",
];

export const WA_MODES: WaModeOption[] = [
  {
    mode: "new",
    icon: "plus",
    title: "Número nuevo",
    tag: "Solo en DigiBot",
    description:
      "Un número que no usás en ninguna app de WhatsApp. Lo respondés desde DigiBot (y lo puede atender el bot); en el celular no vas a tener la app con ese número.",
    requirements: [
      "Que el número no esté en WhatsApp ni en WhatsApp Business. Si lo está, primero borrá esa cuenta desde la app.",
      "Poder recibir un SMS o una llamada en ese número para el código de verificación.",
      ...COMMON_REQUIREMENTS,
    ],
    button: "Conectar número nuevo",
  },
  {
    mode: "coexistence",
    icon: "retry",
    title: "WhatsApp Business Coexistence",
    tag: "App + DigiBot",
    description:
      "El número que ya usás en la app WhatsApp Business. Seguís respondiendo desde el celular como siempre y además desde DigiBot. Traemos tus contactos y tus chats recientes.",
    requirements: [
      "La app WhatsApp Business actualizada en el celular (no sirve el WhatsApp común).",
      "El celular a mano: vas a escanear un código QR desde la app.",
      "Dejá la app abierta mientras se sincronizan tus chats.",
      ...COMMON_REQUIREMENTS,
    ],
    button: "Conectar WhatsApp Business Coexistence",
  },
];

const WA_MANAGER_URL = "https://business.facebook.com/wa/manage/home/";
const POLL_MS = 2_000;
const POLL_SYNC_MS = 4_000;

export interface SignupRequest {
  // Cambia en cada click (relanza el flujo)
  key: number;
  reconnectId: number | null;
  mode: WaMode;
}

type LocalState =
  | { kind: "idle" }
  | { kind: "running"; progress: SignupProgress | null }
  | { kind: "error"; message: string };

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

const TERMINAL: SignupPhase[] = ["done", "failed", "cancelled"];

export default function WhatsAppSignupModal({
  accountId,
  meta,
  initialSessionId,
  request,
  onClose,
}: {
  accountId: number;
  meta: MetaClientConfig;
  initialSessionId: string | null;
  request: SignupRequest | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<LocalState>({ kind: "idle" });
  const initialUsed = useRef(false);
  const runId = useRef(0);
  const sessionRef = useRef<string | null>(null);

  const apply = useCallback((run: number, progress: SignupProgress) => {
    if (runId.current !== run) return;
    setState((prev) => {
      // Un "pending" que llega tarde no pisa un estado más avanzado.
      const prevPhase = prev.kind === "running" ? prev.progress?.phase : null;
      if (prevPhase && TERMINAL.includes(prevPhase) && (progress.phase === "connecting" || progress.phase === "configuring")) {
        return prev;
      }
      return { kind: "running", progress };
    });
  }, []);

  // El click que abre el modal lanza el flujo (FB.login tiene que salir del gesto del usuario).
  useEffect(() => {
    if (!request) return;
    const run = ++runId.current;
    setState({ kind: "running", progress: null });
    sessionRef.current = null;

    const canUseInitial = !request.reconnectId && initialSessionId && !initialUsed.current;
    if (canUseInitial) initialUsed.current = true;
    const sessionPromise: Promise<string> = canUseInitial
      ? Promise.resolve(initialSessionId!)
      : call<{ sessionId: string }>(accountApi(accountId, "canales/whatsapp"), {
          method: "POST",
          body: JSON.stringify({ reconnectId: request.reconnectId }),
        }).then((r) => r.sessionId);

    const fail = (err: unknown) => runId.current === run && setState({ kind: "error", message: (err as Error).message });
    let heardFromMeta = false;
    const send = (path: "code" | "evento", body: unknown) =>
      sessionPromise
        .then((id) =>
          call<SignupProgress>(accountApi(accountId, `canales/whatsapp/signup/${id}/${path}`), {
            method: "POST",
            body: JSON.stringify(body),
          })
        )
        .then((p) => apply(run, p))
        .catch(fail);

    launchEmbeddedSignup(meta, {
      onCode: (code) => {
        heardFromMeta = true;
        void send("code", { code });
      },
      onEvent: (event) => {
        heardFromMeta = true;
        void send("evento", { event });
      },
    }, { coexistence: request.mode === "coexistence" })
      .then((code) => {
        if (code) return;
        // Sin code: si Meta tampoco mandó un evento, se cerró la ventana sin terminar.
        setTimeout(() => {
          if (runId.current !== run || heardFromMeta) return;
          setState((prev) =>
            prev.kind === "running" && (!prev.progress || prev.progress.phase === "connecting")
              ? {
                  kind: "running",
                  progress: {
                    sessionId: sessionRef.current ?? "",
                    phase: "cancelled",
                    progress: null,
                    coexistence: false,
                    historyDeclined: false,
                    phone: null,
                    error: null,
                  },
                }
              : prev
          );
        }, 2_000);
      })
      .catch(fail);

    sessionPromise.then((id) => {
      sessionRef.current = id;
    }, fail);
  }, [request, accountId, meta, initialSessionId, apply]);

  // Polling mientras no termine.
  const phase = state.kind === "running" ? (state.progress?.phase ?? "connecting") : null;
  useEffect(() => {
    if (phase === null || TERMINAL.includes(phase)) return;
    const run = runId.current;
    const timer = setInterval(
      () => {
        const id = sessionRef.current;
        if (!id) return;
        call<SignupProgress>(accountApi(accountId, `canales/whatsapp/signup/${id}`))
          .then((p) => apply(run, p))
          .catch(() => undefined);
      },
      phase === "syncing" ? POLL_SYNC_MS : POLL_MS
    );
    return () => clearInterval(timer);
  }, [phase, accountId, apply]);

  const close = () => {
    runId.current++;
    setState({ kind: "idle" });
    onClose();
  };

  const progress = state.kind === "running" ? state.progress : null;
  const open = request !== null && state.kind !== "idle";

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        request?.reconnectId
          ? "Reconectar WhatsApp"
          : request?.mode === "coexistence"
            ? "Conectar WhatsApp Business Coexistence"
            : "Conectar número nuevo"
      }
      description={
        request?.mode === "coexistence"
          ? "Seguí los pasos en la ventana de Meta y escaneá el código QR desde la app WhatsApp Business. Esta pantalla se actualiza sola."
          : "Seguí los pasos en la ventana de Meta. Esta pantalla se actualiza sola."
      }
      maxWidth={520}
      footer={
        <div className="flex justify-end">
          <button
            onClick={close}
            className="h-[46px] rounded-pill border border-crm-border-2 bg-crm-chip px-[22px] font-poppins text-sm font-semibold text-crm-ink"
          >
            {phase === "done" || phase === "syncing" ? "Listo" : "Cerrar"}
          </button>
        </div>
      }
    >
      {state.kind === "error" ? (
        <ErrorBox message={state.message} />
      ) : (
        <ProgressBody progress={progress} />
      )}
    </Modal>
  );
}

const STEP_LABELS: { phase: SignupPhase; label: string }[] = [
  { phase: "connecting", label: "Conectando" },
  { phase: "configuring", label: "Configurando" },
  { phase: "syncing", label: "Sincronizando" },
  { phase: "done", label: "Listo" },
];

function ProgressBody({ progress }: { progress: SignupProgress | null }) {
  const phase = progress?.phase ?? "connecting";

  if (phase === "failed") {
    return (
      <ErrorBox
        message={progress?.error?.message ?? "No se pudo completar la conexión."}
        metaSessionId={progress?.error?.metaSessionId ?? null}
        reference={progress?.sessionId ?? null}
      />
    );
  }
  if (phase === "cancelled") {
    return (
      <p className="m-0 rounded-field bg-crm-surf px-4 py-3 text-sm text-crm-ink-2">
        Se cerró la ventana de Meta antes de terminar. Cuando quieras, tocá Conectar de nuevo.
      </p>
    );
  }

  const steps = STEP_LABELS.filter((s) => s.phase !== "syncing" || progress?.coexistence);
  const current = steps.findIndex((s) => s.phase === phase);

  return (
    <div className="flex flex-col gap-4">
      <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Progreso de la conexión">
        {steps.map((s, i) => {
          const done = i < current || phase === "done";
          const active = i === current && phase !== "done";
          return (
            <li key={s.phase} className="flex items-center gap-3" aria-current={active ? "step" : undefined}>
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done ? "bg-crm-success text-white" : active ? "bg-crm-primary text-white" : "bg-crm-surf text-crm-muted"
                }`}
              >
                {done ? <Icon name="check" size={14} /> : i + 1}
              </span>
              <span className={`text-sm ${active ? "font-semibold text-crm-ink" : done ? "text-crm-ink-2" : "text-crm-muted"}`}>
                {s.label}
                {s.phase === "syncing" && phase === "syncing" && progress?.progress !== null ? ` · ${progress?.progress ?? 0}%` : ""}
                {active && s.phase !== "syncing" ? "…" : ""}
              </span>
            </li>
          );
        })}
      </ol>

      {phase === "connecting" && (
        <p className="m-0 text-sm text-crm-muted">Completá los pasos en la ventana de Meta (elegí tu portfolio y tu número).</p>
      )}
      {phase === "configuring" && <p className="m-0 text-sm text-crm-muted">Estamos activando tu número. Tarda unos segundos.</p>}
      {phase === "syncing" && (
        <div className="flex flex-col gap-2">
          <div className="h-2 overflow-hidden rounded-pill bg-crm-surf" role="progressbar" aria-valuenow={progress?.progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-crm-primary transition-[width]" style={{ width: `${progress?.progress ?? 0}%` }} />
          </div>
          <p className="m-0 text-sm text-crm-muted">
            Estamos trayendo tus chats de la app de WhatsApp Business. Dejá la app abierta en el celular. Podés cerrar esta ventana:
            sigue en segundo plano.
          </p>
        </div>
      )}
      {phase === "done" && progress?.phone && (
        <p className="m-0 text-sm text-crm-success-ink">
          Listo: <strong>{progress.phone.title}</strong>
          {progress.phone.subtitle ? ` (${progress.phone.subtitle})` : ""} quedó conectado.
          {progress.historyDeclined ? " No compartiste el historial de chats: llegan solo los mensajes nuevos." : ""}
        </p>
      )}

      {(phase === "done" || phase === "syncing") && (
        <div className="rounded-[14px] border-2 border-crm-primary bg-crm-surf px-4 py-3.5">
          <div className="font-poppins text-[15px] font-semibold text-crm-ink">Último paso: agregá un método de pago en WhatsApp Manager</div>
          <p className="mb-2.5 mt-1 text-[13px] text-crm-ink-2">Sin un medio de pago, Meta no deja mandar plantillas ni iniciar conversaciones.</p>
          <a
            href={WA_MANAGER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-1.5 rounded-pill bg-crm-primary px-4 font-poppins text-sm font-semibold text-white hover:bg-crm-primary-hover"
          >
            Abrir WhatsApp Manager
          </a>
        </div>
      )}
    </div>
  );
}

function ErrorBox({ message, metaSessionId, reference }: { message: string; metaSessionId?: string | null; reference?: string | null }) {
  return (
    <div role="alert" className="flex flex-col gap-1.5 rounded-field bg-crm-error-bg px-4 py-3 text-sm text-crm-error-ink">
      <span className="font-semibold">{message}</span>
      {metaSessionId && <span className="text-xs">ID de sesión de Meta: {metaSessionId}</span>}
      {reference && <span className="text-xs">Referencia DigiBot: {reference}</span>}
      <span className="text-xs">Si se repite, mandanos estos datos y lo revisamos.</span>
    </div>
  );
}
