export type StripeConnectedAccountState = {
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: {
    currently_due?: string[];
    past_due?: string[];
    disabled_reason?: string | null;
  } | null;
};

export function getSellerOnboardingStatus(account: StripeConnectedAccountState) {
  const due = account.requirements?.currently_due || [];
  const pastDue = account.requirements?.past_due || [];
  if (account.requirements?.disabled_reason || pastDue.length > 0) return "RESTRICTED";
  if (account.charges_enabled && account.payouts_enabled && account.details_submitted && due.length === 0) {
    return "READY";
  }
  return account.details_submitted ? "PENDING" : "INCOMPLETE";
}

export function isSellerPaymentReady(account: {
  onboardingStatus: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}) {
  return account.onboardingStatus === "READY" && account.chargesEnabled && account.payoutsEnabled;
}

export function getStripeCredentialMode(secretKey: string | undefined) {
  const key = secretKey?.trim() || "";
  if (key.startsWith("sk_test_")) return "test" as const;
  if (key.startsWith("sk_live_")) return "live" as const;
  return key ? "unknown" as const : "missing" as const;
}

export function assertStripeMutationEnvironment(input: {
  secretKey: string | undefined;
  nodeEnv: string | undefined;
  allowLocalLiveMutations: string | undefined;
}) {
  const mode = getStripeCredentialMode(input.secretKey);
  if (mode === "missing") throw new Error("Stripe is not configured.");
  if (mode === "unknown") throw new Error("Stripe credentials use an unrecognized format.");
  if (mode === "live" && input.nodeEnv !== "production" && input.allowLocalLiveMutations !== "true") {
    throw new Error("Live Stripe mutations are blocked outside production. Use Stripe test credentials for local validation.");
  }
  return mode;
}
