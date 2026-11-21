// Armado de BillingDeps para los tests: repos en memoria + dLocal falso.

import { MemoryAccountsRepo } from "@/lib/crm/accounts-repo";
import { MemoryBillingRepo } from "@/lib/billing/repo";
import type { BillingDeps } from "@/lib/billing/service";
import type { BillingSubscription, SignupData, SubscriptionPayment } from "@/lib/billing/types";
import { FakeDlocal } from "./dlocal-fake";

export const TEST_KEY = "a".repeat(64);

export function makeBilling(opts: { today?: string } = {}) {
  const repo = new MemoryBillingRepo();
  repo.prices = [
    { planKey: "basico", country: "AR", currency: "ARS", amount: 15000 },
    { planKey: "premium", country: "AR", currency: "ARS", amount: 30000 },
    { planKey: "plus", country: "AR", currency: "ARS", amount: 60000 },
    { planKey: "premium", country: "MX", currency: "MXN", amount: 400 },
  ];
  const accounts = new MemoryAccountsRepo();
  const dlocal = new FakeDlocal();
  const clock = { today: opts.today ?? "2026-11-20" };
  const log = {
    changed: [] as BillingSubscription[],
    approved: [] as SubscriptionPayment[],
    signups: [] as { signup: SignupData; inviteToken: string | null }[],
    alerts: [] as string[],
    access: [] as { accountId: number; enabled: boolean; reason: string | null }[],
    failed: [] as { orderId: string; nextRetryOn: string | null; redirectUrl: string | null }[],
    suspended: [] as number[],
    reactivated: [] as number[],
    ended: [] as number[],
  };
  const deps: BillingDeps = {
    repo,
    dlocal: dlocal.client(),
    accounts,
    plans: {
      async get(planKey) {
        const names: Record<string, string> = { basico: "Básico", premium: "Premium", plus: "Plus+" };
        return names[planKey] ? { planKey, name: names[planKey] } : null;
      },
    },
    async createAccount(signup) {
      const accountId = await accounts.create(signup.businessName);
      return { accountId, inviteToken: `invite-${accountId}` };
    },
    async setAccountAccess(accountId, enabled, reason) {
      log.access.push({ accountId, enabled, reason });
      await accounts.update(accountId, { status: enabled ? "active" : "suspended" });
    },
    appUrl: "https://digibotlatam.com",
    today: () => clock.today,
    hooks: {
      async subscriptionChanged(sub) {
        log.changed.push(sub);
      },
      async paymentApproved(_sub, payment) {
        log.approved.push(payment);
      },
      async signupCompleted(_sub, signup, inviteToken) {
        log.signups.push({ signup, inviteToken });
      },
      async alert(title) {
        log.alerts.push(title);
      },
      async paymentFailed(_sub, payment, info) {
        log.failed.push({ orderId: payment.orderId, nextRetryOn: info.nextRetryOn, redirectUrl: info.redirectUrl });
      },
      async subscriptionSuspended(sub) {
        log.suspended.push(sub.id);
      },
      async subscriptionReactivated(sub) {
        log.reactivated.push(sub.id);
      },
      async subscriptionEnded(sub) {
        log.ended.push(sub.id);
      },
    },
  };
  return { deps, repo, accounts, dlocal, clock, log };
}

export const HOLDER = {
  firstName: "Juan",
  lastName: "Pérez",
  documentType: "DNI",
  document: "30.123.456",
  email: "juan@example.com",
};
