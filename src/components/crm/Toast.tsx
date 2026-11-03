"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Icon from "./Icon";

type ToastKind = "ok" | "error";
interface ToastState {
  id: number;
  text: string;
  kind: ToastKind;
}

const ToastContext = createContext<(text: string, kind?: ToastKind) => void>(() => {});

// Confirmación breve de cada acción ("Conversación resuelta", "Plantilla enviada"…).
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((text: string, kind: ToastKind = "ok") => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), text, kind });
    timer.current = setTimeout(() => setToast(null), kind === "error" ? 4000 : 2400);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none">
        {toast && (
          <div
            key={toast.id}
            className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-[200] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2.5 rounded-pill bg-[#1C1C1C] py-3 pl-3.5 pr-5 text-sm font-semibold text-white shadow-[0_16px_40px_-12px_rgba(0,0,0,.4)] [animation:crm-rise_.25s_ease-out] md:bottom-7 dark:bg-[#2E2E2E]"
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                toast.kind === "ok" ? "bg-crm-accent text-[#1C1C1C]" : "bg-crm-error text-white"
              }`}
            >
              <Icon name={toast.kind === "ok" ? "check" : "alert"} size={14} />
            </span>
            <span className="min-w-0">{toast.text}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
