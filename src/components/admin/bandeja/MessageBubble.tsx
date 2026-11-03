import Logo from "@/components/Logo";
import Icon from "@/components/crm/Icon";
import type { ChannelId } from "@/lib/crm/channels";
import { humanizeSendError } from "@/lib/crm/meta-errors";
import { formatTime, prettyBody, STATUS_LABELS, type UiMessage } from "./utils";

const BUBBLE = "rounded-[18px] px-3.5 py-2.5 text-[15px] leading-[1.45]";
const TEXT = "whitespace-pre-wrap break-words [text-wrap:pretty]";

// Etiqueta sobre la burbuja según el tipo (comentarios, plantillas…).
function typeLabel(m: UiMessage, channel: ChannelId): string | null {
  if (m.templateName) return `Plantilla · ${m.templateName}`;
  switch (m.type) {
    case "comment":
      return channel === "th" ? "Respuesta en tu hilo" : "Comentario";
    case "comment_reply":
      return "Respuesta pública";
    case "private_reply":
      return "Mensaje privado";
    default:
      return null;
  }
}

// Los avisos se guardan en tercera persona; si los hizo quien mira, se dicen en segunda.
function systemText(m: UiMessage, meName: string) {
  const mine = m.authorName === meName;
  if (mine) {
    if (m.type === "system:take") return "Tomaste la conversación · DigiBot en pausa en este chat";
    if (m.type === "system:resolve") return "Resolviste la conversación";
    if (m.type === "system:reopen") return "Reabriste la conversación";
  }
  return m.body ?? "";
}

export interface FailureActions {
  onRetry: (m: UiMessage) => void;
  onTemplate: () => void;
}

function FailureCard({ m, channel, actions }: { m: UiMessage; channel: ChannelId; actions: FailureActions }) {
  const human = humanizeSendError(m.errorCode, channel, m.errorTitle);
  const canRetry = human.retryable && m.type !== "template" && m.id > 0;
  const showTemplate = channel === "wa" && (human.needsTemplate || m.type === "template");
  return (
    <div
      role="alert"
      className="mt-1.5 flex max-w-[420px] items-start gap-2.5 rounded-[14px] border border-crm-error-border bg-crm-error-bg px-3 py-2.5"
    >
      <Icon name="alert" size={18} className="mt-px text-crm-error" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-crm-error-ink">No se pudo enviar</div>
        <div className="mt-0.5 text-[13px] leading-[1.4] text-crm-error-ink-2">{human.message}</div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {canRetry && (
            <button
              onClick={() => actions.onRetry(m)}
              className="flex h-[30px] items-center gap-1.5 rounded-pill bg-crm-error px-3 text-xs font-bold text-white hover:opacity-90"
            >
              <Icon name="retry" size={13} />
              Reintentar
            </button>
          )}
          {showTemplate && (
            <button
              onClick={actions.onTemplate}
              className="flex h-[30px] items-center gap-1.5 rounded-pill bg-crm-primary px-3 text-xs font-bold text-white hover:bg-crm-primary-hover"
            >
              <Icon name="template" size={13} />
              Enviar plantilla
            </button>
          )}
          {m.errorCode !== null && <span className="text-[11px] text-crm-error-ink-2 opacity-80">Código {m.errorCode}</span>}
        </div>
      </div>
    </div>
  );
}

export default function MessageBubble({
  message: m,
  channel,
  meName,
  actions,
}: {
  message: UiMessage;
  channel: ChannelId;
  meName: string;
  actions: FailureActions;
}) {
  const time = formatTime(m.messageAt);
  const body = prettyBody(m.body, m.type);
  const label = typeLabel(m, channel);

  if (m.author === "system") {
    return <div className="self-center px-2 py-1 text-center text-xs font-medium text-crm-muted">{systemText(m, meName)}</div>;
  }

  if (m.author === "note") {
    return (
      <div className="max-w-[min(480px,85%)] self-end rounded-[14px] border border-dashed border-crm-note-border bg-crm-note px-[13px] py-[9px] text-sm leading-[1.45] text-crm-note-ink">
        <div className="mb-0.5 text-[11px] font-bold">
          Nota interna · {m.authorName === meName ? "Vos" : m.authorName?.split(" ")[0] || "Equipo"} · solo la ve tu equipo
        </div>
        <div className={TEXT}>{body}</div>
      </div>
    );
  }

  if (m.author === "customer") {
    return (
      <div className="max-w-[min(560px,85%)] self-start md:max-w-[min(560px,78%)]">
        {label && <div className="mb-1 ml-1 text-[11px] font-semibold text-crm-muted">{label}</div>}
        <div className={`${BUBBLE} rounded-bl-[4px] bg-crm-in-bubble text-crm-ink shadow-[0_1px_1px_rgba(0,0,0,.05)]`}>
          <div className={TEXT}>{body}</div>
          <div className="mt-[3px] text-right text-[11px] opacity-60">{time}</div>
        </div>
      </div>
    );
  }

  if (m.author === "bot") {
    return (
      <div className="max-w-[min(560px,85%)] self-end md:max-w-[min(560px,78%)]">
        <div className="mb-1 mr-1 flex items-center justify-end gap-1.5 text-[11px] font-bold text-crm-primary">
          <Logo size={14} />
          {label ? `DigiBot · ${label}` : "Respondió DigiBot"}
        </div>
        <div className={`${BUBBLE} rounded-br-[4px] border border-crm-tint-border bg-crm-bot-bubble text-crm-ink`}>
          <div className={TEXT}>{body}</div>
          <div className="mt-[3px] text-right text-[11px] opacity-60">{time}</div>
        </div>
      </div>
    );
  }

  // Agente (persona del equipo)
  const failed = m.status === "failed";
  const by = m.authorName && m.authorName !== meName ? m.authorName : null;
  const topLabel = [label, by].filter(Boolean).join(" · ");
  const status = failed ? "No enviado" : STATUS_LABELS[m.status];
  return (
    <div className="flex max-w-[min(560px,85%)] flex-col items-end self-end md:max-w-[min(560px,78%)]">
      {topLabel && <div className="mb-1 mr-1 text-[11px] font-semibold text-crm-muted">{topLabel}</div>}
      <div className={`${BUBBLE} rounded-br-[4px] text-white ${failed ? "bg-[#94A3B8] dark:bg-[#475569]" : "bg-crm-primary"}`}>
        <div className={TEXT}>{body}</div>
        <div className="mt-[3px] text-right text-[11px] opacity-85">
          {time}
          {status && ` · ${status}`}
        </div>
      </div>
      {failed && <FailureCard m={m} channel={channel} actions={actions} />}
    </div>
  );
}
