import assert from "node:assert/strict";
import test from "node:test";
import { resolveMailProvider, resolvePaymentProvider } from "../lib/operations/runtime-provider-policy";

test("local development retains explicit no-cost provider defaults", () => {
  assert.equal(resolvePaymentProvider(undefined, "development"), "ledger");
  assert.equal(resolvePaymentProvider("ledger", "test"), "ledger");
  assert.equal(resolveMailProvider(undefined, "development"), "log");
  assert.equal(resolveMailProvider("log", "test"), "log");
});

test("production payment processing fails closed outside Stripe", () => {
  assert.equal(resolvePaymentProvider("stripe", "production"), "stripe");
  assert.throws(() => resolvePaymentProvider(undefined, "production"), /requires PAYMENT_PROVIDER=stripe/);
  assert.throws(() => resolvePaymentProvider("ledger", "production"), /requires PAYMENT_PROVIDER=stripe/);
  assert.throws(() => resolvePaymentProvider("unknown", "production"), /requires PAYMENT_PROVIDER=stripe/);
});

test("production mail fails closed outside an explicit delivery provider", () => {
  assert.equal(resolveMailProvider("resend", "production"), "resend");
  assert.equal(resolveMailProvider("sendgrid", "production"), "sendgrid");
  assert.throws(() => resolveMailProvider(undefined, "production"), /explicit external MAIL_PROVIDER/);
  assert.throws(() => resolveMailProvider("log", "production"), /explicit external MAIL_PROVIDER/);
});
