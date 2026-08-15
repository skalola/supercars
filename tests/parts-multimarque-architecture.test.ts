import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildComponentSearchPlans } from "../lib/ebay/browse.server";
import { getFixturePreferredBrands } from "../lib/parts/ecosystem-config";
import { rankPartOffers } from "../lib/parts/offer-ranking";
import { getPartOffersApiPath, getPartSystemsApiPath, getPartTypesApiPath } from "../lib/parts/parts-api";
import { getUniversalPartComponentGroup } from "../lib/parts/part-type-hierarchy";
import { evaluateUniversalPartApplicability } from "../lib/parts/universal-applicability";

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
