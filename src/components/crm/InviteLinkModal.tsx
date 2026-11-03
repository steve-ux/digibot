"use client";

import { Modal } from "@/components/crm/Modal";
import { useToast } from "@/components/crm/Toast";
import { CHANNELS } from "@/lib/crm/channels";

export interface InviteLink {
  name: string;
  url: string;
  // true = link para una contraseña nueva (la persona ya tenía acceso)
  reset: boolean;
}

// Link para crear la contraseña: se copia o se manda por WhatsApp (el email llega más adelante).
export default function InviteLinkModal({
  invite,
  onClose,
  demo = false,
}: {
  invite: InviteLink | null;
  onClose: () => void;
  demo?: boolean;
}) {
  const toast = useToast();
  const firstName = invite?.name.split(" ")[0] ?? "";

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Link copiado");
    } catch {
      toast("No se pudo copiar: seleccioná el link y copialo a mano", "error");
    }
  };

  return (
    <Modal
      open={invite !== null}
      onClose={onClose}
      title={invite?.reset ? "Link para nueva contraseña" : "¡Listo! Falta un paso"}
      description={
        invite
          ? `Mandale este link a ${firstName} por WhatsApp o email para que ${
              invite.reset ? "elija una contraseña nueva" : "cree su contraseña"
            }. Vence en 7 días y sirve una sola vez.`
          : undefined
      }
      maxWidth={520}
    >
      {invite && (
        <div className="flex flex-col gap-3">
          <label htmlFor="invite-link" className="sr-only">
            Link de invitación
          </label>
          <input
            id="invite-link"
            readOnly
            value={invite.url}
            onFocus={(e) => e.target.select()}
            className="h-11 w-full rounded-field border border-crm-border bg-crm-surf px-3.5 text-sm text-crm-ink outline-none"
          />
          <div className="flex flex-wrap gap-2.5">
            <button
              data-autofocus
              onClick={() => copy(invite.url)}
              className="h-11 flex-1 rounded-pill bg-crm-primary px-5 font-poppins text-sm font-semibold text-white hover:bg-crm-primary-hover"
            >
              Copiar link
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `¡Hola ${firstName}! Te sumé al panel de DigiBot. Creá tu contraseña acá: ${invite.url}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-pill border border-crm-border-2 bg-crm-chip px-5 font-poppins text-sm font-semibold text-crm-ink hover:border-crm-primary hover:text-crm-primary"
            >
              <img src={CHANNELS.wa.icon} alt="" width={18} height={18} />
              Mandar por WhatsApp
            </a>
          </div>
          {demo && <p className="m-0 text-xs text-crm-muted">En la demo el link no funciona.</p>}
        </div>
      )}
    </Modal>
  );
}
