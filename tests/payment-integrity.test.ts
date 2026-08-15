import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  buildServiceBookingCheckoutParams,
  getDealerPurchaseCheckoutKey,
  getServiceBookingCheckoutKey,
  verifyStripeWebhookSignature,
} from "../lib/payments/payment-service";
import {
  canReuseCheckoutSession,
  getCancellationSettlement,
  getPartnerDecisionStatus,
} from "../lib/payments/payment-policy";
import { getDealerPurchaseDepositCentsForPrice } from "../lib/pricing/dealer-purchase-fees";

test("dealer deposit uses the configured price tiers", () => {
  assert.equal(getDealerPurchaseDepositCentsForPrice(199_999), 300_000);
  assert.equal(getDealerPurchaseDepositCentsForPrice(200_000), 400_000);
  assert.equal(getDealerPurchaseDepositCentsForPrice(350_000), 700_000);
});

test("checkout keys are deterministic and purpose-scoped", () => {
  const serviceKey = getServiceBookingCheckoutKey("request-1", 10_000);
  assert.equal(serviceKey, getServiceBookingCheckoutKey("request-1", 10_000));
  assert.notEqual(serviceKey, getDealerPurchaseCheckoutKey("request-1", 10_000));
  assert.notEqual(serviceKey, getServiceBookingCheckoutKey("request-1", 20_000));
});

test("service booking Checkout authorizes funds for capture after shop acceptance", () => {
  const { body } = buildServiceBookingCheckoutParams({
    fulfillmentRequestId: "request-1",
    vehicleId: "vehicle-1",
    vin: "JH4DC54853C010269",
    ownerUserId: "user-1",
    publicTransactionToken: "transaction-token",
    amountCents: 10_000,
    currency: "USD",
  });

  assert.equal(body.get("mode"), "payment");
  assert.equal(body.get("payment_intent_data[capture_method]"), "manual");
  assert.equal(body.get("line_items[0][price_data][unit_amount]"), "10000");
  assert.equal(body.get("metadata[feeType]"), "SERVICE_BOOKING");
});

test("only active, unexpired checkout sessions are reusable", () => {
  const now = new Date("2026-08-14T12:00:00.000Z");
  assert.equal(
    canReuseCheckoutSession({
      checkoutUrl: "https://checkout.stripe.test/session",
      checkoutExpiresAt: new Date("2026-08-14T12:30:00.000Z"),
      status: "HELD",
      now,
    }),
    true
  );
  assert.equal(
    canReuseCheckoutSession({
      checkoutUrl: "https://checkout.stripe.test/session",
      checkoutExpiresAt: new Date("2026-08-14T11:59:59.000Z"),
      status: "HELD",
      now,
    }),
    false
  );
});

test("partner decisions confirm an authorized service booking and preserve unpaid fallback", () => {
  assert.equal(getPartnerDecisionStatus("SERVICE_BOOKING", "ACCEPTED"), "ACCEPTED_AWAITING_PAYMENT");
  assert.equal(getPartnerDecisionStatus("SERVICE_BOOKING", "ACCEPTED", "AUTHORIZED"), "CONFIRMED");
  assert.equal(getPartnerDecisionStatus("SERVICE_BOOKING", "ACCEPTED", "PAID"), "CONFIRMED");
  assert.equal(getPartnerDecisionStatus("DEALER_PURCHASE", "ACCEPTED"), "ACCEPTED");
  assert.equal(getPartnerDecisionStatus("DEALER_PURCHASE", "DECLINED"), "DECLINED");
});

test("cancellation settlement never refunds a negative amount", () => {
  assert.deepEqual(getCancellationSettlement(250, 100), { policyFee: 100, refundAmount: 150 });
  assert.deepEqual(getCancellationSettlement(50, 100), { policyFee: 50, refundAmount: 0 });
  assert.deepEqual(getCancellationSettlement(-20, 100), { policyFee: 0, refundAmount: 0 });
});

test("Stripe signatures require a current timestamp and matching digest", () => {
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const previousProvider = process.env.PAYMENT_PROVIDER;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.PAYMENT_PROVIDER = "stripe";

  try {
    const payload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = crypto
      .createHmac("sha256", "whsec_test")
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    assert.equal(verifyStripeWebhookSignature(payload, `t=${timestamp},v1=${digest}`), true);
    assert.equal(verifyStripeWebhookSignature(`${payload}x`, `t=${timestamp},v1=${digest}`), false);
    assert.equal(verifyStripeWebhookSignature(payload, `t=${timestamp - 600},v1=${digest}`), false);
  } finally {
    process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
    process.env.PAYMENT_PROVIDER = previousProvider;
  }
});
