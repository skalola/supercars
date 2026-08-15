import assert from "node:assert/strict";
import test from "node:test";
import type { VehicleBuildProfile } from "@/lib/parts/build-profile";
import type { CandidateEngineeringChange } from "@/lib/parts/constraint-engine";
import { ENGINEERING_CONTRACT_VERSION, type EngineeringBuildRequest, type VehicleEngineeringProfile } from "@/lib/parts/engineering-contract";
import { buildPartEngineeringEffect } from "@/lib/parts/part-effects";
import { optimizeEngineeringRecommendations } from "@/lib/parts/recommendation-optimizer";

const streetRequest: EngineeringBuildRequest = {
  intention: "STREET_BALANCED",
  constraints: [],
  currentMileage: 45_000,
  plannedUseFrequency: "WEEKLY",
};

test("track build ranks the component that addresses its stressed system", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle(),
    build: build({ stage: "HIGH_OUTPUT", recordedHpGain: 70, recordedTorqueGain: 65, hpGainRatio: 0.44, torqueGainRatio: 0.46 }),
    request: { ...streetRequest, intention: "TRACK_DAY" },
    candidates: [candidate("Cold Air Intake", "air-induction", 7, 5), candidate("Brake Pad Set", "brakes", null, null)],
  });
  assert.equal(result.limitingFactor, "BRAKING");
  assert.equal(result.ranked[0]?.candidate.componentName, "Brake Pad Set");
  assert.equal(result.ranked[0]?.recommendation.limitingFactor, "BRAKING");
});

test("hard incompatibilities are excluded instead of receiving a low rank", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle({ aspiration: "ELECTRIC", transmission: "SINGLE_SPEED", engineCode: null }),
    build: build({ aspiration: "ELECTRIC" }),
    request: streetRequest,
    candidates: [candidate("Cold Air Intake", "air-induction", null, null), candidate("Tire Set", "wheels-tires", null, null)],
  });
  assert.equal(result.excluded.length, 1);
  assert.equal(result.excluded[0]?.candidate.componentName, "Cold Air Intake");
  assert.equal(result.ranked.some((item) => item.candidate.componentName === "Cold Air Intake"), false);
});

test("budget constraint excludes unaffordable candidates", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle(),
    build: build(),
    request: {
      ...streetRequest,
      constraints: [{ type: "BUDGET", enabled: true, numericLimit: 100_000, unit: "cents", value: null }],
    },
    candidates: [
      { ...candidate("Affordable Tire Set", "wheels-tires", null, null), priceCents: 90_000 },
      { ...candidate("Premium Tire Set", "wheels-tires", null, null), priceCents: 180_000 },
    ],
  });
  assert.deepEqual(result.ranked.map((item) => item.candidate.componentName), ["Affordable Tire Set"]);
  assert.deepEqual(result.excluded.map((item) => item.candidate.componentName), ["Premium Tire Set"]);
});

test("unknown data lowers confidence without inventing numerical gains", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle({ measurements: [], transmission: "UNKNOWN", drivetrain: "UNKNOWN", thermal: null }),
    build: build({ stockHorsepower: null, stockTorque: null }),
    request: streetRequest,
    candidates: [candidate("Cooling Package", "cooling", null, null)],
  });
  const recommendation = result.ranked[0]?.recommendation;
  assert.equal(recommendation?.confidence, "LOW");
  assert.equal(recommendation?.expectedBenefits.every((benefit) => benefit.measurement === null), true);
  assert.equal(recommendation?.missingData.includes("horsepower"), true);
});

test("documented gains are carried into structured benefits", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle(),
    build: build(),
    request: streetRequest,
    candidates: [candidate("ECU Calibration", "ecu-electronics", 12, 10)],
  });
  const powerBenefit = result.ranked[0]?.recommendation.expectedBenefits.find((benefit) => benefit.dimension === "POWER");
  assert.equal(powerBenefit?.measurement?.value, 12);
  assert.equal(powerBenefit?.measurement?.unit, "hp");
});

function candidate(name: string, systemSlug: string, hp: number | null, torque: number | null): CandidateEngineeringChange {
  return {
    componentTypeId: name.toLowerCase().replaceAll(" ", "-"),
    componentName: name,
    systemSlug,
    estimatedHpGain: hp,
    estimatedTorqueGain: torque,
    priceCents: null,
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
      { dimension: "POWER", value: 160, minimum: null, maximum: null, unit: "hp", confidence: "MEDIUM", evidenceIds: ["power"], derivedFrom: [] },
      { dimension: "TORQUE", value: 141, minimum: null, maximum: null, unit: "lb-ft", confidence: "MEDIUM", evidenceIds: ["torque"], derivedFrom: [] },
      { dimension: "MASS", value: 2_800, minimum: null, maximum: null, unit: "lb", confidence: "MEDIUM", evidenceIds: ["mass"], derivedFrom: [] },
    ],
    tires: { frontWidthMm: 205, rearWidthMm: 205, frontDiameterInches: 16, rearDiameterInches: 16, compound: null, loadRating: null },
    brakes: { frontRotorDiameterMm: 262, rearRotorDiameterMm: 260, frontPistonCount: null, rearPistonCount: null, rotorMaterial: "iron" },
    thermal: { oilCooling: "factory", chargeCooling: null, transmissionCooling: "factory", brakeCooling: null, sustainedUseRating: "STREET" },
    evidence: [],
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
