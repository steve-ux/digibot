// Traducción de los errores de envío de Meta a mensajes que entienda cualquiera.
// ÚNICO lugar donde se mapean códigos: la UI nunca muestra el error crudo de Meta
// (solo el código, en chiquito, para soporte).
//
// Referencias:
//   WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
//   Messenger / Instagram: https://developers.facebook.com/docs/messenger-platform/error-codes
// Sin imports de servidor: se usa en componentes cliente.

import type { ChannelId } from "./channels";

export interface HumanError {
  // Texto para la persona que está respondiendo (voseo, sin jerga).
  message: string;
  // Si tiene sentido ofrecer "Reintentar" con el mismo contenido.
  retryable: boolean;
  // Si el problema se resuelve mandando una plantilla (ventana de 24 h cerrada).
  needsTemplate?: boolean;
}

const WINDOW_CLOSED: HumanError = {
  message:
    "Pasaron más de 24 h desde el último mensaje del cliente. Para retomar la charla mandale una plantilla aprobada.",
  retryable: false,
  needsTemplate: true,
};

const RECONNECT: HumanError = {
  message: "Se perdió la conexión con Meta. Pedile a un administrador que vuelva a conectar el canal en Canales.",
  retryable: false,
};

const TRY_LATER: HumanError = {
  message: "WhatsApp tuvo un problema momentáneo. Probá de nuevo en unos minutos.",
  retryable: true,
};

const WHATSAPP_ERRORS: Record<number, HumanError> = {
  // Ventana de 24 h
  131047: WINDOW_CLOSED,
  470: WINDOW_CLOSED,
  // Destinatario
  131030: {
    message:
      "Este número todavía no está habilitado para recibir mensajes de prueba. Agregalo en la lista de números permitidos de Meta.",
    retryable: true,
  },
  131026: {
    message:
      "No pudimos entregar el mensaje: puede que el número no tenga WhatsApp, que tenga una versión muy vieja o que no haya aceptado los términos nuevos.",
    retryable: false,
  },
  131021: { message: "No podés mandarte mensajes al mismo número del negocio.", retryable: false },
  131050: {
    message: "El cliente pidió no recibir mensajes de marketing de tu negocio. Respetalo y no insistas por este medio.",
    retryable: false,
  },
  131049: {
    message:
      "WhatsApp decidió no entregar este mensaje para cuidar la experiencia del cliente (recibió muchos mensajes de marketing). Probá más adelante.",
    retryable: false,
  },
  // Límites de envío
  131056: {
    message: "Le mandaste muchos mensajes seguidos a este cliente. Esperá un momento antes de volver a escribirle.",
    retryable: true,
  },
  131048: {
    message: "WhatsApp limitó los envíos de este número por reportes de los clientes. Esperá un rato y revisá la calidad del número.",
    retryable: true,
  },
  130429: { message: "Se están mandando demasiados mensajes por segundo. Probá de nuevo en un momento.", retryable: true },
  80007: { message: "Se alcanzó el límite de envíos de la cuenta. Probá de nuevo más tarde.", retryable: true },
  4: { message: "Se alcanzó el límite de pedidos a Meta. Probá de nuevo en unos minutos.", retryable: true },
  // Contenido
  131051: { message: "WhatsApp no admite este tipo de mensaje.", retryable: false },
  131052: { message: "No se pudo descargar el archivo que mandó el cliente.", retryable: false },
  131053: { message: "No se pudo subir el archivo. Probá con otro formato o un archivo más liviano.", retryable: false },
  131008: { message: "Al mensaje le falta información obligatoria.", retryable: false },
  131009: { message: "Alguno de los datos del mensaje no es válido.", retryable: false },
  100: { message: "Alguno de los datos del mensaje no es válido.", retryable: false },
  // Plantillas
  132000: { message: "La cantidad de variables no coincide con la plantilla. Revisá que estén todas completas.", retryable: false },
  132001: { message: "La plantilla no existe o todavía no está aprobada en ese idioma.", retryable: false },
  132005: { message: "Con las variables completas, la plantilla queda demasiado larga. Acortá los textos.", retryable: false },
  132007: { message: "El contenido de la plantilla no cumple las políticas de WhatsApp.", retryable: false },
  132012: { message: "Alguna variable de la plantilla tiene un formato que no corresponde.", retryable: false },
  132015: { message: "La plantilla está pausada por baja calidad. Usá otra mientras tanto.", retryable: false },
  132016: { message: "La plantilla fue deshabilitada por Meta. Usá otra.", retryable: false },
  // Cuenta / número del negocio
  131031: {
    message: "La cuenta de WhatsApp Business está bloqueada. Revisá los avisos en el Administrador de WhatsApp de Meta.",
    retryable: false,
  },
  131042: {
    message: "Hay un problema con el medio de pago de la cuenta de WhatsApp Business. Revisalo en Meta para seguir enviando.",
    retryable: false,
  },
  131045: { message: "El número del negocio no está bien registrado en WhatsApp. Avisale a un administrador.", retryable: false },
  133010: { message: "El número del negocio no está registrado en WhatsApp. Avisale a un administrador.", retryable: false },
  131057: { message: "La cuenta de WhatsApp Business está en mantenimiento. Probá más tarde.", retryable: true },
  368: { message: "Meta bloqueó temporalmente los envíos por incumplir sus políticas.", retryable: false },
  131005: RECONNECT,
  190: RECONNECT,
  10: RECONNECT,
  200: RECONNECT,
  // Genéricos
  131000: TRY_LATER,
  131016: TRY_LATER,
  1: TRY_LATER,
  2: TRY_LATER,
};

