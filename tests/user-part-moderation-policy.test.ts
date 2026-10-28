import assert from "node:assert/strict";
import test from "node:test";
import { canModerateUserPartListing, getModeratedListingStatus, normalizeModerationReason } from "../lib/parts/user-part-moderation-policy";

test("moderation cannot mutate reserved, sold, or removed listings", () => {
  for (const status of ["RESERVED", "SOLD", "REMOVED"]) {
    assert.equal(canModerateUserPartListing(status, "HIDE"), false);
    assert.equal(canModerateUserPartListing(status, "REMOVE"), false);
  }
});

test("hide and remove have conservative status transitions", () => {
  assert.equal(canModerateUserPartListing("ACTIVE", "HIDE"), true);
  assert.equal(canModerateUserPartListing("INACTIVE", "HIDE"), false);
  assert.equal(canModerateUserPartListing("INACTIVE", "REMOVE"), true);
  assert.equal(getModeratedListingStatus("HIDE"), "INACTIVE");
  assert.equal(getModeratedListingStatus("REMOVE"), "REMOVED");
});

test("moderation reasons are normalized and bounded", () => {
  assert.equal(normalizeModerationReason("  unsafe   product claim "), "unsafe product claim");
  assert.throws(() => normalizeModerationReason("bad"));
});
