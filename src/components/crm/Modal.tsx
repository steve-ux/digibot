"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Cierra con Escape, atrapa el foco adentro y lo devuelve al cerrar.
function useDialogBehavior(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const [head, tail] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  return ref;
}

export function CloseButton({ onClick, label = "Cerrar" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-crm-muted transition-colors hover:bg-crm-surf hover:text-crm-ink"
    >
      <Icon name="x" size={18} />
    </button>
  );
}

// Modal centrado en desktop; a pantalla completa en mobile (<768px).
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 540,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
}) {
  const ref = useDialogBehavior(open, onClose);
  const titleId = useId();
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="crm-root fixed inset-0 z-[100] flex items-stretch justify-center bg-crm-overlay md:items-center md:p-5"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth }}
        className="flex w-full flex-col bg-crm-card text-crm-ink md:max-h-[90vh] md:rounded-[24px]"
      >
        <div className="flex items-start gap-3 px-5 pb-1 pt-[max(16px,env(safe-area-inset-top))] md:px-[26px] md:pt-[22px]">
          <div className="min-w-0 flex-1 pt-2">
            <h2 id={titleId} className="font-poppins text-xl font-bold text-crm-ink">
              {title}
            </h2>
            {description && <p className="mt-1.5 text-sm text-crm-muted">{description}</p>}
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div className="crm-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 md:px-[26px] md:pb-[26px]">
          {children}
        </div>
        {footer && (
          <div className="pb-safe border-t border-crm-border px-5 py-4 md:border-0 md:px-[26px] md:pb-[26px] md:pt-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// Panel lateral derecho (drawer) desde md, bottom sheet en mobile.
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useDialogBehavior(open, onClose);
  const titleId = useId();
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="crm-root fixed inset-0 z-[90] flex items-end bg-crm-overlay md:items-stretch md:justify-end"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[88dvh] w-full flex-col rounded-t-[24px] bg-crm-side text-crm-ink [animation:crm-sheet-up_.22s_ease-out] md:max-h-none md:w-[340px] md:rounded-none md:[animation:crm-drawer-in_.22s_ease-out]"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-crm-border md:hidden" aria-hidden />
        <div className="flex items-center gap-2 px-4 pt-2 md:pt-4">
          <h2 id={titleId} className="flex-1 pl-2 font-poppins text-base font-semibold">
            {title}
          </h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="crm-scroll pb-safe min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}
