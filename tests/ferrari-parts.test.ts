import assert from "node:assert/strict";
import test from "node:test";
import { buildEbayAffiliateReference, buildFerrariComponentSearchPlans } from "../lib/ebay/browse.server";
import { normalizeOemPartNumber } from "../lib/parts/ferrari-taxonomy";
import { getPartTypeTitleConflict, scoreFerrariComponentOffer, scoreFerrariOffer } from "../lib/parts/offer-quality";
import {
  FERRARI_COMPONENT_LIBRARY,
  getFerrariComponentMigrationMap,
  getFerrariComponentAliases,
  getFerrariComponentSearchTemplates,
  isFerrariComponentApplicable,
  normalizeFerrariComponent,
} from "../lib/parts/ferrari-component-library";
import { PART_CATEGORY_SEEDS } from "../lib/parts/catalog-foundation";
import { deriveFerrariProductIdentity } from "../lib/parts/ferrari-product-normalizer";
import { buildPartOfferContentHash } from "../lib/parts/offer-content-hash";
import { buildScuderiaCanonicalPartData, parseScuderiaDiagram, parseSelectOptions } from "../lib/parts/sources/scuderia";

test("normalizes Ferrari OEM identifiers deterministically", () => {
  assert.equal(normalizeOemPartNumber(" 31-3207/a "), "313207A");
});

test("offer fingerprints avoid unchanged writes and detect meaningful marketplace changes", () => {
  const offer = {
    provider: "EBAY",
    externalItemId: "v1|123456|0",
    title: "Ferrari 458 front brake pads",
    priceCents: 89_900,
    currency: "USD",
    condition: "New",
    sellerName: "Example Seller",
    sellerFeedbackPercentage: 99.8,
    sellerQualityScore: 100,
    imageUrl: "https://i.ebayimg.com/example.jpg",
    affiliateUrl: "https://www.ebay.com/affiliate-item",
    sourceUrl: "https://www.ebay.com/item/123456",
    availability: "AVAILABLE",
    oemMatchType: "EXACT",
    genuineOemStatus: "CLAIMED",
    compatibilityStatus: "MODEL_NAMED",
    fitmentConfidence: "HIGH",
    confidenceScore: 95,
    shippingCostCents: 0,
    shippingCurrency: "USD",
    affiliateReferenceId: "ferrari_458_front_pads",
    itemEndDate: null,
  };
  const originalHash = buildPartOfferContentHash(offer);
  assert.equal(buildPartOfferContentHash({ ...offer }), originalHash);
  assert.notEqual(buildPartOfferContentHash({ ...offer, priceCents: 94_900 }), originalHash);
  assert.notEqual(buildPartOfferContentHash({ ...offer, availability: "STALE" }), originalHash);
});

test("Scuderia parser extracts canonical OEM rows without source images", () => {
  const html = `
    <select aria-label="Select Model">
      <option value="/part-finder/ferrari/458">Ferrari 458</option>
      <option value="/part-finder/lamborghini/huracan">Lamborghini Huracan</option>
    </select>
    <table><tr class="diagrow">
      <td><input data-partid="234343"></td><td>1</td>
      <td><a class="parturl" href="/part/234343/ferrari/313207/compl-tunnel.html">313207</a></td>
      <td id="hiddiagpartdesc"><a class="parturl" href="/part/234343/ferrari/313207/compl-tunnel.html">COMPL. TUNNEL</a></td>
      <td></td><td>$16,374.84</td>
    </tr></table>`;
  const parts = parseScuderiaDiagram(html, {
    sourceCategory: "Chassis Components",
    sourceUrl: "https://www.scuderiacarparts.com/part-finder/ferrari/458/oe/166/2514/48441",
    modelSlug: "458-speciale-aperta",
    variantName: "458 Speciale Aperta",
  });
  assert.equal(parts.length, 1);
  assert.equal(parts[0].oemPartNumber, "313207");
  assert.equal(parts[0].observedPriceCents, 1_637_484);
  assert.equal(parts[0].diagramReference, "48441");
  assert.match(parts[0].sourceUrl, /\/part\/234343\/ferrari\/313207/);
  assert.equal(parseSelectOptions(html, "Select Model").length, 2);
});

