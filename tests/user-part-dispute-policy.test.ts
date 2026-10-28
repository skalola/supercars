import assert from "node:assert/strict";
import test from "node:test";
import {
  getUserPartDisputeOrderStatus,
  isTerminalUserPartDisputeStatus,
  isUserPartDisputeEvent,
} from "../lib/parts/user-part-dispute-policy";

test("user-part dispute events are recognized without treating unrelated charges as orders", () => {
  assert.equal(isUserPartDisputeEvent("charge.dispute.created"), true);
  assert.equal(isUserPartDisputeEvent("charge.refunded"), false);
});

test("open disputes lock an order and won disputes restore its prior state", () => {
  assert.equal(getUserPartDisputeOrderStatus({ eventType: "charge.dispute.created", disputeStatus: "needs_response", previousOrderStatus: "FULFILLED" }), "DISPUTED");
  assert.equal(getUserPartDisputeOrderStatus({ eventType: "charge.dispute.closed", disputeStatus: "won", previousOrderStatus: "FULFILLED" }), "FULFILLED");
});

test("lost disputes become chargebacks and terminal states are explicit", () => {
  assert.equal(getUserPartDisputeOrderStatus({ eventType: "charge.dispute.closed", disputeStatus: "lost", previousOrderStatus: "PAID" }), "CHARGEBACK");
  assert.equal(isTerminalUserPartDisputeStatus("lost"), true);
  assert.equal(isTerminalUserPartDisputeStatus("under_review"), false);
});
