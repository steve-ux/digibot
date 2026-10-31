"use client";

import { useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";

export default function Composer({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    // La barra de scroll solo aparece cuando el texto supera el alto máximo.
    el.style.overflowY = el.scrollHeight > 140 ? "auto" : "hidden";
  };

  const submit = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
    requestAnimationFrame(resize);
  };

  return (
    <div className="flex items-end gap-3 border-t border-border bg-card px-4 py-3">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          resize();
        }}
        onKeyDown={(e) => {
          // Enter envía, Shift+Enter hace salto de línea (y no cortamos la composición de acentos/IME).
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder="Escribí un mensaje…"
        className="max-h-[140px] flex-1 resize-none overflow-y-hidden rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
      />
      <button
        onClick={submit}
        disabled={!text.trim()}
        aria-label="Enviar"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <SendHorizontal size={18} />
      </button>
    </div>
  );
}
