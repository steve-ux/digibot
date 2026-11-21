// Mensajes en castellano para lo que devuelve dLocal Go. Sin imports de servidor.
//
// En el checkout transparente, una tarjeta rechazada vuelve como 406 "Missing payment
// method" sin el motivo (probado en sandbox con todas las tarjetas de rechazo); cuando
// dLocal sí manda rejected_reason (pagos y cobros recurrentes), se traduce acá.

export class BillingError extends Error {
  constructor(
    message: string,
    public readonly httpStatus = 400,
    public readonly fields: Record<string, string | undefined> = {}
  ) {
    super(message);
  }
}

const REASONS: [RegExp, string][] = [
  [/INSUFFICIENT|AMOUNT/i, "La tarjeta no tiene fondos o límite suficiente."],
  [/EXPIRED/i, "La tarjeta está vencida."],
  [/CVV|SECURITY_CODE|INVALID_SECURITY/i, "El código de seguridad (CVV) es incorrecto."],
  [/CALL|AUTHORIZ/i, "El banco pide que lo llames para autorizar el pago."],
  [/RESTRICT|BLOCK|STOLEN|LOST/i, "El banco restringió la tarjeta. Probá con otra."],
  [/RISK|FRAUD/i, "El pago fue rechazado por seguridad. Probá con otra tarjeta."],
  [/DOCUMENT/i, "El documento no es válido para este país."],
  [/CARD_NUMBER|INVALID_CARD/i, "El número de tarjeta no es válido."],
  [/BANK|DECLINED|REJECTED/i, "El banco rechazó el pago. Probá con otra tarjeta."],
];

export const GENERIC_REJECTION = "No pudimos cobrar con esa tarjeta. Revisá los datos o probá con otra.";

export function rejectionMessage(reason: string | null | undefined) {
  if (!reason) return GENERIC_REJECTION;
  return REASONS.find(([re]) => re.test(reason))?.[1] ?? GENERIC_REJECTION;
}

// Errores de la API (código numérico de dLocal Go) al confirmar o crear un pago.
export function apiErrorMessage(code: number | null, message: string) {
  switch (code) {
    case 406:
      return GENERIC_REJECTION;
    case 5001:
      return /document/i.test(message) ? "El documento no es válido para este país." : "Revisá los datos ingresados.";
    case 5003:
      return "Todavía no cobramos en ese país.";
    case 5007:
      return "El monto supera el máximo permitido por dLocal Go.";
    case 5010:
      return "No hay medios de pago disponibles en ese país.";
    case 5016:
      return "El monto es menor al mínimo que permite dLocal Go en ese país.";
    default:
      return "No pudimos procesar el pago. Probá de nuevo en unos minutos.";
  }
}
