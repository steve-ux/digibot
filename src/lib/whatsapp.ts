export const WHATSAPP_PHONE = "5492612771419";

export function waLink(message: string) {
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}

export const WA_LINKS = {
  general: waLink("Hola! Visité DigiBot y estoy interesado en tener mi bot"),
  chatIa: waLink("Hola! Quiero chatear con la IA"),
  basico: waLink("Hola! Quiero información sobre el Plan Básico"),
  premium: waLink("Hola! Quiero información sobre el Plan Premium"),
  plus: waLink("Hola! Quiero información sobre el Plan Plus"),
  ventas: waLink("Hola! Visité DigiBot y quisiera conocer más sobre sus planes"),
  cita: waLink("Hola! Me gustaría agendar una cita"),
  footer: waLink("Hola! Los contacto desde el pie de página"),
};
