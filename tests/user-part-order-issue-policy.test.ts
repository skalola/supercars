import assert from "node:assert/strict";
import test from "node:test";
import { canReportUserPartOrderIssue, normalizeOrderIssueAdminNote, normalizeOrderIssueDescription } from "../lib/parts/user-part-order-issue-policy";

test("issues can be reported only for financially confirmed orders", () => {
  assert.equal(canReportUserPartOrderIssue("PAID"), true);
  assert.equal(canReportUserPartOrderIssue("FULFILLED"), true);
  assert.equal(canReportUserPartOrderIssue("COMPLETED"), true);
  assert.equal(canReportUserPartOrderIssue("CHECKOUT_PENDING"), false);
  assert.equal(canReportUserPartOrderIssue("REFUNDED"), false);
});

test("issue descriptions and admin notes are normalized and bounded", () => {
  assert.equal(normalizeOrderIssueDescription("  Package arrived with a cracked housing and missing hardware.  "), "Package arrived with a cracked housing and missing hardware.");
  assert.throws(() => normalizeOrderIssueDescription("Too short"));
  assert.equal(normalizeOrderIssueAdminNote("  Contacted both parties.  "), "Contacted both parties.");
  assert.throws(() => normalizeOrderIssueAdminNote("no"));
});
