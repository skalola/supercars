import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPerformanceProjection,
  getPartRecommendation,
  getQualitativePartEffects,
  type InstalledPartDescriptor,
} from "../lib/parts/part-detail-intelligence";
import { getPartTypeDetailPath } from "../lib/parts/parts-api";
import { groupPartOffers } from "../lib/parts/part-detail-service";

const airFilter = {
  id: "air-filter",
  name: "Engine Air Filter",
  slug: "engine-air-filter",
  systemSlug: "maintenance-service",
  fitmentRisk: "LOW",
  performanceRelated: false,
  applicability: "APPLICABLE",
};

test("exact installed part types are not recommended twice", () => {
  const recommendation = getPartRecommendation({
    partType: airFilter,
    installedParts: [{ id: "installed", name: "BMC Air Filter", brandName: "BMC", componentTypeId: airFilter.id }],
    requirements: [],
    includedBy: [],
  });
  assert.equal(recommendation.status, "ALREADY_INSTALLED");
});

test("parts included in a configuration suppress standalone recommendations", () => {
  const recommendation = getPartRecommendation({
    partType: { ...airFilter, id: "performance-exhaust", name: "Performance Exhaust", slug: "performance-exhaust", systemSlug: "exhaust-emissions", performanceRelated: true },
    installedParts: [{ id: "package", name: "ECU + Exhaust Package", includedPartTypeIds: ["performance-exhaust"] }],
    requirements: [],
    includedBy: [],
  });
  assert.equal(recommendation.status, "ALREADY_INCLUDED_IN_CONFIGURATION");
});

test("missing required supporting mods are surfaced before purchase", () => {
  const recommendation = getPartRecommendation({
    partType: { ...airFilter, id: "downpipe", name: "Downpipe", slug: "downpipe", systemSlug: "exhaust-emissions", performanceRelated: true },
    installedParts: [],
    requirements: [{ relationshipType: "REQUIRES", partType: { id: "ecu", name: "ECU Tune", slug: "ecu-tune" } }],
    includedBy: [],
  });
  assert.equal(recommendation.status, "REQUIRES_SUPPORTING_MOD");
  assert.match(recommendation.reason, /ECU Tune/);
});

test("data-driven redundant relationships prevent duplicate-function recommendations", () => {
  const recommendation = getPartRecommendation({
    partType: { ...airFilter, id: "panel-filter", name: "Panel Air Filter" },
    installedParts: [{ id: "installed", name: "Cold Air Intake", componentTypeId: "cold-air-intake" }],
    requirements: [{
      relationshipType: "REDUNDANT_WITH",
      partType: { id: "cold-air-intake", name: "Cold Air Intake", slug: "cold-air-intake" },
      reason: "The installed intake already replaces the factory filter assembly.",
    }],
    includedBy: [],
  });
  assert.equal(recommendation.status, "REDUNDANT");
  assert.match(recommendation.reason, /replaces the factory filter/);
});

test("incompatible applicability overrides all commerce signals", () => {
  const recommendation = getPartRecommendation({
    partType: { ...airFilter, applicability: "NOT_APPLICABLE" },
    installedParts: [],
    requirements: [],
    includedBy: [],
  });
  assert.equal(recommendation.status, "INCOMPATIBLE");
});

test("performance projection uses strongest evidence and prevents double counting", () => {
  const installedParts: InstalledPartDescriptor[] = [{ id: "tune", name: "ECU Tune", hpGain: 20, torqueGain: 15 }];
  const projected = buildPerformanceProjection({
    stockHorsepower: 570,
    stockTorque: 398,
    weight: 3274,
    installedParts,
    evidence: [
      { horsepowerGain: 5, torqueGain: 4, confidence: "HIGH", source: "Dyno" },
      { horsepowerGain: 10, torqueGain: 7, confidence: "HIGH", source: "Dyno" },
      { horsepowerGain: 25, torqueGain: 20, confidence: "LOW", source: "Claim" },
    ],
  });
  assert.equal(projected.currentBuild.horsepowerMax, 590);
  assert.equal(projected.selectedPartImpact.horsepowerGainMin, 5);
  assert.equal(projected.selectedPartImpact.horsepowerGainMax, 10);
  assert.equal(projected.projectedBuild.horsepowerMax, 600);

  const suppressed = buildPerformanceProjection({ stockHorsepower: 570, installedParts, evidence: [{ horsepowerGain: 10, confidence: "HIGH" }], suppressSelectedGain: true });
  assert.equal(suppressed.projectedBuild.horsepowerMax, 590);
  assert.equal(suppressed.selectedPartImpact.suppressedToPreventDoubleCount, true);
});

test("maintenance, braking, exhaust, and suspension part types produce useful qualitative effects", () => {
  assert.ok(getQualitativePartEffects(airFilter).includes("Reliability"));
  const oilFilterEffects = getQualitativePartEffects({ name: "Oil Filter", systemSlug: "maintenance-service" });
  assert.ok(oilFilterEffects.includes("Reliability"));
  assert.equal(oilFilterEffects.includes("Airflow"), false);
  assert.ok(getQualitativePartEffects({ name: "Front Brake Pads", systemSlug: "brakes" }).includes("Braking consistency"));
  assert.ok(getQualitativePartEffects({ name: "Performance Exhaust", systemSlug: "exhaust-emissions" }).includes("Sound"));
  assert.ok(getQualitativePartEffects({ name: "Lowering Spring", systemSlug: "suspension-steering" }).includes("Handling"));
});

test("equivalent seller listings group by brand and MPN", () => {
  const base = {
    provider: "EBAY", title: "BMC Performance Air Filter", manufacturer: "BMC", manufacturerPartNumber: "FB546/20", oemPartNumber: null,
    currency: "USD", qualityTier: "BEST", imageUrl: null, condition: "New", sellerFeedbackPercentage: 99, shippingCostCents: null,
    shippingCurrency: null, fitmentConfidence: "HIGH_CONFIDENCE", buyUrl: "/out/parts/offers/one",
  };
  const grouped = groupPartOffers([
    { ...base, id: "one", sellerName: "Seller One", priceCents: 14900 },
    { ...base, id: "two", sellerName: "Seller Two", priceCents: 15900, buyUrl: "/out/parts/offers/two" },
  ]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].sellerCount, 2);
  assert.equal(grouped[0].fromPriceCents, 14900);
});

test("part type detail URL carries generic vehicle and owned-car context", () => {
  assert.equal(
    getPartTypeDetailPath(
      { makeSlug: "ferrari", modelSlug: "458-italia" },
      { systemSlug: "air-induction", partTypeSlug: "high-flow-air-filter", year: 2015, vehicleId: "vehicle-id" },
    ),
    "/parts/vehicles/ferrari/458-italia/high-flow-air-filter?system=air-induction&year=2015&vehicleId=vehicle-id",
  );
});
