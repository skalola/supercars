import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCanonicalPartIdentityKey,
  buildModelPartApplicabilityKey,
  buildPartCatalogReferenceKey,
  buildPartFitmentKey,
  classifyLegacyProductForMigration,
  getCanonicalPartPublicationEligibility,
  getCustomerFitmentLabel,
  normalizePartIdentifier,
} from "../lib/parts/canonical-catalog";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../prisma/migrations/20260815233000_add_canonical_parts_reference_layer/migration.sql", import.meta.url),
  "utf8",
);

test("canonical catalog schema preserves products while separating references, offers, images, and evidence", () => {
  for (const model of [
    "CatalogReferenceSource",
    "PartCatalogReference",
    "PartImage",
    "ModelPartApplicability",
    "PartPerformanceEvidence",
    "PartPerformanceConfiguration",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
    assert.match(migration, new RegExp(`CREATE TABLE "${model}"`));
  }
  assert.match(schema, /model PerformancePart[\s\S]*identityKey\s+String\?\s+@unique/);
  assert.match(schema, /model PerformancePart[\s\S]*catalogPublished\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /model PartOffer[\s\S]*partId\s+String\?/);
  assert.doesNotMatch(migration, /DROP TABLE "(?:PerformancePart|PartOffer|PartOfferContext)"/);
});

test("canonical identity is deterministic and requires a strong identifier", () => {
  const input = {
    brandId: "bmc-brand-id",
    identifiers: [
      { type: "OEM" as const, value: " 123-45 ", confidence: "HIGH" as const },
      { type: "MPN" as const, value: " FB546/20 ", confidence: "VERIFIED_IDENTIFIER" as const },
    ],
  };
  assert.equal(buildCanonicalPartIdentityKey(input), buildCanonicalPartIdentityKey({
    ...input,
    identifiers: [...input.identifiers].reverse(),
  }));
  assert.equal(normalizePartIdentifier(" FB546/20 "), "FB54620");
  assert.equal(buildCanonicalPartIdentityKey({
    brandId: "bmc-brand-id",
    identifiers: [{ type: "MPN", value: "FB546/20", confidence: "MEDIUM" }],
  }), null);
});

test("brand is part of canonical product identity", () => {
  const identifiers = [{ type: "MPN" as const, value: "FB546/20", confidence: "HIGH" as const }];
  assert.notEqual(
    buildCanonicalPartIdentityKey({ brandId: "bmc", identifiers }),
    buildCanonicalPartIdentityKey({ brandId: "another-brand", identifiers }),
  );
});

test("reference keys normalize URL noise but retain source and vehicle context", () => {
  const base = buildPartCatalogReferenceKey({
    sourceCode: "MANUFACTURER",
    sourceUrl: "https://example.com/catalog/air-filter/#fitment",
    sourcePartNumber: "FB546/20",
    modelId: "458",
  });
  assert.equal(base, buildPartCatalogReferenceKey({
    sourceCode: "manufacturer",
    sourceUrl: "https://example.com/catalog/air-filter",
    sourcePartNumber: "fb54620",
    modelId: "458",
  }));
  assert.notEqual(base, buildPartCatalogReferenceKey({
    sourceCode: "manufacturer",
    sourceUrl: "https://example.com/catalog/air-filter",
    sourcePartNumber: "fb54620",
    modelId: "488",
  }));
});

test("structured fitment and applicability keys change with meaningful vehicle constraints", () => {
  const fitment = {
    partId: "part-1",
    modelId: "model-1",
    yearStart: 2010,
    yearEnd: 2015,
    transmission: "DCT",
  };
  assert.equal(buildPartFitmentKey(fitment), buildPartFitmentKey({ ...fitment }));
  assert.notEqual(buildPartFitmentKey(fitment), buildPartFitmentKey({ ...fitment, transmission: "Manual" }));

  const applicability = { modelPartComponentId: "mapping-1", aspiration: "NATURALLY_ASPIRATED" };
  assert.notEqual(
    buildModelPartApplicabilityKey(applicability),
    buildModelPartApplicabilityKey({ ...applicability, aspiration: "TURBOCHARGED" }),
  );
});

test("publication requires active approved canonical identity and provenance", () => {
  assert.deepEqual(getCanonicalPartPublicationEligibility({
    status: "ACTIVE",
    catalogPublished: true,
    identityConfidence: "VERIFIED_IDENTIFIER",
    identityKey: "part:key",
    componentTypeId: "engine-air-filter",
    activeCatalogReferenceCount: 1,
  }), { eligible: true, reason: null });

  const provisional = getCanonicalPartPublicationEligibility({
    status: "ACTIVE",
    catalogPublished: true,
    identityConfidence: "MEDIUM",
    identityKey: "part:key",
    componentTypeId: "engine-air-filter",
    activeCatalogReferenceCount: 1,
  });
  assert.equal(provisional.eligible, false);
  assert.match(provisional.reason, /confidence/i);
});

test("legacy marketplace families remain unresolved unless evidence supports review", () => {
  assert.equal(classifyLegacyProductForMigration({
    productFamilyType: "PROVISIONAL_MARKETPLACE",
    sourceCatalog: "EBAY_PRODUCT_FAMILY",
    sourceConfidence: "POSSIBLE",
    hasHighConfidenceIdentifier: false,
  }), "UNRESOLVED_PRODUCT");
  assert.equal(classifyLegacyProductForMigration({
    productFamilyType: "NORMALIZED_MARKETPLACE",
    sourceCatalog: "EBAY_PRODUCT_FAMILY",
    sourceConfidence: "HIGH",
    hasHighConfidenceIdentifier: true,
  }), "REVIEW_FOR_PROMOTION");
  assert.equal(classifyLegacyProductForMigration({
    productFamilyType: "CANONICAL",
    sourceCatalog: "MANUFACTURER",
    sourceConfidence: "SOURCE_VERIFIED",
    hasHighConfidenceIdentifier: true,
  }), "PRESERVE_CANONICAL");
});

test("fitment confidence is translated into customer language", () => {
  assert.equal(getCustomerFitmentLabel("EXACT_MATCH"), "Exact Fit");
  assert.equal(getCustomerFitmentLabel("HIGH"), "Verified Fit");
  assert.equal(getCustomerFitmentLabel("POSSIBLE"), "Likely Fit - Verify Before Purchase");
});
