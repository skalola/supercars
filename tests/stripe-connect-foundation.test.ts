import assert from "node:assert/strict";
import test from "node:test";
import { assertStripeMutationEnvironment, getSellerOnboardingStatus, getStripeCredentialMode, isSellerPaymentReady } from "../lib/payments/stripe-connect-policy";

test("Stripe credential mode is detected without exposing credential contents", () => {
  assert.equal(getStripeCredentialMode("sk_test_example"), "test");
  assert.equal(getStripeCredentialMode("sk_live_example"), "live");
  assert.equal(getStripeCredentialMode(undefined), "missing");
});

test("local live Stripe mutations fail closed", () => {
  assert.equal(assertStripeMutationEnvironment({ secretKey: "sk_test_example", nodeEnv: "development", allowLocalLiveMutations: undefined }), "test");
  assert.equal(assertStripeMutationEnvironment({ secretKey: "sk_live_example", nodeEnv: "production", allowLocalLiveMutations: undefined }), "live");
  assert.throws(() => assertStripeMutationEnvironment({ secretKey: "sk_live_example", nodeEnv: "development", allowLocalLiveMutations: undefined }));
});

test("seller account is ready only when charges, payouts, and details are enabled", () => {
  assert.equal(getSellerOnboardingStatus({
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    requirements: { currently_due: [], past_due: [] },
  }), "READY");

  assert.equal(isSellerPaymentReady({
    onboardingStatus: "READY",
    chargesEnabled: true,
    payoutsEnabled: true,
  }), true);
});

test("seller account remains incomplete while Stripe still needs onboarding details", () => {
  assert.equal(getSellerOnboardingStatus({
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    requirements: { currently_due: ["individual.verification.document"], past_due: [] },
  }), "INCOMPLETE");
});

test("past-due requirements or a disabled reason restrict seller payments", () => {
  assert.equal(getSellerOnboardingStatus({
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: true,
    requirements: { currently_due: [], past_due: ["external_account"] },
  }), "RESTRICTED");

  assert.equal(isSellerPaymentReady({
    onboardingStatus: "RESTRICTED",
    chargesEnabled: true,
    payoutsEnabled: true,
  }), false);
});
