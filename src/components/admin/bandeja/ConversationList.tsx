"use client";

import type { InboxConversation } from "@/lib/wa-inbox/types";
import { displayName, formatListTime, initials } from "./utils";

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: InboxConversation[];
  selectedId: number | null;
  onSelect: (conversation: InboxConversation) => void;
}) {
  return (
    <ul className="flex-1 overflow-y-auto">
      {conversations.map((conversation) => {
        const selected = conversation.id === selectedId;
        const unread = conversation.unreadCount > 0 && !selected;
        return (
          <li key={conversation.id}>
            <button
              onClick={() => onSelect(conversation)}
              className={`flex w-full items-center gap-3 border-b border-border px-4 py-3.5 text-left transition-colors ${
                selected ? "bg-primary/10" : "hover:bg-muted"
              }`}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 font-poppins text-sm font-bold text-primary">
                {initials(conversation)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-poppins text-[15px] font-semibold text-foreground">
                    {displayName(conversation)}
                  </span>
                  {/* La hora sale del reloj/zona del navegador: puede diferir de la del server en el SSR. */}
                  <span
                    suppressHydrationWarning
                    className={`shrink-0 text-xs ${unread ? "font-semibold text-primary" : "text-muted-foreground"}`}
                  >
                    {formatListTime(conversation.lastMessageAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-sm ${unread ? "font-medium text-foreground" : "text-muted-foreground"}`}
                  >
                    {conversation.lastMessagePreview || "—"}
                  </span>
                  {unread && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                      {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
