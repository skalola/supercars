import assert from "node:assert/strict";
import test from "node:test";
import type { VehicleBuildProfile } from "@/lib/parts/build-profile";
import type { CandidateEngineeringChange } from "@/lib/parts/constraint-engine";
import { ENGINEERING_CONTRACT_VERSION, type EngineeringBuildRequest, type VehicleEngineeringProfile } from "@/lib/parts/engineering-contract";
import { buildPartEngineeringEffect } from "@/lib/parts/part-effects";
import { optimizeEngineeringRecommendations } from "@/lib/parts/recommendation-optimizer";

const request: EngineeringBuildRequest = {
  intention: "STREET_BALANCED",
  constraints: [],
  currentMileage: 42_000,
  plannedUseFrequency: "WEEKLY",
};

test("explanation resolves only evidence referenced by the recommendation", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle(),
    build: build(),
    request,
    candidates: [candidate("ECU Calibration", "ecu-electronics", null, null)],
  });
  const explanation = result.ranked[0]?.evidenceExplanation;
  assert.deepEqual(explanation?.evidence.map((item) => item.id), ["power-source"]);
  assert.equal(explanation?.evidence.some((item) => item.id === "unrelated-source"), false);
});

test("unsupported numerical gains are explicitly labeled as estimates", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle(),
    build: build(),
    request,
    candidates: [candidate("ECU Calibration", "ecu-electronics", 12, 10)],
  });
  const explanation = result.ranked[0]?.evidenceExplanation;
  assert.equal(explanation?.claims.some((claim) => claim.status === "ESTIMATE"), true);
  assert.equal(explanation?.numericalClaimsVerified, false);
  assert.match(explanation?.confidence.explanation ?? "", /remain estimates/i);
});

test("part-specific evidence can promote a numerical claim to source-backed", () => {
  const documented = candidate("Documented ECU Calibration", "ecu-electronics", 12, 10);
  documented.effect = { ...documented.effect, confidence: "MEDIUM", evidenceBasis: "Part-specific manufacturer test data." };
  documented.estimatedGainConfidence = "MEDIUM";
  documented.estimatedHpGainEvidenceIds = ["dyno-source"];
  documented.estimatedTorqueGainEvidenceIds = ["dyno-source"];
  documented.performanceEvidence = [{
    id: "dyno-source",
    sourceType: "DYNO_TEST",
    sourceName: "Exact-vehicle dyno test",
    sourceUrl: "https://example.com/dyno",
    capturedAt: new Date("2026-01-02"),
    confidence: "MEDIUM",
    notes: "Same model and configuration.",
  }];
  const result = optimizeEngineeringRecommendations({ vehicle: vehicle(), build: build(), request, candidates: [documented] });
  const explanation = result.ranked[0]?.evidenceExplanation;
  assert.equal(explanation?.claims.some((claim) => claim.status === "SOURCE_BACKED"), true);
  assert.equal(explanation?.numericalClaimsVerified, true);
  assert.equal(explanation?.evidence.some((item) => item.id === "dyno-source"), true);
});

test("missing specifications are disclosed in plain language", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle({ measurements: [], transmission: "UNKNOWN", thermal: null }),
    build: build({ stockHorsepower: null, stockTorque: null }),
    request,
    candidates: [candidate("Cooling Package", "cooling", null, null)],
  });
  const disclosure = result.ranked[0]?.evidenceExplanation.missingDataDisclosure;
  assert.match(disclosure ?? "", /stock horsepower/i);
  assert.match(disclosure ?? "", /transmission type/i);
  assert.match(disclosure ?? "", /cooling capacity/i);
});

test("warnings include constraint findings and component risks", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle(),
    build: build({ recordedHpGain: 35, hpGainRatio: 0.22 }),
    request: { ...request, currentMileage: 120_000 },
    candidates: [candidate("ECU Calibration", "ecu-electronics", 12, 10)],
  });
  const warnings = result.ranked[0]?.evidenceExplanation.warnings.join(" ") ?? "";
  assert.match(warnings, /high-mileage/i);
  assert.match(warnings, /calibration/i);
});

function candidate(name: string, systemSlug: string, hp: number | null, torque: number | null): CandidateEngineeringChange {
  return {
    componentTypeId: name.toLowerCase().replaceAll(" ", "-"),
    componentName: name,
    systemSlug,
    estimatedHpGain: hp,
    estimatedTorqueGain: torque,
    priceCents: 80_000,
    effect: buildPartEngineeringEffect({ categorySlug: systemSlug, componentName: name }),
  };
}

function vehicle(overrides: Partial<VehicleEngineeringProfile> = {}): VehicleEngineeringProfile {
  return {
    contractVersion: ENGINEERING_CONTRACT_VERSION,
    makeId: "acura",
    modelId: "rsx",
    variantId: null,
    year: 2006,
    engineCode: "K20A3",
    aspiration: "NATURALLY_ASPIRATED",
    drivetrain: "FWD",
    transmission: "AUTOMATIC",
    measurements: [
      { dimension: "POWER", value: 160, minimum: null, maximum: null, unit: "hp", confidence: "MEDIUM", evidenceIds: ["power-source"], derivedFrom: [] },
      { dimension: "TORQUE", value: 141, minimum: null, maximum: null, unit: "lb-ft", confidence: "MEDIUM", evidenceIds: ["torque-source"], derivedFrom: [] },
      { dimension: "MASS", value: 2_800, minimum: null, maximum: null, unit: "lb", confidence: "MEDIUM", evidenceIds: ["mass-source"], derivedFrom: [] },
    ],
    tires: { frontWidthMm: 205, rearWidthMm: 205, frontDiameterInches: 16, rearDiameterInches: 16, compound: null, loadRating: null },
    brakes: { frontRotorDiameterMm: 262, rearRotorDiameterMm: 260, frontPistonCount: null, rearPistonCount: null, rotorMaterial: "iron" },
    thermal: { oilCooling: "factory", chargeCooling: null, transmissionCooling: "factory", brakeCooling: null, sustainedUseRating: "STREET" },
    evidence: [
      { id: "power-source", sourceType: "OEM_SPECIFICATION", sourceName: "OEM power specification", sourceUrl: null, capturedAt: new Date("2026-01-01"), confidence: "MEDIUM", notes: null },
      { id: "torque-source", sourceType: "OEM_SPECIFICATION", sourceName: "OEM torque specification", sourceUrl: null, capturedAt: new Date("2026-01-01"), confidence: "MEDIUM", notes: null },
      { id: "mass-source", sourceType: "TRUSTED_REFERENCE", sourceName: "Vehicle weight reference", sourceUrl: null, capturedAt: new Date("2026-01-01"), confidence: "MEDIUM", notes: null },
      { id: "unrelated-source", sourceType: "TRUSTED_REFERENCE", sourceName: "Unrelated source", sourceUrl: null, capturedAt: new Date("2026-01-01"), confidence: "HIGH", notes: null },
    ],
    ...overrides,
  };
}

function build(overrides: Partial<VehicleBuildProfile> = {}): VehicleBuildProfile {
  return {
    stage: "STOCK",
    aspiration: "NATURALLY_ASPIRATED",
    drivetrain: "FWD",
    stockHorsepower: 160,
    stockTorque: 141,
    recordedHpGain: 0,
    recordedTorqueGain: 0,
    hpGainRatio: 0,
    torqueGainRatio: 0,
    installedCategories: new Set(),
    installedLabels: new Map(),
    supportNeeds: new Set(),
    ...overrides,
  };
}
