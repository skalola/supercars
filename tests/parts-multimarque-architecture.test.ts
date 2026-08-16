import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildComponentSearchPlans } from "../lib/ebay/browse.server";
import { getFixturePreferredBrands } from "../lib/parts/ecosystem-config";
import { rankPartOffers } from "../lib/parts/offer-ranking";
import { getPartOffersApiPath, getPartSystemsApiPath, getPartTypesApiPath } from "../lib/parts/parts-api";
import { getUniversalPartComponentGroup } from "../lib/parts/part-type-hierarchy";
import { evaluateUniversalPartApplicability } from "../lib/parts/universal-applicability";
import { canMaterializePartContext, isDisplayEligiblePartOffer, partDiscoveryRequestSchema } from "../lib/parts/discovery-contract";
import { getOfferYearCompatibility, scoreComponentOffer } from "../lib/parts/offer-quality";

const fixtures = [
  { makeSlug: "ferrari", makeName: "Ferrari", modelSlug: "458-italia", modelName: "458 Italia", system: "brakes", group: "Brake Pads", partType: "Front Brake Pads", partTypeSlug: "front-brake-pads", engine: "4.5L naturally aspirated V8", brand: "Brembo" },
  { makeSlug: "lamborghini", makeName: "Lamborghini", modelSlug: "huracan-evo", modelName: "Huracan EVO", system: "brakes", group: "Brake Pads", partType: "Front Brake Pads", partTypeSlug: "front-brake-pads", engine: "5.2L naturally aspirated V10", brand: "Brembo" },
  { makeSlug: "mclaren", makeName: "McLaren", modelSlug: "720s", modelName: "720S", system: "aerodynamics", group: "Rear Aero", partType: "Rear Wing", partTypeSlug: "rear-wing", engine: "4.0L twin-turbo V8", brand: "MSO" },
  { makeSlug: "nissan", makeName: "Nissan", modelSlug: "gt-r", modelName: "GT-R", system: "air-induction", group: "Airboxes & Intakes", partType: "Cold Air Intake", partTypeSlug: "cold-air-intake", engine: "3.8L twin-turbo V6", brand: "Injen" },
] as const;

test("four marques use the same system, component, part-type, and offer route contracts", () => {
  for (const fixture of fixtures) {
    const vehicle = { makeSlug: fixture.makeSlug, modelSlug: fixture.modelSlug };
    assert.equal(getPartSystemsApiPath(vehicle), `/api/parts/vehicles/${fixture.makeSlug}/${fixture.modelSlug}/systems`);
    assert.equal(getPartTypesApiPath(vehicle, fixture.system), `/api/parts/vehicles/${fixture.makeSlug}/${fixture.modelSlug}/systems/${fixture.system}/part-types`);
    assert.match(getPartOffersApiPath(vehicle, { systemSlug: fixture.system, partTypeSlug: fixture.partTypeSlug }), new RegExp(`/part-types/${fixture.partTypeSlug}/offers\\?system=${fixture.system}$`));
    assert.equal(getUniversalPartComponentGroup(fixture.system, fixture.partType).name, fixture.group);
  }
});

test("universal applicability evaluates every fixture without manufacturer branches", () => {
  for (const fixture of fixtures) {
    const result = evaluateUniversalPartApplicability({ name: fixture.partType, slug: fixture.partTypeSlug, systemSlug: fixture.system }, {
      makeSlug: fixture.makeSlug,
      modelSlug: fixture.modelSlug,
      modelName: fixture.modelName,
      engine: fixture.engine,
      transmission: "7-speed dual clutch",
      productionStartYear: 2014,
      productionEndYear: 2024,
    });
    assert.equal(result.status, "APPLICABLE");
    assert.equal(result.publiclyApplicable, true);
  }
});

test("preferred brands are fixture data and eBay plans interpolate each make", () => {
  for (const fixture of fixtures) {
    const preferred = getFixturePreferredBrands(fixture.makeSlug, fixture.system, fixture.partTypeSlug);
    assert.ok(preferred.some((brand) => brand.name === fixture.brand));
    const plans = buildComponentSearchPlans({
      makeName: fixture.makeName,
      makeSlug: fixture.makeSlug,
      modelName: fixture.modelName,
      componentName: fixture.partType,
      templates: ["{make} {model} {component}"],
      knownModels: [fixture.modelName],
      knownBrands: preferred.map((brand) => brand.name),
      referenceId: `${fixture.makeSlug}_${fixture.modelSlug}_${fixture.partTypeSlug}`,
    });
    assert.ok(plans.every((plan) => plan.query.includes(fixture.makeName)));
  }
});

