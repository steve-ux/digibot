"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import ChatPanel from "./ChatPanel";
import ConversationList from "./ConversationList";
import { POLL_INTERVAL_MS, usePolling } from "./utils";
import type { InboxConversation } from "@/lib/wa-inbox/types";

export type BandejaLoadState =
  | { kind: "not_configured"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; conversations: InboxConversation[] };

// Las conversaciones llegan ya cargadas desde el server (page.tsx); el polling
// solo las mantiene al día.
export default function BandejaView({ initialState }: { initialState: BandejaLoadState }) {
  const [state, setState] = useState<BandejaLoadState>(initialState);
  const [selected, setSelected] = useState<InboxConversation | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  usePolling(
    async () => {
      if (state.kind === "not_configured") return;
      try {
        const res = await fetch("/api/admin/bandeja/conversaciones", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          setState((prev) =>
            prev.kind === "ready" || prev.kind === "not_configured"
              ? prev
              : { kind: "error", message: data.message || "No se pudieron cargar las conversaciones." }
          );
          return;
        }
        setState({ kind: "ready", conversations: data.conversations });
      } catch {
        setState((prev) =>
          prev.kind === "ready" || prev.kind === "not_configured"
            ? prev
            : { kind: "error", message: "No se pudo conectar con el servidor." }
        );
      }
    },
    POLL_INTERVAL_MS,
    refreshKey
  );

  const conversations = state.kind === "ready" ? state.conversations : [];

  return (
    <AdminShell breadcrumb="Bandeja de WhatsApp">
      <div>
        <h1 className="font-poppins text-3xl font-extrabold tracking-tight text-foreground">
          Bandeja de WhatsApp
        </h1>
        <p className="mt-2 max-w-[640px] text-muted-foreground">
          Leé y respondé las conversaciones del número del negocio. Se actualiza sola
          cada pocos segundos.
        </p>
      </div>

      {state.kind === "not_configured" && (
        <div className="mt-10 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-6">
          <div className="font-poppins font-semibold text-foreground">La bandeja no está configurada</div>
          <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        </div>
      )}

      {state.kind === "error" && (
        <div className="mt-10 rounded-2xl border border-destructive/40 bg-destructive/10 p-6">
          <div className="font-poppins font-semibold text-destructive">
            No se pudieron cargar las conversaciones
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="mt-4 rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-primary hover:text-primary"
          >
            Reintentar
          </button>
        </div>
      )}

      {state.kind === "ready" && conversations.length === 0 && (
        <div className="mt-10 flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-16 text-center">
          <MessageCircle size={36} className="text-primary" />
          <p className="mt-4 max-w-[420px] text-muted-foreground">
            Todavía no hay conversaciones. Mandá un mensaje al número del negocio para empezar.
          </p>
        </div>
      )}

      {state.kind === "ready" && conversations.length > 0 && (
        <div className="mt-8 grid h-[calc(100vh-15rem)] min-h-[520px] overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-[340px_1fr]">
          <div
            className={`min-h-0 flex-col border-border lg:flex lg:border-r ${selected ? "hidden" : "flex"}`}
          >
            <ConversationList
              conversations={conversations}
              selectedId={selected?.id ?? null}
              onSelect={(conversation) => {
                setSelected(conversation);
                // El GET de mensajes la marca como leída; acá se refleja al instante.
                setState((prev) =>
                  prev.kind === "ready"
                    ? {
                        ...prev,
                        conversations: prev.conversations.map((c) =>
                          c.id === conversation.id ? { ...c, unreadCount: 0 } : c
                        ),
                      }
                    : prev
                );
              }}
            />
          </div>

          <div className={`min-h-0 ${selected ? "block" : "hidden lg:block"}`}>
            {selected ? (
              <ChatPanel
                key={selected.id}
                initialConversation={selected}
                onBack={() => setSelected(null)}
                onActivity={() => setRefreshKey((k) => k + 1)}
              />
            ) : (
              <div className="chat-pattern flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Elegí una conversación para ver los mensajes.
              </div>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
