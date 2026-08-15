export type RuntimePaymentProvider = "ledger" | "stripe";
export type RuntimeMailProvider = "log" | "resend" | "sendgrid" | "postmark";

export function resolvePaymentProvider(
  configured: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): RuntimePaymentProvider {
  const provider = configured?.trim().toLowerCase();
  if (provider === "stripe") return "stripe";
  if (provider === "ledger" && nodeEnv !== "production") return "ledger";
  if (!provider && nodeEnv !== "production") return "ledger";
  throw new Error("Production payment processing requires PAYMENT_PROVIDER=stripe.");
}

export function resolveMailProvider(
  configured: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): RuntimeMailProvider {
  const provider = configured?.trim().toLowerCase();
  if (provider === "resend" || provider === "sendgrid" || provider === "postmark") return provider;
  if (provider === "log" && nodeEnv !== "production") return "log";
  if (!provider && nodeEnv !== "production") return "log";
  throw new Error("Production email delivery requires an explicit external MAIL_PROVIDER.");
}
