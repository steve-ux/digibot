import { AlertTriangle, Check, CheckCheck, Clock } from "lucide-react";
import type { MessageStatus } from "@/lib/wa-inbox/types";
import { formatTime, type UiMessage } from "./utils";

function errorText(message: UiMessage) {
  const title = message.errorTitle || "Error desconocido";
  return message.errorCode ? `${title} (código ${message.errorCode})` : title;
}

function StatusIcon({ message }: { message: UiMessage }) {
  const icons: Record<Exclude<MessageStatus, "received">, React.ReactNode> = {
    sending: <Clock size={14} aria-label="Enviando" />,
    sent: <Check size={15} aria-label="Enviado" />,
    delivered: <CheckCheck size={15} aria-label="Entregado" />,
    read: <CheckCheck size={15} className="text-cyan-300" aria-label="Leído" />,
    failed: <AlertTriangle size={14} className="text-yellow-300" aria-label="Fallido" />,
  };
  if (message.status === "received") return null;
  return (
    <span title={message.status === "failed" ? errorText(message) : undefined}>
      {icons[message.status]}
    </span>
  );
}

export default function MessageBubble({ message }: { message: UiMessage }) {
  const outbound = message.direction === "out";

  return (
    <div className={`flex flex-col ${outbound ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed shadow-sm ${
          outbound
            ? "rounded-br-[4px] bg-primary text-primary-foreground"
            : "rounded-bl-[4px] bg-zinc-100 text-foreground dark:bg-zinc-800"
        }`}
      >
        {message.templateName && (
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-75">
            Plantilla · {message.templateName}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{message.body || `[${message.type}]`}</div>
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${
            outbound ? "text-primary-foreground/75" : "text-muted-foreground"
          }`}
        >
          <span>{formatTime(message.messageAt)}</span>
          {outbound && <StatusIcon message={message} />}
        </div>
      </div>
      {outbound && message.status === "failed" && (
        <div className="mt-1 max-w-[78%] text-right text-xs text-destructive">
          No se envió: {errorText(message)}
        </div>
      )}
    </div>
  );
}
