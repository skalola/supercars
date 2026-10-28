import assert from "node:assert/strict";
import test from "node:test";
import {
  getUserPartShippingRestriction,
  isCurrentSellerAttestation,
  USER_PART_SELLER_POLICY_VERSION,
} from "../lib/parts/user-part-compliance-policy";

test("shipping-sensitive taxonomy requires local pickup", () => {
  for (const input of [
    { categoryName: "Safety", componentName: "Airbag module" },
    { categoryName: "Electrical", componentName: "Battery" },
    { categoryName: "Fluids", componentName: "Engine oil" },
    { categoryName: "Fuel", componentName: "Fuel cell" },
  ]) {
    assert.equal(getUserPartShippingRestriction(input), "LOCAL_PICKUP_ONLY");
  }
});

test("ordinary hard parts retain the standard delivery flow", () => {
  assert.equal(
    getUserPartShippingRestriction({ categoryName: "Air Induction", componentName: "Cold air intake" }),
    "STANDARD",
  );
  assert.equal(
    getUserPartShippingRestriction({ categoryName: "Brakes", componentName: "Brake caliper" }),
    "STANDARD",
  );
});

test("seller attestations must use the current policy version", () => {
  const sellerAttestedAt = new Date();
  assert.equal(isCurrentSellerAttestation({ sellerAttestedAt, sellerPolicyVersion: USER_PART_SELLER_POLICY_VERSION }), true);
  assert.equal(isCurrentSellerAttestation({ sellerAttestedAt, sellerPolicyVersion: "old-policy" }), false);
  assert.equal(isCurrentSellerAttestation({ sellerAttestedAt: null, sellerPolicyVersion: USER_PART_SELLER_POLICY_VERSION }), false);
});
