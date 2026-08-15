import assert from "node:assert/strict";
import test from "node:test";
import {
  addPartBrandInputSchema,
  addPerformancePartInputSchema,
  updateAffiliatePartnerInputSchema,
  updatePerformancePartAffiliateInputSchema,
} from "../lib/validation/admin-parts-inputs";

test("part brands normalize web domains and reject unsafe URL schemes", () => {
  const parsed = addPartBrandInputSchema.parse({ name: "Injen", websiteUrl: "injen.com", country: "US" });
  assert.equal(parsed.websiteUrl, "https://injen.com");
  assert.equal(
    addPartBrandInputSchema.safeParse({ name: "Unsafe", websiteUrl: "javascript:alert(1)" }).success,
    false
  );
});

test("performance parts enforce bounded prices, gains, and compatible year ranges", () => {
  const base = { name: "Cold Air Intake", categoryId: "category_1", brandId: "brand_1" };
  assert.equal(addPerformancePartInputSchema.safeParse({ ...base, retailPrice: 499.99 }).success, true);
  assert.equal(addPerformancePartInputSchema.safeParse({ ...base, retailPrice: -1 }).success, false);
  assert.equal(addPerformancePartInputSchema.safeParse({ ...base, estimatedHpGain: Infinity }).success, false);
  assert.equal(
    addPerformancePartInputSchema.safeParse({ ...base, yearStart: 2025, yearEnd: 2020 }).success,
    false
  );
});

test("affiliate configuration requires supported runtime statuses and basis points", () => {
  assert.equal(
    updatePerformancePartAffiliateInputSchema.safeParse({
      partId: "part_1",
      affiliatePartnerId: "partner_1",
      affiliateUrl: "https://retailer.example/part",
      trackingStatus: "CONFIGURED",
      commissionRateBps: 750,
    }).success,
    true
  );
  assert.equal(
    updatePerformancePartAffiliateInputSchema.safeParse({
      partId: "part_1",
      trackingStatus: "ENABLED",
      commissionRateBps: 20_000,
    }).success,
    false
  );
  assert.equal(
    updateAffiliatePartnerInputSchema.safeParse({ partnerId: "partner_1", status: "ACTIVE", active: "yes" }).success,
    false
  );
});
