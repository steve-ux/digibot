// Preguntas frecuentes de la pantalla Ayuda. Sin imports de servidor.
// Con `answer`, se responde al instante desde acá (sin pasar por el bot);
// sin `answer`, la pregunta se le manda al bot de soporte como si la escribiera la persona.
// `adminOnly`: solo la ven quienes administran la cuenta (las otras pantallas no las tienen).

export interface HelpFaq {
  id: string;
  label: string;
  question: string;
  answer?: string;
  adminOnly?: boolean;
}

export const HELP_FAQ: HelpFaq[] = [
  {
    id: "foto-perfil",
    label: "¿Cómo cambio mi foto de perfil?",
    question: "¿Cómo cambio mi foto de perfil?",
    answer:
      "Entrá a Configuración → Mi perfil (o tocá tu foto abajo a la izquierda del menú). Ahí podés subir una foto nueva o sacar la actual. El cambio lo ve todo tu equipo al instante.",
  },
  {
    id: "plan",
    label: "¿Cómo cambio de plan?",
    question: "¿Cómo cambio de plan?",
    answer:
      "Entrá a Configuración → Suscripción. Ahí ves tu plan actual, podés elegir otro y actualizar la tarjeta. Solo quien administra la cuenta ve esa pestaña.",
    adminOnly: true,
  },
  {
    id: "sonidos",
    label: "¿Cómo activo los sonidos de mensajes nuevos?",
    question: "¿Cómo activo los sonidos de mensajes nuevos?",
    answer:
      "Entrá a Configuración → Sonidos. Podés prenderlos, elegir un sonido por canal y ajustar el volumen. El navegador recién deja sonar después de que tocás algo en el panel.",
  },
  {
    id: "equipo",
    label: "¿Cómo sumo a alguien a mi equipo?",
    question: "¿Cómo sumo a alguien a mi equipo?",
    answer:
      "Entrá a Equipo y creá una invitación: elegís el rol (supervisor o agente) y, para los agentes, qué canales pueden atender. Le pasás el link y entra con su propia contraseña.",
    adminOnly: true,
  },
  {
    id: "canales",
    label: "¿Cómo conecto WhatsApp, Instagram o Facebook?",
    question: "¿Cómo conecto WhatsApp, Instagram o Facebook a DigiBot?",
    answer:
      "Entrá a Canales y tocá Conectar en el canal que quieras. Te abre la ventana de Meta para iniciar sesión y elegir la cuenta o el número. Cuando termina, los mensajes empiezan a llegar a la Bandeja.",
    adminOnly: true,
  },
  {
    id: "archivar",
    label: "¿Cómo archivo una conversación?",
    question: "¿Cómo archivo una conversación?",
    answer:
      "En la Bandeja, pasá el mouse por la conversación y tocá Archivar. Sale de la bandeja de todo el equipo y vuelve sola si el cliente escribe de nuevo.",
  },
  {
    id: "bot-pausa",
    label: "¿Cómo pauso el bot en una conversación?",
    question: "¿Cómo pauso el bot en una conversación para responder yo?",
  },
  {
    id: "plantillas",
    label: "¿Para qué sirven las plantillas?",
    question: "¿Para qué sirven las plantillas de WhatsApp y cómo las creo?",
  },
  {
    id: "seccion",
    label: "No encuentro una sección del panel",
    question: "No encuentro una sección del panel",
  },
];

export function faqFor(canManage: boolean) {
  return HELP_FAQ.filter((f) => canManage || !f.adminOnly);
}
