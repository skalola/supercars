import { getStripeCredentialMode } from "../lib/payments/stripe-connect-policy";
import { getUserPartPlatformFeeCents } from "../lib/payments/user-part-payment-policy";
import { canBuyerCompleteUserPartOrder, canSellerFulfillUserPartOrder, canSellerRefundUserPartOrder } from "../lib/payments/user-part-order-policy";

const credentialMode = getStripeCredentialMode(process.env.STRIPE_SECRET_KEY);
const paymentProviderReady = process.env.PAYMENT_PROVIDER === "stripe";
const webhookReady = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
const connectWebhookReady = Boolean(process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim());
const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
const productionUrlReady = /^https:\/\//.test(appUrl);
const fee = getUserPartPlatformFeeCents(10_000);
const lifecycleReady = canSellerFulfillUserPartOrder("PAID")
  && canSellerRefundUserPartOrder("PAID")
  && canSellerRefundUserPartOrder("FULFILLED")
  && canBuyerCompleteUserPartOrder("FULFILLED")
  && !canSellerRefundUserPartOrder("COMPLETED");

const checks = [
  ["Payment provider", paymentProviderReady, process.env.PAYMENT_PROVIDER || "unset"],
  ["Stripe credential mode", credentialMode === "test" || credentialMode === "live", credentialMode],
  ["Webhook signing secret", webhookReady, webhookReady ? "configured" : "missing"],
  ["Connect webhook signing secret", connectWebhookReady, connectWebhookReady ? "configured" : "missing"],
  ["Production application URL", productionUrlReady, productionUrlReady ? "configured" : "missing or local"],
  ["Five-percent fee policy", fee === 500, `$${(fee / 100).toFixed(2)} on $100.00`],
  ["Order lifecycle policy", lifecycleReady, lifecycleReady ? "valid" : "invalid"],
] as const;

console.log("SUPERCAR DASH user-part commerce readiness (zero-write verification)");
for (const [label, passed, detail] of checks) console.log(`${passed ? "PASS" : "BLOCKED"}  ${label}: ${detail}`);
console.log("Required connected-account webhook events:");
for (const event of [
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
  "account.updated",
]) console.log(`- ${event}`);
console.log("No Stripe request was sent and no database record was written.");
if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