test("Scuderia canonical records contain identity and fitment evidence, not commerce fields", () => {
  const part = parseScuderiaDiagram(`
    <table><tr class="diagrow">
      <td></td><td>1</td>
      <td><a class="parturl" href="/part/1/ferrari/313207/example.html">313207</a></td>
      <td id="hiddiagpartdesc"><a class="parturl" href="/part/1/ferrari/313207/example.html">COMPL. TUNNEL</a></td>
      <td></td><td>$16,374.84</td>
    </tr></table>`, {
      sourceCategory: "Chassis Components",
      sourceUrl: "https://www.scuderiacarparts.com/part-finder/ferrari/458/oe/1",
      modelSlug: "458-italia",
      variantName: "458 Italia",
    })[0];
  const canonical = buildScuderiaCanonicalPartData(part, "category-id", "brand-id");
  assert.equal(canonical.sourceCatalog, "SCUDERIA_FERRARI_OE");
  assert.equal("retailPriceCents" in canonical, false);
  assert.equal("availability" in canonical, false);
  assert.equal("sellerName" in canonical, false);
  assert.equal("affiliateUrl" in canonical, false);
});

test("offer quality promotes exact Ferrari OEM matches", () => {
  const result = scoreFerrariOffer({
    title: "Genuine Ferrari 458 Compl Tunnel OEM 313207 New",
    canonicalPartName: "Compl. Tunnel",
    canonicalManufacturer: "Ferrari OEM",
    oemPartNumber: "313207",
    compatibleModels: ["458 Speciale Aperta"],
    condition: "New",
    sellerFeedbackPercentage: 99.8,
    imageUrl: "https://i.ebayimg.com/example.jpg",
    priceCents: 1_200_000,
  });
  assert.equal(result.confidence, "EXACT_MATCH");
  assert.ok(result.score >= 70);
  assert.equal(result.oemMatchType, "EXACT");
  assert.equal(result.genuineOemStatus, "CLAIMED");
  assert.notEqual(result.genuineOemStatus, "VERIFIED");
});

test("offer ranking favors strong identity evidence over a cheaper generic match", () => {
  const exact = scoreFerrariOffer({
    title: "Genuine Ferrari OEM 313207 Compl Tunnel New",
    canonicalPartName: "Compl. Tunnel",
    canonicalManufacturer: "Ferrari OEM",
    oemPartNumber: "313207",
    compatibleModels: ["458 Italia"],
    sellerFeedbackPercentage: 99.5,
    priceCents: 1_600_000,
  });
  const cheap = scoreFerrariOffer({
    title: "Ferrari 458 tunnel replacement part",
    canonicalPartName: "Compl. Tunnel",
    canonicalManufacturer: "Ferrari OEM",
    oemPartNumber: "313207",
    compatibleModels: ["458 Italia"],
    sellerFeedbackPercentage: 95,
    priceCents: 25_000,
  });
  assert.ok(exact.score > cheap.score);
});

test("fallback matching rejects a different aftermarket manufacturer", () => {
  const result = scoreFerrariOffer({
    title: "Ferrari 488 GTB iPE Titanium Cat Back Exhaust",
    canonicalPartName: "Ferrari 488 GTB Performance Exhaust Program",
    canonicalManufacturer: "Novitec",
    compatibleModels: ["488 GTB"],
    condition: "New",
    sellerFeedbackPercentage: 99.5,
    imageUrl: "https://i.ebayimg.com/example.jpg",
    priceCents: 5_000_00,
  });
  assert.notEqual(result.confidence, "EXACT_MATCH");
  assert.notEqual(result.confidence, "HIGH_CONFIDENCE");
  assert.notEqual(result.confidence, "LIKELY_COMPATIBLE");
});

test("offer quality rejects collectibles and unrelated manufacturers", () => {
  assert.equal(scoreFerrariOffer({
    title: "Ferrari 458 diecast model car 1:18",
    canonicalPartName: "Brake Rotor",
    compatibleModels: ["458 Italia"],
  }).confidence, "REJECTED");
  assert.equal(scoreFerrariOffer({
    title: "Lamborghini Huracan brake rotor",
    canonicalPartName: "Brake Rotor",
    compatibleModels: ["458 Italia"],
  }).confidence, "REJECTED");
});

