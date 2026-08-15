import assert from "node:assert/strict";
import test from "node:test";
import {
  getFixturePreferredBrands,
  getManufacturerEcosystemFixture,
} from "../lib/parts/ecosystem-config";
import { rankPartOffers } from "../lib/parts/offer-ranking";
import { getPreferredBrandBadge } from "../lib/parts/preferred-brands";
import { getPartOfferProviderAdapter } from "../lib/parts/offers/registry";

test("Ferrari exhaust represents preferred product brands with eBay fallback", () => {
  const brands = getFixturePreferredBrands("ferrari", "exhaust-emissions").map((brand) => brand.name);
  assert.ok(brands.includes("Ferrari"));
  assert.ok(brands.includes("Novitec"));
  assert.ok(brands.includes("Capristo"));
  assert.ok(brands.includes("Akrapovic"));
  assert.equal(getPartOfferProviderAdapter("EBAY")?.providerType, "EBAY");
});

test("Lamborghini fixture represents Huracan exhaust preferences without enabling production ingestion", () => {
  const fixture = getManufacturerEcosystemFixture("lamborghini");
  const brands = getFixturePreferredBrands("lamborghini", "exhaust-emissions").map((brand) => brand.name);
  assert.equal(fixture?.productionEnabled, false);
  assert.ok(brands.includes("Lamborghini Accessori Originali"));
  assert.ok(brands.includes("Akrapovic"));
});

test("McLaren fixture represents MSO as factory performance for aero", () => {
  const brands = getFixturePreferredBrands("mclaren", "aerodynamics");
  const mso = brands.find((brand) => brand.slug === "mso");
  assert.equal(getManufacturerEcosystemFixture("mclaren")?.productionEnabled, false);
  assert.equal(mso?.relationshipType, "FACTORY_PERFORMANCE");
  assert.equal(getPreferredBrandBadge(mso?.relationshipType || ""), "Factory Performance");
});

test("Nissan GT-R intake fixture can represent NISMO, Injen, and AEM together", () => {
  const brands = getFixturePreferredBrands("nissan", "air-induction").map((brand) => brand.name);
  assert.equal(getManufacturerEcosystemFixture("nissan")?.productionEnabled, false);
  assert.deepEqual(brands, ["NISMO", "AEM", "Injen"]);
});

test("active direct partners outrank exact eBay offers while eBay remains an alternative", () => {
  const ranked = rankPartOffers({
    offers: [
      {
        id: "direct",
        providerCode: "CAPRISTO_DIRECT",
        providerType: "DIRECT_AFFILIATE",
        providerActive: true,
        partBrandId: "capristo",
        affiliateUrl: "https://partner.example/part",
        confidenceScore: 90,
        fitmentConfidence: "HIGH",
        priceCents: 900_000,
      },
      {
        id: "ebay",
        providerCode: "EBAY",
        providerType: "EBAY",
        providerActive: true,
        partBrandId: "capristo",
        affiliateUrl: "https://ebay.example/part",
        confidenceScore: 98,
        fitmentConfidence: "HIGH",
        oemMatchType: "EXACT",
        priceCents: 850_000,
      },
    ],
    preferredBrands: [{
      partBrandId: "capristo",
      relationshipType: "PERFORMANCE_PREFERRED",
      priority: 2,
      affiliateEnabled: true,
      affiliateStatus: "ACTIVE",
      providerCode: "CAPRISTO_DIRECT",
    }],
  });
  assert.deepEqual(ranked.map((offer) => offer.id), ["direct", "ebay"]);
  assert.equal(ranked[0].rankReason, "DIRECT_PARTNER");
  assert.equal(ranked[1].rankReason, "EXACT_OEM");
});

test("pending partner configuration never receives a direct-partner rank", () => {
  const [ranked] = rankPartOffers({
    offers: [{
      id: "pending",
      providerCode: "SCUDERIA",
      providerType: "DIRECT_AFFILIATE",
      providerActive: true,
      partBrandId: "ferrari",
      affiliateUrl: "https://partner.example/part",
      confidenceScore: 90,
      fitmentConfidence: "HIGH",
    }],
    preferredBrands: [{
      partBrandId: "ferrari",
      relationshipType: "FACTORY",
      priority: 1,
      affiliateEnabled: false,
      affiliateStatus: "PENDING",
      providerCode: "SCUDERIA",
    }],
  });
  assert.equal(ranked.rankReason, "VERIFIED_FITMENT");
  assert.notEqual(ranked.rankReason, "DIRECT_PARTNER");
});

test("relationship badges avoid unsupported official claims", () => {
  assert.equal(getPreferredBrandBadge("FACTORY"), "Factory");
  assert.equal(getPreferredBrandBadge("PERFORMANCE_PREFERRED"), "Preferred Performance");
  assert.notEqual(getPreferredBrandBadge("OEM_APPROVED"), "Official");
});
