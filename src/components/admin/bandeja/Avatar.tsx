import { avatarColor, CHANNELS, initialsOf } from "@/lib/crm/channels";
import type { InboxConversation } from "@/lib/wa-inbox/types";
import { displayName } from "./utils";

// Avatar con iniciales y, opcionalmente, el ícono del canal abajo a la derecha.
export default function Avatar({
  conversation,
  size = 46,
  showChannel = true,
}: {
  conversation: InboxConversation;
  size?: number;
  showChannel?: boolean;
}) {
  const channel = CHANNELS[conversation.channel];
  const badge = Math.round(size * 0.42);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="flex h-full w-full items-center justify-center rounded-full font-poppins font-semibold text-white"
        style={{ background: avatarColor(conversation.id - 1), fontSize: Math.round(size * 0.33) }}
        aria-hidden
      >
        {initialsOf(conversation.contactName || displayName(conversation))}
      </div>
      {showChannel && (
        <img
          src={channel.icon}
          alt={channel.name}
          width={badge}
          height={badge}
          className="absolute -bottom-[3px] -right-[3px] box-content rounded-full border-2 border-crm-side bg-crm-side"
        />
      )}
    </div>
  );
}
