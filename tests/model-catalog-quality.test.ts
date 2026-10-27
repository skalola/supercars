import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCatalogIdentity } from "@/lib/model-catalog/lineup/quality-gate";
import { dedupeMaintenanceRules } from "@/lib/maintenance/applicability";

test("NHTSA-only unknown names are reviewed instead of silently becoming model families", () => {
  const result = evaluateCatalogIdentity({
    sourceType: "NHTSA", sourceName: "NHTSA vPIC", makeName: "BMW", modelName: "M3 Competition xDrive",
    productionStartYear: 2024, productionEndYear: 2025, confidence: "MEDIUM",
  }, []);
  assert.equal(result.action, "REVIEW");
  assert.equal(result.reviewStatus, "NEEDS_REVIEW");
});

test("official source can establish a missing canonical family", () => {
  const result = evaluateCatalogIdentity({
    sourceType: "OEM", sourceName: "Manufacturer heritage catalog", sourceUrl: "https://example.test/models",
    makeName: "Honda", modelName: "Prelude", canonicalFamilyName: "Prelude", confidence: "SOURCE_VERIFIED",
  }, []);
  assert.equal(result.action, "CREATE_MODEL");
  assert.equal(result.reviewStatus, "SOURCE_VERIFIED");
});

test("specific maintenance guidance overrides universal guidance for the same service", () => {
  const rows = dedupeMaintenanceRules([
    { category: "ENGINE", serviceName: "Engine oil", scope: "UNIVERSAL", confidence: "LOW" },
    { category: "ENGINE", serviceName: "Engine oil", scope: "MODEL", confidence: "SOURCE_VERIFIED" },
  ] as never);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scope, "MODEL");
});