test("generic ranking uses configured relationships rather than brand-name conditionals", () => {
  for (const fixture of fixtures) {
    const preferred = getFixturePreferredBrands(fixture.makeSlug, fixture.system, fixture.partTypeSlug);
    const selected = preferred.find((brand) => brand.name === fixture.brand)!;
    const [ranked] = rankPartOffers({
      offers: [{
        id: fixture.makeSlug,
        providerCode: "EBAY",
        providerType: "EBAY",
        providerActive: true,
        brandName: selected.name,
        affiliateUrl: `https://example.test/${fixture.makeSlug}`,
        fitmentConfidence: "HIGH_CONFIDENCE",
        confidenceScore: 88,
      }],
      preferredBrands: [{
        partBrandId: `${selected.slug}-fixture`,
        name: selected.name,
        relationshipType: selected.relationshipType,
        priority: selected.priority,
        affiliateEnabled: true,
        affiliateStatus: "ACTIVE",
        providerCode: "EBAY",
        brandType: selected.brandType,
      }],
    });
    assert.notEqual(ranked.qualityTier, "GENERIC");
  }
});

test("production Parts UI contains no manufacturer-specific branch", () => {
  const source = readFileSync(new URL("../components/parts/PartsTuningShop.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /ferrari/i);
  assert.doesNotMatch(source, /selectedMake.*name.*===/i);
});

test("reference catalogs and commerce providers remain separate persistence concepts", () => {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /model CatalogReferenceSource/);
  assert.match(schema, /model PartOfferProvider/);
  assert.match(schema, /model PartCatalogReference/);
  assert.match(schema, /model PartOffer\s*\{/);
});

test("marque enablement and maintenance links are data-driven", () => {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const maintenance = readFileSync(new URL("../lib/parts/maintenance-links.ts", import.meta.url), "utf8");
  assert.match(schema, /model PartsMarqueConfig/);
  assert.match(schema, /model PartApplicabilityOverride/);
  assert.match(schema, /componentTypeId\s+String\?/);
  assert.match(maintenance, /linkPartTypeToMaintenanceRule/);
  assert.match(maintenance, /getPartTypesForMaintenanceRule/);
});

test("background offer operations accept a make context", () => {
  const refresh = readFileSync(new URL("../lib/parts/offer-refresh.ts", import.meta.url), "utf8");
  const recovery = readFileSync(new URL("../lib/parts/zero-offer-recovery.ts", import.meta.url), "utf8");
  assert.match(refresh, /refreshEbayOffersForMake/);
  assert.match(refresh, /makeSlug:\s*string/);
  assert.match(recovery, /prepareZeroOfferRecovery/);
  assert.match(recovery, /makeSlug:\s*string/);
});

test("parts discovery accepts a strict selected category contract", () => {
  assert.equal(partDiscoveryRequestSchema.safeParse({ systemSlug: "air-induction", year: 2022 }).success, true);
  assert.equal(partDiscoveryRequestSchema.safeParse({ systemSlug: "air-induction", year: 1700 }).success, false);
  assert.equal(partDiscoveryRequestSchema.safeParse({ systemSlug: "air-induction", unexpected: true }).success, false);
});

test("only publicly applicable component contexts are materialized", () => {
  assert.equal(canMaterializePartContext({
    status: "APPLICABLE",
    confidence: "MEDIUM",
    publiclyApplicable: true,
    source: "UNIVERSAL_RULE",
    reason: "Supplier fitment must still be validated.",
    reviewRequired: true,
  }), true);
  assert.equal(canMaterializePartContext({
    status: "VARIANT_DEPENDENT",
    confidence: "LOW",
    publiclyApplicable: false,
    source: "UNIVERSAL_RULE",
    reason: "Variant data is required.",
    reviewRequired: true,
  }), false);
});

test("low-risk model matches display without weakening higher-risk fitment", () => {
  assert.equal(isDisplayEligiblePartOffer({ fitmentConfidence: "POSSIBLE_MATCH", fitmentRisk: "LOW" }), true);
  assert.equal(isDisplayEligiblePartOffer({ fitmentConfidence: "POSSIBLE_MATCH", fitmentRisk: "MEDIUM" }), false);
  assert.equal(isDisplayEligiblePartOffer({ fitmentConfidence: "POSSIBLE_MATCH", fitmentRisk: "HIGH" }), false);
  assert.equal(isDisplayEligiblePartOffer({ fitmentConfidence: "HIGH_CONFIDENCE", fitmentRisk: "HIGH" }), true);
});

test("short uppercase model codes remain distinctive fitment evidence", () => {
  const result = scoreComponentOffer({
    makeName: "Acura",
    modelName: "RSX",
    componentName: "Intake System",
    title: "Injen Cold Air Intake System fits 2002-2006 Acura RSX 2.0L",
    knownModels: ["RSX", "NSX", "Integra"],
    knownBrands: ["Injen"],
    year: 2006,
    condition: "New",
    sellerFeedbackPercentage: 99,
    imageUrl: "https://example.test/intake.jpg",
    fitmentRisk: "MEDIUM",
    categoryNames: ["Automotive Parts"],
  });
  assert.ok(["HIGH_CONFIDENCE", "LIKELY_COMPATIBLE"].includes(result.confidence));
  assert.ok(result.reasons.some((reason) => reason.includes("Exact model named")));
});

test("explicit marketplace fitment years cannot cross vehicle generations", () => {
  assert.equal(getOfferYearCompatibility("Fits 2019-2026 Toyota Supra", 1998), "CONFLICT");
  assert.equal(getOfferYearCompatibility("Fits 2019+ Toyota Supra", 1998), "CONFLICT");
  assert.equal(getOfferYearCompatibility("Toyota Supra GR BMW Z4 19+", 1998), "CONFLICT");
  assert.equal(getOfferYearCompatibility("Cold Air Intake for 2021 Toyota Supra", 1998), "CONFLICT");
  assert.equal(getOfferYearCompatibility("Fits 2003-06 Nissan 350Z", 2008), "CONFLICT");
  assert.equal(getOfferYearCompatibility("Mazda MX-5 Miata 06-15", 1997), "CONFLICT");
  assert.equal(getOfferYearCompatibility("Mazda MX-5 Miata 90-97", 1997), "MATCH");
  assert.equal(getOfferYearCompatibility("Fits 2003-2008 Nissan 350Z", 2008), "MATCH");
  assert.equal(getOfferYearCompatibility("Part 2020 for Nissan 350Z", 2008), "UNKNOWN");

  const rejected = scoreComponentOffer({
    makeName: "Toyota",
    modelName: "Supra",
    componentName: "Intake System",
    title: "Cold Air Intake System For 2019-2026 Toyota Supra 3.0T",
    knownModels: ["Supra"],
    knownBrands: [],
    year: 1998,
    fitmentRisk: "MEDIUM",
  });
  assert.equal(rejected.confidence, "REJECTED");
  assert.match(rejected.reasons[0], /do not include 1998/);

  const wrongComponent = scoreComponentOffer({
    makeName: "Toyota",
    modelName: "Supra",
    componentName: "Intake System",
    title: "Billet Air Intake Manifold Upgrade and Fuel Rail for Toyota Supra 2JZGE",
    knownModels: ["Supra"],
    knownBrands: [],
    year: 1998,
    fitmentRisk: "MEDIUM",
  });
  assert.equal(wrongComponent.confidence, "REJECTED");
  assert.match(wrongComponent.reasons[0], /not a complete intake system/);

  const ambiguousGeneration = scoreComponentOffer({
    makeName: "Toyota",
    modelName: "Supra",
    componentName: "Intake System",
    title: "Performance Cold Air Intake System for Toyota Supra A90",
    knownModels: ["Supra", "GR Supra RZ", "Supra RZ"],
    knownBrands: [],
    year: 1998,
    fitmentRisk: "MEDIUM",
  });
  assert.equal(ambiguousGeneration.confidence, "REJECTED");
  assert.match(ambiguousGeneration.reasons[0], /generation cannot be verified/);
});

test("component selection uses POST discovery and no longer blocks unmapped taxonomy", () => {
  const selector = readFileSync(new URL("../components/parts/PartTypeCategorySelector.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/parts/vehicles/[make]/[model]/part-types/[partType]/offers/route.ts", import.meta.url), "utf8");
  assert.match(selector, /method:\s*"POST"/);
  assert.doesNotMatch(selector, /if\s*\(!partType\.mapped\)/);
  assert.match(route, /export async function POST/);
  assert.match(route, /resolvePartDiscoveryContext/);
  assert.match(route, /parts_offer_discovery/);
});

test("parts selector includes every catalog model while mappings remain on demand", () => {
  const storefront = readFileSync(new URL("../lib/parts/storefront.ts", import.meta.url), "utf8");
  const context = readFileSync(new URL("../lib/parts/discovery-context.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/parts/ferrari-component-service.ts", import.meta.url), "utf8");
  assert.match(storefront, /FROM "public"\."Model" model/);
  assert.match(context, /modelPartComponent\.create/);
  assert.match(context, /modelId_componentTypeId/);
  assert.doesNotMatch(context, /MARQUE_DISABLED|partsEnabled/);
  assert.doesNotMatch(service, /partsEnabled:\s*true|Parts discovery is not enabled for this marque/);
  assert.match(service, /configuredProviderCodes\.length > 0 \? configuredProviderCodes : \["EBAY"\]/);
});
