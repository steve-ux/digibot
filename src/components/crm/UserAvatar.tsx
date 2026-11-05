"use client";

import { useEffect, useState } from "react";
import { avatarColor, initialsOf } from "@/lib/crm/channels";

// Foto de perfil de la persona logueada; sin foto (o si no carga), sus iniciales.
export default function UserAvatar({
  name,
  url,
  size = 38,
  seed = 0,
}: {
  name: string;
  url: string | null;
  size?: number;
  seed?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        title={name}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-poppins font-bold text-white"
      style={{ width: size, height: size, background: avatarColor(seed), fontSize: Math.round(size * 0.37) }}
      title={name}
    >
      {initialsOf(name)}
    </div>
  );
}
