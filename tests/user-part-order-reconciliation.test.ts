import assert from "node:assert/strict";
import test from "node:test";
import { getUserPartReconciliationCutoffs, USER_PART_RECONCILIATION_LIMITS } from "../lib/parts/user-part-order-reconciliation-policy";

test("reconciliation cutoffs use a 48-hour fulfillment window and 24-hour retry window", () => {
  const now = new Date("2026-10-28T12:00:00.000Z");
  const cutoffs = getUserPartReconciliationCutoffs(now);
  assert.equal(cutoffs.fulfillmentDueBefore.toISOString(), "2026-10-26T12:00:00.000Z");
  assert.equal(cutoffs.reminderRetryBefore.toISOString(), "2026-10-27T12:00:00.000Z");
});

test("reconciliation batches are bounded for serverless execution", () => {
  assert.equal(USER_PART_RECONCILIATION_LIMITS.expiredCheckouts, 100);
  assert.equal(USER_PART_RECONCILIATION_LIMITS.reminders, 50);
});