test("affiliate references are compact and header-safe", () => {
  const reference = buildEbayAffiliateReference({
    partId: "12345678-1234-1234-1234-123456789012",
    categorySlug: "wheels-and-tires",
    compatibleModels: ["458 Speciale Aperta"],
  });
  assert.ok(reference.length <= 64);
  assert.match(reference, /^[a-z0-9_-]+$/);
});

test("Ferrari component library is broad, permanent, and search-enabled", () => {
  const components = FERRARI_COMPONENT_LIBRARY.flatMap((category) => category.components.map(normalizeFerrariComponent));
  assert.equal(FERRARI_COMPONENT_LIBRARY.length, 17);
  assert.ok(components.length >= 100);
  for (const category of FERRARI_COMPONENT_LIBRARY) {
    for (const component of category.components) {
      assert.ok(getFerrariComponentSearchTemplates(category.slug, normalizeFerrariComponent(component).name).length >= 2);
    }
  }
  assert.ok(getFerrariComponentSearchTemplates("exhaust-emissions", "Cat-Back Exhaust").some((template) => template.includes("Capristo")));
  assert.ok(getFerrariComponentAliases({ name: "Front Brake Pads", aliases: ["front pad set"] }).includes("front pad set"));
});

test("automotive taxonomy uses 17 systems and removes redundant top-level concepts", () => {
  const slugs = FERRARI_COMPONENT_LIBRARY.map((category) => category.slug);
  assert.equal(slugs.length, 17);
  assert.ok(slugs.includes("maintenance-service"));
  assert.ok(slugs.includes("air-induction"));
  assert.ok(slugs.includes("ecu-electronics"));
  assert.ok(slugs.includes("suspension-steering"));
  assert.ok(slugs.includes("wheels-tires"));
  assert.ok(!slugs.includes("carbon-fiber"));
  assert.ok(!slugs.includes("forced-induction"));
  const airFilters = getFerrariComponentMigrationMap().filter((row) => row.newSlug === "engine-air-filter");
  assert.ok(airFilters.length >= 3);
  assert.ok(airFilters.every((row) => row.newCategory === "maintenance-service"));
});

test("generic parts foundation cannot reactivate legacy category containers", () => {
  assert.equal(PART_CATEGORY_SEEDS.length, 17);
  const slugs = PART_CATEGORY_SEEDS.map((category) => category.slug);
  assert.equal(new Set(slugs).size, 17);
  assert.equal(slugs.includes("intake"), false);
  assert.equal(slugs.includes("forced-induction"), false);
  assert.equal(slugs.includes("aero-body"), false);
  assert.equal(slugs.includes("air-induction"), true);
  assert.equal(slugs.includes("performance-packages"), true);
});

test("Ferrari component discovery stages identifiers, exact names, aliases, and known brands", () => {
  const plans = buildFerrariComponentSearchPlans({
    modelName: "458 Italia",
    componentName: "Engine Air Filter",
    templates: ["{make} {model} BMC {component}"],
    aliases: ["air filter", "replacement air filter", "panel filter"],
    identifiers: ["123456"],
    knownFerrariModels: ["458 Italia", "488 GTB"],
    knownBrands: ["BMC"],
    year: 2013,
    referenceId: "ferrari_458_air_filter",
  });
  assert.equal(plans[0].stage, "EXACT_IDENTIFIER");
  assert.ok(plans.some((plan) => plan.stage === "VEHICLE_COMPONENT" && /458 Italia Engine Air Filter/i.test(plan.query)));
  assert.ok(plans.some((plan) => plan.stage === "VEHICLE_ALIAS" && /458 Italia air filter/i.test(plan.query)));
  assert.ok(plans.some((plan) => plan.stage === "KNOWN_BRAND" && /BMC/i.test(plan.query)));
});

test("medium-risk 458 engine air filters do not require an OEM number for high confidence", () => {
  const result = scoreFerrariComponentOffer({
    title: "BMC High Performance Air Filter fits Ferrari 458 Italia 2010-2015",
    modelName: "458 Italia",
    componentName: "Engine Air Filter",
    aliases: ["air filter", "replacement air filter", "panel filter"],
    fitmentRisk: "MEDIUM",
    knownFerrariModels: ["458 Italia", "488 GTB", "F430"],
    knownBrands: ["BMC"],
    categoryNames: ["Air Filters for Cars and Trucks"],
    localizedAspects: [{ name: "Make", value: "Ferrari" }, { name: "Model", value: "458 Italia" }],
    condition: "New",
    sellerFeedbackPercentage: 99.5,
    imageUrl: "https://i.ebayimg.com/example.jpg",
    priceCents: 18_900,
  });
  assert.equal(result.confidence, "HIGH_CONFIDENCE");
  assert.equal(result.oemMatchType, "NONE");
});

