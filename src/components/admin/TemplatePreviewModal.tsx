"use client";

import { X } from "lucide-react";
import type { WhatsAppTemplate } from "@/lib/meta-whatsapp";
import StatusBadge from "./StatusBadge";

export default function TemplatePreviewModal({
  template,
  onClose,
}: {
  template: WhatsAppTemplate;
  onClose: () => void;
}) {
  const header = template.components.find((c) => c.type === "HEADER");
  const body = template.components.find((c) => c.type === "BODY");
  const footer = template.components.find((c) => c.type === "FOOTER");
  const buttonsComponent = template.components.find((c) => c.type === "BUTTONS");
  const buttons = buttonsComponent && "buttons" in buttonsComponent ? buttonsComponent.buttons : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[380px] rounded-[28px] border border-border bg-card p-5 shadow-[0_30px_70px_-30px_rgba(28,28,28,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-poppins font-semibold text-foreground">{template.name}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              {template.language} · {template.category}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={template.status} />
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-poppins text-[15px] font-bold text-white">
            D
          </div>
          <div>
            <div className="font-poppins text-[15px] font-semibold text-foreground">DigiBot</div>
            <div className="text-xs font-semibold text-green-600">en línea</div>
          </div>
        </div>

        <div className="chat-pattern mt-4 flex flex-col gap-2 rounded-2xl p-4">
          <div className="max-w-[92%] rounded-2xl rounded-bl-[4px] bg-card p-3.5 text-[14px] leading-relaxed text-foreground shadow-sm">
            {header && "text" in header && (
              <div className="mb-1.5 font-poppins font-bold text-foreground">{header.text}</div>
            )}
            <div className="whitespace-pre-wrap">
              {body && "text" in body ? body.text : "—"}
            </div>
            {footer && "text" in footer && (
              <div className="mt-1.5 text-xs text-muted-foreground">{footer.text}</div>
            )}
            {buttons.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-2.5">
                {buttons.map((b, i) => (
                  <div
                    key={i}
                    className="rounded-lg py-1.5 text-center text-[13px] font-semibold text-primary"
                  >
                    {b.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
