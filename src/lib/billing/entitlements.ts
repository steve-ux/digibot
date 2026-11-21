// Qué habilita cada plan. Sin imports de servidor: lo usan las APIs y la UI.
//
// Por ahora vale lo que dice la landing (se ajusta cuando comercial lo defina):
//   Básico  -> WhatsApp, hasta 1.000 mensajes/mes
//   Premium -> Universo META (WhatsApp, Instagram, Facebook, Threads), hasta 5.000 mensajes/mes
//   Plus+   -> todo Meta + YouTube, Telegram y TikTok, mensajes ilimitados, Google Sheets
//
// Una cuenta SIN suscripción de dLocal Go (cuentas cargadas a mano, la interna de
// DigiBot) no tiene límites: así no se le corta nada a quien ya usa el panel.

export type Provider = "whatsapp" | "instagram" | "facebook" | "threads" | "youtube" | "telegram" | "tiktok";

export interface PlanEntitlements {
  providers: Provider[];
  // null = ilimitados (lo controla el bot en n8n; el panel solo lo informa)
  monthlyMessages: number | null;
  googleSheets: boolean;
}

const META: Provider[] = ["whatsapp", "instagram", "facebook", "threads"];

export const PLAN_ENTITLEMENTS: Record<string, PlanEntitlements> = {
  basico: { providers: ["whatsapp"], monthlyMessages: 1000, googleSheets: false },
  premium: { providers: META, monthlyMessages: 5000, googleSheets: false },
  plus: { providers: [...META, "youtube", "telegram", "tiktok"], monthlyMessages: null, googleSheets: true },
};

// El plan más barato que incluye ese canal (para el "Disponible desde el plan …").
const PLAN_ORDER = ["basico", "premium", "plus"];
const PLAN_NAMES: Record<string, string> = { basico: "Básico", premium: "Premium", plus: "Plus+" };

export function entitlementsFor(planKey: string | null): PlanEntitlements | null {
  if (planKey === null) return null; // sin suscripción: sin límites
  return PLAN_ENTITLEMENTS[planKey] ?? null;
}

export function providerAllowed(planKey: string | null, provider: Provider) {
  const e = entitlementsFor(planKey);
  return e === null || e.providers.includes(provider);
}

export function minimumPlanFor(provider: Provider) {
  const key = PLAN_ORDER.find((k) => PLAN_ENTITLEMENTS[k].providers.includes(provider));
  return key ? { planKey: key, name: PLAN_NAMES[key] } : null;
}

// Mensaje para un canal que el plan no incluye (null = permitido).
export function providerLockReason(planKey: string | null, provider: Provider): string | null {
  if (providerAllowed(planKey, provider)) return null;
  const min = minimumPlanFor(provider);
  return min ? `Disponible desde el plan ${min.name}.` : "No está incluido en tu plan.";
}

// Lo que se pierde al bajar de plan (para avisarlo antes de confirmar la baja).
export function featuresLost(fromFeatures: string[], toFeatures: string[]) {
  const keep = new Set(toFeatures.map((f) => f.trim().toLowerCase()));
  return fromFeatures.filter((f) => !keep.has(f.trim().toLowerCase()));
}