test("common 458 components accept normalized model-family names without requiring Italia", () => {
  const result = scoreFerrariComponentOffer({
    title: "BMC FB614/01 Performance Air Filter for Ferrari 458 2009-2015",
    modelName: "458 Italia",
    componentName: "Engine Air Filter",
    aliases: ["air filter", "panel filter"],
    fitmentRisk: "MEDIUM",
    knownFerrariModels: ["458 Italia", "488 GTB"],
    knownBrands: ["BMC"],
    categoryNames: ["Air Filters for Cars and Trucks"],
    localizedAspects: [{ name: "Make", value: "Ferrari" }, { name: "Model", value: "458" }],
    condition: "New",
    sellerFeedbackPercentage: 99.7,
  });
  assert.equal(result.confidence, "HIGH_CONFIDENCE");
});

test("high-risk Ferrari fitment rejects an explicitly different model variant", () => {
  const result = scoreFerrariComponentOffer({
    title: "Front Suspension Control Arm for Ferrari 458 Spider",
    modelName: "458 Italia",
    componentName: "Front Control Arm",
    aliases: ["control arm"],
    fitmentRisk: "HIGH",
    knownFerrariModels: ["458 Italia", "458 Spider"],
    knownBrands: [],
  });
  assert.equal(result.confidence, "REJECTED");
  assert.match(result.reasons[0], /variant/i);
});

test("Ferrari air-filter recall rejects airbox covers and trim", () => {
  const result = scoreFerrariComponentOffer({
    title: "Dry Carbon Fiber Rear Engine Air Filter Box Cover Trim For Ferrari 458 Italia",
    modelName: "458 Italia",
    componentName: "Engine Air Filter",
    aliases: ["air filter", "panel filter"],
    fitmentRisk: "MEDIUM",
    knownFerrariModels: ["458 Italia", "488 GTB"],
    knownBrands: [],
  });
  assert.equal(result.confidence, "REJECTED");
  assert.match(result.reasons[0], /cover|housing/i);
});

test("medium-risk component offers require model or structured compatibility evidence", () => {
  const result = scoreFerrariComponentOffer({
    title: "Replacement Engine Air Filter Element For Ferrari",
    modelName: "458 Italia",
    componentName: "Engine Air Filter",
    aliases: ["air filter"],
    fitmentRisk: "MEDIUM",
    knownFerrariModels: ["458 Italia", "488 GTB"],
    knownBrands: [],
    categoryNames: ["Air Filters for Cars and Trucks"],
    condition: "New",
    sellerFeedbackPercentage: 99.8,
    imageUrl: "https://i.ebayimg.com/example.jpg",
  });
  assert.equal(result.confidence, "POSSIBLE_MATCH");
});

test("engine air-filter recall rejects universal cone and intake-kit filters", () => {
  const result = scoreFerrariComponentOffer({
    title: "3 inch Reusable High Flow Performance Cold Air Intake Filter Kit For Ferrari",
    modelName: "458 Italia",
    componentName: "Engine Air Filter",
    aliases: ["air filter"],
    fitmentRisk: "MEDIUM",
    knownFerrariModels: ["458 Italia"],
    knownBrands: [],
    localizedAspects: [{ name: "Make", value: "Ferrari" }, { name: "Model", value: "458 Italia" }],
  });
  assert.equal(result.confidence, "REJECTED");
});

