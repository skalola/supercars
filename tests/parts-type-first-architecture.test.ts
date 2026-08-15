import assert from "node:assert/strict";
import test from "node:test";
import { MARKETPLACE_CAN_CREATE_CANONICAL_PARTS } from "../lib/parts/ferrari-product-normalizer";
import { rankPartOffers } from "../lib/parts/offer-ranking";
import { getUniversalPartComponentGroup } from "../lib/parts/part-type-hierarchy";

test("universal hierarchy projects systems into components and leaf part types", () => {
  assert.deepEqual(getUniversalPartComponentGroup("brakes", "Front Brake Pads"), { name: "Brake Pads", slug: "brake-pads" });
  assert.deepEqual(getUniversalPartComponentGroup("brakes", "Rear Brake Rotors"), { name: "Brake Rotors", slug: "brake-rotors" });
  assert.deepEqual(getUniversalPartComponentGroup("air-induction", "Engine Air Filter"), { name: "Air Filters", slug: "air-filters" });
});

test("marketplace offers cannot create permanent canonical products", () => {
  assert.equal(MARKETPLACE_CAN_CREATE_CANONICAL_PARTS, false);
});

test("offer tiers use identity, preferred brand, fitment, seller quality, and not price alone", () => {
  const ranked = rankPartOffers({
    offers: [
      offer("oem", { oemMatchType: "EXACT", genuineOemStatus: "VERIFIED", confidenceScore: 90, priceCents: 400_000 }),
      offer("oem-number-only", { oemMatchType: "EXACT", confidenceScore: 90, priceCents: 350_000 }),
      offer("best", { brandName: "Brembo", fitmentConfidence: "HIGH_CONFIDENCE", confidenceScore: 88, priceCents: 300_000 }),
      offer("better", { manufacturerPartNumber: "MPN123", canonicalManufacturerPartNumber: "MPN123", confidenceScore: 72, priceCents: 200_000 }),
      offer("good", { fitmentConfidence: "HIGH_CONFIDENCE", confidenceScore: 65, sellerFeedbackPercentage: 98, priceCents: 100_000 }),
      offer("generic", { confidenceScore: 45, sellerFeedbackPercentage: 90, priceCents: 10_000 }),
    ],
    preferredBrands: [{
      partBrandId: "brembo-id",
      name: "Brembo",
      relationshipType: "OEM_APPROVED",
      priority: 20,
      affiliateEnabled: true,
      affiliateStatus: "ACTIVE",
      providerCode: "EBAY",
    }],
  });
  const tiers = Object.fromEntries(ranked.map((entry) => [entry.id, entry.qualityTier]));
  assert.equal(tiers.oem, "OEM");
  assert.equal(tiers["oem-number-only"], "BETTER");
  assert.equal(tiers.best, "BEST");
  assert.equal(tiers.better, "BETTER");
  assert.equal(tiers.good, "GOOD");
  assert.equal(tiers.generic, "GENERIC");
  assert.notEqual(ranked[0].id, "generic");
});

function offer(id: string, overrides: Partial<Parameters<typeof rankPartOffers>[0]["offers"][number]> = {}) {
  return {
    id,
    providerCode: "EBAY",
    providerType: "MARKETPLACE",
    providerActive: true,
    affiliateUrl: `https://example.com/${id}`,
    confidenceScore: 50,
    fitmentConfidence: "POSSIBLE",
    priceCents: 50_000,
    ...overrides,
  };
}
