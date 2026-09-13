export const WHATSAPP_PHONE = "5492612771419";

export function waLink(message: string) {
  return `https://api.whatsapp.com/send?phone=${WHATSAPP_PHONE}&text=${encodeURIComponent(message)}`;
}

export const WA_LINKS = {
  general: waLink("Hola! Visité DigiBot y estoy interesado en tener mi bot"),
  basico: waLink("Hola! Visité DigiBot y estoy interesado en el plan Básico"),
  premium: waLink("Hola! Visité DigiBot y estoy interesado en el plan Premium"),
  plus: waLink("Hola! Visité DigiBot y estoy interesado en el plan Plus+"),
  ventas: waLink("Hola! Visité DigiBot y quisiera conocer más sobre sus planes"),
  cita: waLink("Hola! Visité DigiBot y quisiera agendar una cita"),
};