test("part-type guards reject mutually exclusive filter and axle products", () => {
  assert.match(
    getPartTypeTitleConflict("Engine Air Filter", "10PCS Inline Gas Fuel Filter For Small Engine") || "",
    /engine air-filter/i,
  );
  assert.match(
    getPartTypeTitleConflict("Oil Filter", "Ferrari 458 Cabin Air Filter") || "",
    /oil-filter|different filter type/i,
  );
  assert.match(
    getPartTypeTitleConflict("Front Brake Pads", "Ferrari 458 Rear Brake Pads") || "",
    /rear-only/i,
  );
  assert.match(
    getPartTypeTitleConflict("Engine Air Filter", "Ferrari 458 Rear Air Duct Intake Cleaner Hose") || "",
    /does not identify/i,
  );
  assert.equal(
    getPartTypeTitleConflict("Engine Air Filter", "Ferrari Air Filter for Ferrari 458 OEM 236040"),
    null,
  );
  assert.match(
    getPartTypeTitleConflict("Performance Exhaust", "Universal Stainless Performance Exhaust U-Bend") || "",
    /not a performance exhaust system/i,
  );
});

test("Ferrari product-family normalization uses validated identifiers conservatively", () => {
  const identity = deriveFerrariProductIdentity({
    provider: "EBAY",
    externalItemId: "v1|123456|0",
    title: "Genuine Ferrari 458 Brembo Front Brake Pads OEM 70002544",
    priceCents: 100_000,
    currency: "USD",
    condition: "New",
    sellerName: "example",
    sellerFeedbackPercentage: 99.8,
    sellerQualityScore: 100,
    imageUrl: "https://i.ebayimg.com/example.jpg",
    affiliateUrl: "https://www.ebay.com/affiliate-item",
    sourceUrl: "https://www.ebay.com/item/123456",
    affiliateReferenceId: "ferrari_458_front_pads",
    itemEndDate: null,
    confidence: "HIGH_CONFIDENCE",
    confidenceScore: 95,
    oemMatchType: "NONE",
    genuineOemStatus: "CLAIMED",
    compatibilityStatus: "MODEL_NAMED",
    shippingCostCents: 0,
    shippingCurrency: "USD",
    subtitle: null,
    additionalImageUrls: [],
    itemLocation: "Charlotte, NC, US",
    marketplaceCategoryId: "33567",
    structuredBrand: "Brembo",
    structuredManufacturerPartNumber: null,
    structuredOemPartNumber: null,
    compatibilityData: null,
    quantityAvailable: null,
    searchQuery: "Ferrari 458 front brake pads",
    matchReasons: ["Exact model named"],
  }, {
    componentTypeId: "component-front-brake-pads",
    componentName: "Front Brake Pads",
    performanceRelated: false,
  });
  assert.equal(identity.brand, "Brembo");
  assert.equal(identity.provisional, false);
  assert.equal(identity.identifiers.find((identifier) => identifier.type === "OEM")?.normalizedValue, "70002544");
  assert.equal(identity.classification, "OEM_REPLACEMENT");
});

test("Ferrari vehicle naming does not masquerade as the product manufacturer", () => {
  const offer = {
    provider: "EBAY" as const,
    externalItemId: "v1|generic-replacement|0",
    title: "For Ferrari 458 Italia Front Brake Pad Set 70001668",
    priceCents: 49_900,
    currency: "USD",
    condition: "New",
    sellerName: null,
    sellerFeedbackPercentage: null,
    sellerQualityScore: null,
    imageUrl: null,
    affiliateUrl: "https://www.ebay.com/affiliate-item",
    sourceUrl: null,
    affiliateReferenceId: "ferrari_458_front_pads",
    itemEndDate: null,
    confidence: "HIGH_CONFIDENCE" as const,
    confidenceScore: 80,
    oemMatchType: "NONE" as const,
    genuineOemStatus: "NOT_STATED" as const,
    compatibilityStatus: "MODEL_NAMED" as const,
    shippingCostCents: null,
    shippingCurrency: null,
    subtitle: null,
    additionalImageUrls: [],
    itemLocation: null,
    marketplaceCategoryId: null,
    structuredBrand: null,
    structuredManufacturerPartNumber: null,
    structuredOemPartNumber: null,
    compatibilityData: null,
    quantityAvailable: null,
    searchQuery: "Ferrari 458 front brake pads",
    matchReasons: ["Exact model named"],
  };
  const identity = deriveFerrariProductIdentity(offer, {
    componentTypeId: "component-front-brake-pads",
    componentName: "Front Brake Pads",
    performanceRelated: false,
  });
  assert.equal(identity.brand, "Unbranded");
  assert.equal(identity.identifiers.find((identifier) => identifier.normalizedValue === "70001668")?.confidence, "POSSIBLE");
  assert.equal(identity.provisional, true);
});

