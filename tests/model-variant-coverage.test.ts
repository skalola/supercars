import assert from "node:assert/strict";
import test from "node:test";
import { analyzeVariantCoverage, normalizeVariantIdentity } from "../lib/model-catalog/variants/coverage";

test("variant identities ignore punctuation and accents", () => {
  assert.equal(normalizeVariantIdentity("Coupé 4MATIC+"), "coupe 4matic");
});

test("coverage distinguishes missing, catalog-only, and source-empty families", () => {
  const coverage = analyzeVariantCoverage(
    [{ name: "Type S", slug: "type-s" }, { name: "A-Spec", slug: "a-spec" }],
    [{ name: "Type S", slug: "type-s" }, { name: "PMC Edition", slug: "pmc-edition" }],
  );
  assert.equal(coverage.status, "PARTIAL");
  assert.deepEqual(coverage.missing.map((item) => item.slug), ["a-spec"]);
  assert.deepEqual(coverage.catalogOnly.map((item) => item.slug), ["pmc-edition"]);

  assert.equal(analyzeVariantCoverage([], []).status, "NO_SOURCE_VARIANTS");
});
