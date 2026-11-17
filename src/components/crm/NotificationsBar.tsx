"use client";

// Avisos sin leer de la cuenta arriba del contenido (ej: "WhatsApp desconectado").
// Se consultan al entrar y cada pocos minutos; "Entendido" los marca como leídos.

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { accountApi } from "@/lib/crm/permissions";

interface Notice {
  id: number;
  title: string;
  body: string | null;
  link: string | null;
}

const POLL_MS = 3 * 60 * 1000;

export default function NotificationsBar({ accountId, disabled }: { accountId: number | null; disabled: boolean }) {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    if (accountId === null || disabled) {
      setNotices([]);
      return;
    }
    let alive = true;
    const load = () =>
      fetch(accountApi(accountId, "notificaciones"), { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { notifications: [] }))
        .then((d: { notifications?: Notice[] }) => alive && setNotices(d.notifications ?? []))
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [accountId, disabled]);

  if (accountId === null || notices.length === 0) return null;

  const dismiss = (id: number) => {
    setNotices((list) => list.filter((n) => n.id !== id));
    void fetch(accountApi(accountId, "notificaciones"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
  };

  return (
    <div className="flex shrink-0 flex-col gap-2 px-4 pt-3 md:px-[clamp(20px,3vw,40px)]" role="region" aria-label="Avisos">
      {notices.map((n) => (
        <div
          key={n.id}
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-card border border-crm-error-border bg-crm-error-bg px-4 py-3 text-sm text-crm-error-ink"
        >
          <Icon name="alert" size={20} className="shrink-0 text-crm-error" />
          <div className="min-w-[200px] flex-1">
            <div className="font-semibold">{n.title}</div>
            {n.body && <div className="text-[13px]">{n.body}</div>}
          </div>
          {n.link && (
            <Link href={n.link} className="font-semibold underline underline-offset-2">
              Resolver
            </Link>
          )}
          <button onClick={() => dismiss(n.id)} className="min-h-[36px] rounded-pill px-3 font-semibold hover:bg-white/40">
            Entendido
          </button>
        </div>
      ))}
    </div>
  );
}