test("Ferrari product-family normalization does not treat a model code as a part number", () => {
  const baseOffer = {
    provider: "EBAY" as const,
    externalItemId: "v1|model-only|0",
    title: "Ferrari 458 Italia front brake pads",
    priceCents: 50_000,
    currency: "USD",
    condition: "New",
    sellerName: null,
    sellerFeedbackPercentage: null,
    sellerQualityScore: null,
    imageUrl: null,
    affiliateUrl: "https://www.ebay.com/affiliate-item",
    sourceUrl: null,
    affiliateReferenceId: "ferrari_458_front_pads",
    itemEndDate: null,
    confidence: "LIKELY_COMPATIBLE" as const,
    confidenceScore: 50,
    oemMatchType: "NONE" as const,
    genuineOemStatus: "NOT_STATED" as const,
    compatibilityStatus: "MODEL_NAMED" as const,
    shippingCostCents: null,
    shippingCurrency: null,
    subtitle: null,
    additionalImageUrls: [],
    itemLocation: null,
    marketplaceCategoryId: null,
    structuredBrand: null,
    structuredManufacturerPartNumber: null,
    structuredOemPartNumber: null,
    compatibilityData: null,
    quantityAvailable: null,
    searchQuery: "Ferrari 458 front brake pads",
    matchReasons: ["Exact model named"],
  };
  const identity = deriveFerrariProductIdentity(baseOffer, {
    componentTypeId: "component-front-brake-pads",
    componentName: "Front Brake Pads",
    performanceRelated: false,
  });
  assert.equal(identity.identifiers.length, 0);
  assert.equal(identity.provisional, true);
  assert.match(identity.familyKey, /^ebay-family:/);
});

test("Ferrari component applicability excludes nonsensical powertrain components", () => {
  const turbocharger = { name: "Turbocharger", turboOnly: true };
  const hybridBattery = { name: "Hybrid Battery Component", hybridOnly: true, modernOnly: true };
  assert.equal(isFerrariComponentApplicable(turbocharger, {
    productionStartYear: 2009,
    productionEndYear: 2015,
    engine: "4.5L naturally aspirated V8",
    category: "Sports Car",
  }), false);
  assert.equal(isFerrariComponentApplicable(turbocharger, {
    productionStartYear: 2015,
    productionEndYear: 2019,
    engine: "3.9L twin-turbo V8",
    category: "Sports Car",
  }), true);
  assert.equal(isFerrariComponentApplicable(hybridBattery, {
    productionStartYear: 2019,
    productionEndYear: null,
    engine: "4.0L twin-turbo V8 plug-in hybrid",
    category: "Plug-in Hybrid Supercar",
  }), true);
});

test("component offer quality requires the selected Ferrari model and component", () => {
  const accepted = scoreFerrariComponentOffer({
    title: "Brembo Front Brake Pads for Ferrari 458 Italia New",
    modelName: "458 Italia",
    componentName: "Brake Pads",
    knownFerrariModels: ["458 Italia", "488 GTB", "F8 Tributo"],
    knownBrands: ["Brembo"],
    condition: "New",
    sellerFeedbackPercentage: 99.5,
    imageUrl: "https://i.ebayimg.com/example.jpg",
    priceCents: 49_900,
  });
  assert.ok(["EXACT_MATCH", "HIGH_CONFIDENCE", "LIKELY_COMPATIBLE"].includes(accepted.confidence));
  const wrongModel = scoreFerrariComponentOffer({
    title: "Brembo Front Brake Pads for Ferrari 488 GTB New",
    modelName: "458 Italia",
    componentName: "Brake Pads",
    knownFerrariModels: ["458 Italia", "488 GTB"],
    knownBrands: ["Brembo"],
  });
  assert.equal(wrongModel.confidence, "REJECTED");
  const wrongComponent = scoreFerrariComponentOffer({
    title: "Ferrari 458 Italia diecast model",
    modelName: "458 Italia",
    componentName: "Brake Pads",
    knownFerrariModels: ["458 Italia"],
    knownBrands: [],
  });
  assert.equal(wrongComponent.confidence, "REJECTED");
});
