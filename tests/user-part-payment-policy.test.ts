import assert from "node:assert/strict";
import test from "node:test";
import {
  getUserPartCheckoutKey,
  getUserPartPlatformFeeCents,
  isReusableUserPartCheckout,
} from "../lib/payments/user-part-payment-policy";

test("user part sales retain exactly five percent of item price", () => {
  assert.equal(getUserPartPlatformFeeCents(10_000), 500);
  assert.equal(getUserPartPlatformFeeCents(27_500), 1_375);
  assert.throws(() => getUserPartPlatformFeeCents(0));
});

test("user part checkout identity is deterministic and order scoped", () => {
  assert.equal(getUserPartCheckoutKey("order-1", 30_000), getUserPartCheckoutKey("order-1", 30_000));
  assert.notEqual(getUserPartCheckoutKey("order-1", 30_000), getUserPartCheckoutKey("order-2", 30_000));
});

test("only unexpired pending part checkout sessions are reusable", () => {
  assert.equal(isReusableUserPartCheckout({ status: "CHECKOUT_PENDING", checkoutUrl: "https://checkout.example", checkoutExpiresAt: new Date(Date.now() + 300_000) }), true);
  assert.equal(isReusableUserPartCheckout({ status: "PAID", checkoutUrl: "https://checkout.example", checkoutExpiresAt: new Date(Date.now() + 300_000) }), false);
  assert.equal(isReusableUserPartCheckout({ status: "CHECKOUT_PENDING", checkoutUrl: null, checkoutExpiresAt: new Date(Date.now() + 300_000) }), false);
});