// Messenger e Instagram comparten la plataforma de Messenger.
const MESSENGER_ERRORS: Record<number, HumanError> = {
  // 10 / subcódigo 2018278: fuera de la ventana de 24 h (no hay plantillas acá).
  2018278: {
    message:
      "Pasaron más de 24 h desde el último mensaje del cliente y Meta no deja responder fuera de ese plazo por este canal.",
    retryable: false,
  },
  551: { message: "Esta persona no está disponible en este momento (puede que te haya bloqueado).", retryable: false },
  2018108: { message: "Esta persona no puede recibir mensajes de tu página ahora.", retryable: false },
  2534022: { message: "Ya respondiste por privado a este comentario. Meta permite una sola respuesta privada.", retryable: false },
  2534014: { message: "El comentario ya no existe o fue borrado.", retryable: false },
  613: { message: "Se están mandando demasiados mensajes. Probá de nuevo en un momento.", retryable: true },
  190: RECONNECT,
  10: RECONNECT,
  200: RECONNECT,
  1: TRY_LATER,
  2: TRY_LATER,
};

const FALLBACK: HumanError = {
  message: "No se pudo enviar el mensaje. Probá de nuevo y, si sigue fallando, avisanos.",
  retryable: true,
};

/**
 * Convierte un error de envío en un mensaje para el usuario.
 * - `code`: código de Meta (o null si el error fue nuestro, antes de llegar a Meta).
 * - `localMessage`: texto propio del servidor para errores sin código (ya está en castellano).
 * - `subcode`: error_subcode de Meta, si vino (Messenger lo usa para la ventana de 24 h).
 */
export function humanizeSendError(
  code: number | null,
  channel: ChannelId = "wa",
  localMessage?: string | null,
  subcode?: number | null
): HumanError {
  if (code === null) {
    return { message: localMessage || FALLBACK.message, retryable: true };
  }
  const table = channel === "wa" ? WHATSAPP_ERRORS : MESSENGER_ERRORS;
  if (subcode && table[subcode]) return table[subcode];
  return table[code] ?? FALLBACK;
}

/**
 * Qué código guardar en el mensaje fallido. Messenger/Instagram suelen mandar un
 * código genérico (ej. 10) con un subcódigo que es el que explica el problema
 * (ej. 2018278 = ventana vencida): si el subcódigo es conocido, se guarda ese.
 */
export function pickErrorCode(code: number | null, subcode: number | null, channel: ChannelId): number | null {
  if (channel !== "wa" && subcode !== null && MESSENGER_ERRORS[subcode]) return subcode;
  return code;
}
