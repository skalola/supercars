import assert from "node:assert/strict";
import test from "node:test";
import {
  checkoutRequestSchema,
  partnerDecisionSubmissionSchema,
  vinClaimSchema,
} from "../lib/validation/transaction-inputs";

test("checkout payloads require UUID request ids and local return paths", () => {
  const valid = checkoutRequestSchema.parse({
    fulfillmentRequestId: "9975cdb9-b04d-4606-8a37-d10af5954f48",
    returnTo: "/transactions/9975cdb9-b04d-4606-8a37-d10af5954f48",
  });
  assert.equal(valid.returnTo, "/transactions/9975cdb9-b04d-4606-8a37-d10af5954f48");

  const external = checkoutRequestSchema.parse({
    fulfillmentRequestId: "9975cdb9-b04d-4606-8a37-d10af5954f48",
    returnTo: "https://example.com/phishing",
  });
  assert.equal(external.returnTo, "/transactions");
  assert.equal(checkoutRequestSchema.safeParse({ fulfillmentRequestId: "not-an-id" }).success, false);
});

test("VIN claim validation normalizes valid VINs and rejects forbidden characters", () => {
  assert.equal(vinClaimSchema.parse(" zff67nfa1b0177323 "), "ZFF67NFA1B0177323");
  assert.equal(vinClaimSchema.safeParse("ZFF67NFA1B01773I3").success, false);
});

test("partner decision notes are bounded", () => {
  assert.equal(partnerDecisionSubmissionSchema.parse({ note: "  Accepted  " }).note, "Accepted");
  assert.equal(partnerDecisionSubmissionSchema.safeParse({ note: "x".repeat(1_001) }).success, false);
});
