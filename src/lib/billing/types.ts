// Modelo del cobro recurrente. Sin imports de servidor.

export type BillingStatus = "incomplete" | "active" | "past_due" | "suspended" | "cancelled";
export type PaymentKind = "initial" | "renewal" | "upgrade" | "card_update";
export type PaymentStatus = "created" | "pending" | "paid" | "rejected" | "cancelled" | "expired" | "unknown";

export interface SignupData {
  businessName: string;
  name: string;
  email: string;
}

export interface BillingSubscription {
  id: number;
  accountId: number | null;
  planKey: string;
  country: string;
  currency: string;
  amount: number;
  status: BillingStatus;
  anchorDay: number | null;
  periodStart: string | null; // YYYY-MM-DD
  periodEnd: string | null;
  nextChargeOn: string | null;
  cardTokenEnc: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  failedAttempts: number;
  pastDueSince: string | null;
  cancelAtPeriodEnd: boolean;
  suspendedAt: number | null; // unix
  cancelledAt: number | null; // unix
  pendingPlanKey: string | null;
  pendingAmount: number | null;
  signup: SignupData | null;
  signupInviteEnc: string | null;
  signupInviteExpiresAt: number | null; // unix
  createdAt: number; // unix
}

export interface SubscriptionPayment {
  id: number;
  subscriptionId: number;
  orderId: string;
  kind: PaymentKind;
  publicRef: string;
  dlocalPaymentId: string | null;
  checkoutTokenEnc: string | null;
  planKey: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  rejectedReason: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  raw: unknown;
  paidAt: number | null; // unix
  invoiceRef: string | null;
  createdAt: number; // unix
}

export interface BillingSettings {
  retryDays: number[];
  graceDays: number;
  trialDays: number;
  priceChangeNoticeDays: number;
  superadminWhatsapp: string[];
  failedPaymentTemplate: string | null;
}

export const DEFAULT_SETTINGS: BillingSettings = {
  retryDays: [1, 3, 5],
  graceDays: 7,
  trialDays: 0,
  priceChangeNoticeDays: 60,
  superadminWhatsapp: [],
  failedPaymentTemplate: null,
};

export interface PlanPrice {
  planKey: string;
  country: string;
  currency: string;
  amount: number;
}

export interface BillingEvent {
  type: "PaymentApproved";
  subscriptionId: number;
  paymentId: number;
  payload: Record<string, unknown>;
}

export type NewSubscription = Pick<BillingSubscription, "accountId" | "planKey" | "country" | "currency" | "amount" | "signup">;
export type NewPayment = Pick<
  SubscriptionPayment,
  "subscriptionId" | "orderId" | "kind" | "publicRef" | "planKey" | "amount" | "currency" | "periodStart" | "periodEnd"
>;
export type SubscriptionPatch = Partial<Omit<BillingSubscription, "id" | "createdAt">>;
export type PaymentPatch = Partial<Pick<SubscriptionPayment, "dlocalPaymentId" | "checkoutTokenEnc" | "status" | "rejectedReason" | "cardBrand" | "cardLast4" | "periodStart" | "periodEnd" | "raw" | "paidAt" | "invoiceRef">>;
