import assert from "node:assert/strict";
import test from "node:test";
import type { VehicleBuildProfile } from "@/lib/parts/build-profile";
import { analyzeEngineeringConstraints, type CandidateEngineeringChange } from "@/lib/parts/constraint-engine";
import { ENGINEERING_CONTRACT_VERSION, type EngineeringBuildRequest, type VehicleEngineeringProfile } from "@/lib/parts/engineering-contract";
import { buildPartEngineeringEffect } from "@/lib/parts/part-effects";

const baseRequest: EngineeringBuildRequest = {
  intention: "STREET_BALANCED",
  constraints: [],
  currentMileage: 40_000,
  plannedUseFrequency: "WEEKLY",
};

test("stock vehicle produces low documented load without blockers", () => {
  const result = analyzeEngineeringConstraints({ vehicle: vehicle(), build: build(), request: baseRequest });
  assert.equal(result.loads.transmissionStress.level, "LOW");
  assert.equal(result.loads.tractionDemand.level, "LOW");
  assert.equal(result.canRecommend, true);
  assert.deepEqual(result.hardIncompatibilities, []);
});

test("high-output forced-induction change exposes supporting-system demand", () => {
  const result = analyzeEngineeringConstraints({
    vehicle: vehicle(),
    build: build({ stage: "HIGH_OUTPUT", recordedHpGain: 120, recordedTorqueGain: 110, hpGainRatio: 0.6, torqueGainRatio: 0.69 }),
    request: { ...baseRequest, intention: "TRACK_DAY" },
    candidate: candidate("Turbocharger", "air-induction", 80, 90),
  });
  assert.equal(result.loads.transmissionStress.level, "HIGH");
  assert.equal(result.loads.thermalLoad.level, "HIGH");
  assert.equal(result.loads.brakingDemand.level, "HIGH");
  assert.equal(result.supportingRequirements.includes("fuel-system"), true);
  assert.equal(result.supportingRequirements.includes("cooling"), true);
  assert.equal(result.findings.some((item) => item.code === "HIGH_DRIVETRAIN_CAPACITY_DEMAND"), true);
});

test("unknown specifications remain unknown rather than producing invented capacity", () => {
  const incomplete = vehicle({
    transmission: "UNKNOWN",
    drivetrain: "UNKNOWN",
    measurements: [],
    tires: null,
    brakes: null,
    thermal: null,
  });
  const result = analyzeEngineeringConstraints({ vehicle: incomplete, build: build({ stockHorsepower: null, stockTorque: null }), request: baseRequest });
  assert.equal(result.loads.transmissionStress.level, "UNKNOWN");
  assert.equal(result.loads.tractionDemand.level, "UNKNOWN");
  assert.equal(result.missingData.includes("torque"), true);
  assert.equal(result.missingData.includes("thermal"), true);
});

test("electric vehicles hard-block combustion-only candidates", () => {
  const result = analyzeEngineeringConstraints({
    vehicle: vehicle({ aspiration: "ELECTRIC", engineCode: null, transmission: "SINGLE_SPEED" }),
    build: build({ aspiration: "ELECTRIC" }),
    request: baseRequest,
    candidate: candidate("Cold Air Intake", "air-induction", null, null),
  });
  assert.equal(result.canRecommend, false);
  assert.equal(result.findings.some((item) => item.severity === "HARD_BLOCKER"), true);
});

test("budget and high-mileage constraints are enforced", () => {
  const result = analyzeEngineeringConstraints({
    vehicle: vehicle(),
    build: build({ recordedHpGain: 20, hpGainRatio: 0.1 }),
    request: {
      ...baseRequest,
      currentMileage: 120_000,
      constraints: [{ type: "BUDGET", enabled: true, numericLimit: 50_000, unit: "cents", value: null }],
    },
    candidate: { ...candidate("ECU Calibration", "ecu-electronics", 15, 10), priceCents: 90_000 },
  });
  assert.equal(result.canRecommend, false);
  assert.equal(result.findings.some((item) => item.code === "BUDGET_EXCEEDED"), true);
  assert.equal(result.findings.some((item) => item.code === "HIGH_MILEAGE_OUTPUT_INCREASE"), true);
});

test("canonical dependencies recognize installed storefront category aliases", () => {
  const result = analyzeEngineeringConstraints({
    vehicle: vehicle(),
    build: build({ installedCategories: new Set(["fueling", "ecu-tuning", "cooling"]) }),
    request: baseRequest,
    candidate: candidate("Turbocharger", "air-induction", 40, 45),
  });
  assert.equal(result.findings.some((item) => item.code === "MISSING_REQUIRED_FUEL_SYSTEM"), false);
  assert.equal(result.findings.some((item) => item.code === "MISSING_REQUIRED_ECU_ELECTRONICS"), false);
  assert.equal(result.findings.some((item) => item.code === "MISSING_REQUIRED_COOLING"), false);
});

function candidate(name: string, systemSlug: string, hp: number | null, torque: number | null): CandidateEngineeringChange {
  return {
    componentTypeId: "component-1",
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
