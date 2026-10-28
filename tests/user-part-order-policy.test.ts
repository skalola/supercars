import assert from "node:assert/strict";
import test from "node:test";
import {
  canBuyerCompleteUserPartOrder,
  canSellerFulfillUserPartOrder,
  canSellerRefundUserPartOrder,
  normalizeTrackingUrl,
} from "../lib/payments/user-part-order-policy";

test("only paid orders can enter seller fulfillment", () => {
  assert.equal(canSellerFulfillUserPartOrder("PAID"), true);
  assert.equal(canSellerFulfillUserPartOrder("CHECKOUT_PENDING"), false);
  assert.equal(canSellerFulfillUserPartOrder("FULFILLED"), false);
});

test("buyers complete only fulfilled orders", () => {
  assert.equal(canBuyerCompleteUserPartOrder("FULFILLED"), true);
  assert.equal(canBuyerCompleteUserPartOrder("PAID"), false);
  assert.equal(canBuyerCompleteUserPartOrder("REFUNDED"), false);
});

test("refund eligibility ends after completion or a prior refund", () => {
  assert.equal(canSellerRefundUserPartOrder("PAID"), true);
  assert.equal(canSellerRefundUserPartOrder("FULFILLED"), true);
  assert.equal(canSellerRefundUserPartOrder("COMPLETED"), false);
  assert.equal(canSellerRefundUserPartOrder("REFUND_PENDING"), false);
  assert.equal(canSellerRefundUserPartOrder("REFUNDED"), false);
});

test("tracking links accept only web URLs", () => {
  assert.equal(normalizeTrackingUrl(""), null);
  assert.equal(normalizeTrackingUrl("https://example.com/track?id=1"), "https://example.com/track?id=1");
  assert.throws(() => normalizeTrackingUrl("javascript:alert(1)"));
});
