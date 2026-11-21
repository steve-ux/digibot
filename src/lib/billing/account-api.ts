// Helpers de las APIs de Configuración → Suscripción. Server-only.

import { getPlans } from "../pricing-plans";
import { todayIn } from "./config";
import { buildOverview, type BillingOverview } from "./overview";
import { getMySqlBillingRepo } from "./repo-mysql";

export async function accountBillingOverview(accountId: number): Promise<BillingOverview> {
  const plans = (await getPlans()).map((p) => ({ planKey: p.planKey, name: p.name, tagline: p.tagline, features: p.features }));
  return buildOverview(getMySqlBillingRepo(), accountId, plans, todayIn());
}
