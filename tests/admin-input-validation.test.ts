import assert from "node:assert/strict";
import test from "node:test";
import {
  addVendorInputSchema,
  adminFulfillmentCancelSchema,
  adminMeetStatusInputSchema,
  adminRecordIdSchema,
  marketingSettingInputSchema,
  resolvePartnerEmailInputSchema,
} from "../lib/validation/admin-inputs";

const requestId = "9975cdb9-b04d-4606-8a37-d10af5954f48";

test("admin record ids reject empty and query-shaped input", () => {
  assert.equal(adminRecordIdSchema.parse("  cm123_test-id  "), "cm123_test-id");
  assert.equal(adminRecordIdSchema.safeParse("").success, false);
  assert.equal(adminRecordIdSchema.safeParse("id?include=everything").success, false);
});

test("admin fulfillment cancellation requires a UUID and bounded reason", () => {
  assert.deepEqual(adminFulfillmentCancelSchema.parse({ requestId, reason: "  Customer request  " }), {
    requestId,
    reason: "Customer request",
  });
  assert.equal(adminFulfillmentCancelSchema.safeParse({ requestId, reason: "" }).success, false);
  assert.equal(
    adminFulfillmentCancelSchema.safeParse({ requestId, reason: "x".repeat(1_001) }).success,
    false
  );
});

test("meet status and marketing toggles enforce runtime enums and booleans", () => {
  assert.equal(adminMeetStatusInputSchema.safeParse({ meetId: "meet_1", status: "PUBLISHED" }).success, true);
  assert.equal(adminMeetStatusInputSchema.safeParse({ meetId: "meet_1", status: "DELETED" }).success, false);
  assert.equal(marketingSettingInputSchema.safeParse({ key: "WELCOME_EMAILS", enabled: true }).success, true);
  assert.equal(marketingSettingInputSchema.safeParse({ key: "WELCOME_EMAILS", enabled: "true" }).success, false);
});

test("vendor inputs normalize contacts and reject unsafe contact data", () => {
  const vendor = addVendorInputSchema.parse({
    name: "  Ferrari Miami  ",
    type: "DEALER",
    email: " SALES@FERRARIMIAMI.COM ",
    website: "https://ferrarimiami.com",
  });
  assert.equal(vendor.name, "Ferrari Miami");
  assert.equal(vendor.email, "sales@ferrarimiami.com");
  assert.equal(vendor.makeSpecialization, "ALL");

  assert.equal(addVendorInputSchema.safeParse({ name: "No Contact", type: "DEALER" }).success, false);
  assert.equal(
    addVendorInputSchema.safeParse({ name: "Bad URL", type: "DEALER", website: "javascript:alert(1)" }).success,
    false
  );
});

test("partner email resolution validates every enum and email", () => {
  const input = {
    partnerContactId: "partner_1",
    newEmail: "sales@exampledealer.com",
    confidence: "MANUAL_REVIEW",
    source: "MANUALLY_VERIFIED",
  } as const;
  assert.equal(resolvePartnerEmailInputSchema.safeParse(input).success, true);
  assert.equal(resolvePartnerEmailInputSchema.safeParse({ ...input, newEmail: "not-an-email" }).success, false);
  assert.equal(resolvePartnerEmailInputSchema.safeParse({ ...input, source: "SCRAPED_UNKNOWN" }).success, false);
});
