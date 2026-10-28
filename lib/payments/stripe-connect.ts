import "server-only";

import { assertStripeMutationEnvironment, getSellerOnboardingStatus } from "@/lib/payments/stripe-connect-policy";
import { prisma } from "@/lib/prisma";

type StripeRequirements = {
  currently_due?: string[];
  past_due?: string[];
  disabled_reason?: string | null;
};

export type StripeConnectedAccount = {
  id: string;
  country?: string | null;
  default_currency?: string | null;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: StripeRequirements | null;
};

type StripeAccountLink = {
  url: string;
  expires_at?: number;
};

function stripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe seller onboarding is not configured.");
  if (process.env.NODE_ENV !== "production" && key.startsWith("sk_live_")) {
    throw new Error("Live Stripe Connect accounts cannot be created from local development. Use Stripe test credentials.");
  }
  return key;
}

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function stripeConnectRequest<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: URLSearchParams; idempotencyKey?: string; connectedAccountId?: string } = {},
) {
  if (options.method === "POST") {
    assertStripeMutationEnvironment({
      secretKey: process.env.STRIPE_SECRET_KEY,
      nodeEnv: process.env.NODE_ENV,
      allowLocalLiveMutations: process.env.STRIPE_ALLOW_LOCAL_LIVE_MUTATIONS,
    });
  }
  const headers: Record<string, string> = {
    authorization: `Bearer ${stripeSecretKey()}`,
  };
  if (options.body) headers["content-type"] = "application/x-www-form-urlencoded";
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
  if (options.connectedAccountId) headers["stripe-account"] = options.connectedAccountId;

  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body,
    cache: "no-store",
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as T & { error?: { message?: string } } : {} as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "Stripe could not complete seller onboarding.");
  return payload as T;
}

export async function persistSellerPaymentAccount(userId: string, account: StripeConnectedAccount) {
  const data = {
    provider: "STRIPE",
    providerAccountId: account.id,
    onboardingStatus: getSellerOnboardingStatus(account),
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    requirementsDue: account.requirements?.currently_due || [],
    requirementsPastDue: account.requirements?.past_due || [],
    disabledReason: account.requirements?.disabled_reason || null,
    country: account.country || null,
    defaultCurrency: account.default_currency || null,
    lastSyncedAt: new Date(),
  };

  return prisma.sellerPaymentAccount.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

export async function syncSellerPaymentAccount(account: StripeConnectedAccount) {
  const existing = await prisma.sellerPaymentAccount.findUnique({
    where: { providerAccountId: account.id },
    select: { userId: true },
  });
  if (!existing) return null;
  return persistSellerPaymentAccount(existing.userId, account);
}

export async function retrieveSellerPaymentAccount(userId: string) {
  const existing = await prisma.sellerPaymentAccount.findUnique({
    where: { userId },
    select: { providerAccountId: true },
  });
  if (!existing) return null;
  const account = await stripeConnectRequest<StripeConnectedAccount>(`/accounts/${encodeURIComponent(existing.providerAccountId)}`);
  return persistSellerPaymentAccount(userId, account);
}

async function createSellerStripeAccount(input: { userId: string; email: string }) {
  const body = new URLSearchParams();
  body.set("type", "standard");
  body.set("country", "US");
  body.set("email", input.email);
  body.set("capabilities[card_payments][requested]", "true");
  body.set("capabilities[transfers][requested]", "true");
  body.set("metadata[supercarDashUserId]", input.userId);

  return stripeConnectRequest<StripeConnectedAccount>("/accounts", {
    method: "POST",
    body,
    idempotencyKey: `seller-account-${input.userId}`,
  });
}

export async function getOrCreateSellerPaymentAccount(input: { userId: string; email: string }) {
  const existing = await prisma.sellerPaymentAccount.findUnique({
    where: { userId: input.userId },
  });
  if (existing) return existing;
  const account = await createSellerStripeAccount(input);
  return persistSellerPaymentAccount(input.userId, account);
}

export async function createSellerOnboardingLink(input: { userId: string; email: string }) {
  const account = await getOrCreateSellerPaymentAccount(input);
  const baseUrl = appBaseUrl();
  const body = new URLSearchParams();
  body.set("account", account.providerAccountId);
  body.set("type", "account_onboarding");
  body.set("refresh_url", `${baseUrl}/api/stripe/connect/refresh`);
  body.set("return_url", `${baseUrl}/api/stripe/connect/return`);

  return stripeConnectRequest<StripeAccountLink>("/account_links", { method: "POST", body });
}
