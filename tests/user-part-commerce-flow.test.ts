import assert from "node:assert/strict";
import test from "node:test";

import { getUserPartDisputeOrderStatus } from "../lib/parts/user-part-dispute-policy";
import { buildUserPartCheckoutContract } from "../lib/payments/user-part-checkout-contract";
import { canBuyerCompleteUserPartOrder, canSellerFulfillUserPartOrder, canSellerRefundUserPartOrder } from "../lib/payments/user-part-order-policy";
import { getUserPartPlatformFeeCents } from "../lib/payments/user-part-payment-policy";

test("user-part commerce contract covers checkout, fee, fulfillment, refund, and disputes without a Stripe request", () => {
  const itemAmountCents = 40_000;
  const shippingAmountCents = 2_500;
  const platformFeeCents = getUserPartPlatformFeeCents(itemAmountCents);
  const contract = buildUserPartCheckoutContract({
    orderId: "order-e2e",
    listingTitle: "Performance intake",
    itemAmountCents,
    shippingAmountCents,
    platformFeeCents,
    totalAmountCents: itemAmountCents + shippingAmountCents,
    buyerId: "buyer-e2e",
    buyerEmail: "buyer@example.com",
    sellerId: "seller-e2e",
    listingId: "listing-e2e",
    collectShippingAddress: true,
    baseUrl: "https://supercardash.com/",
  });

  assert.equal(platformFeeCents, 2_000);
  assert.equal(contract.body.get("payment_intent_data[application_fee_amount]"), "2000");
  assert.equal(contract.body.get("line_items[0][price_data][unit_amount]"), "40000");
  assert.equal(contract.body.get("line_items[1][price_data][unit_amount]"), "2500");
  assert.equal(contract.body.get("metadata[commerceType]"), "USER_PART_SALE");
  assert.equal(contract.body.get("payment_intent_data[metadata][userPartOrderId]"), "order-e2e");
  assert.equal(contract.body.get("shipping_address_collection[allowed_countries][0]"), "US");
  assert.match(contract.idempotencyKey, /^scd:user-part:order-e2e:42500:/);

  assert.equal(canSellerFulfillUserPartOrder("CHECKOUT_PENDING"), false);
  assert.equal(canSellerFulfillUserPartOrder("PAID"), true);
  assert.equal(canBuyerCompleteUserPartOrder("FULFILLED"), true);
  assert.equal(canSellerRefundUserPartOrder("PAID"), true);
  assert.equal(canSellerRefundUserPartOrder("COMPLETED"), false);
  assert.equal(getUserPartDisputeOrderStatus({ eventType: "charge.dispute.created", disputeStatus: "needs_response", previousOrderStatus: "FULFILLED" }), "DISPUTED");
  assert.equal(getUserPartDisputeOrderStatus({ eventType: "charge.dispute.closed", disputeStatus: "won", previousOrderStatus: "FULFILLED" }), "FULFILLED");
  assert.equal(getUserPartDisputeOrderStatus({ eventType: "charge.dispute.closed", disputeStatus: "lost", previousOrderStatus: "PAID" }), "CHARGEBACK");
});

test("checkout contract rejects mismatched totals before Stripe is called", () => {
  assert.throws(() => buildUserPartCheckoutContract({
    orderId: "order-invalid",
    listingTitle: "Invalid total",
    itemAmountCents: 10_000,
    shippingAmountCents: 1_000,
    platformFeeCents: 500,
    totalAmountCents: 10_000,
    buyerId: "buyer",
    buyerEmail: null,
    sellerId: "seller",
    listingId: "listing",
    collectShippingAddress: false,
    baseUrl: "https://supercardash.com",
  }), /total must equal/i);
});
