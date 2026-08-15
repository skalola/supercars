import assert from "node:assert/strict";
import test from "node:test";
import type { VehicleBuildProfile } from "@/lib/parts/build-profile";
import { analyzeEngineeringConstraints, type CandidateEngineeringChange } from "@/lib/parts/constraint-engine";
import {
  ENGINEERING_CONTRACT_VERSION,
  type DrivetrainLayout,
  type EngineeringBuildRequest,
  type VehicleEngineeringProfile,
} from "@/lib/parts/engineering-contract";
import { buildPartEngineeringEffect } from "@/lib/parts/part-effects";
import { optimizeEngineeringRecommendations } from "@/lib/parts/recommendation-optimizer";

const streetRequest = request("STREET_BALANCED");

test("stock street build prioritizes condition before adding output", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle(),
    build: build(),
    request: streetRequest,
    candidates: [
      candidate("Engine Air Filter", "maintenance-service"),
      candidate("Cold Air Intake", "air-induction", 7, 5),
      candidate("Brake Pad Set", "brakes"),
      candidate("Performance Tire Set", "wheels-tires"),
    ],
  });

  assert.equal(result.limitingFactor, "RELIABILITY");
  assert.equal(result.ranked[0]?.candidate.componentName, "Engine Air Filter");
  assert.equal(result.ranked[0]?.recommendation.expectedBenefits.every((benefit) => benefit.measurement === null), true);
});

test("naturally aspirated street build does not promote unsupported forced induction first", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle(),
    build: build(),
    request: streetRequest,
    candidates: [
      candidate("Turbocharger", "air-induction", 80, 75),
      candidate("Performance Tire Set", "wheels-tires"),
    ],
  });
  const turbo = result.ranked.find((item) => item.candidate.componentName === "Turbocharger");

  assert.notEqual(result.ranked[0]?.candidate.componentName, "Turbocharger");
  assert.ok(turbo);
  assert.equal(turbo.constraints.supportingRequirements.includes("fuel-system"), true);
  assert.equal(turbo.constraints.supportingRequirements.includes("ecu-electronics"), true);
  assert.equal(turbo.constraints.supportingRequirements.includes("cooling"), true);
});

test("high-output forced-induction build prioritizes its greatest calculated load", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle({ aspiration: "FORCED_INDUCTION", drivetrain: "RWD", transmission: "DCT" }),
    build: build({
      stage: "HIGH_OUTPUT",
      aspiration: "FORCED_INDUCTION",
      drivetrain: "RWD",
      recordedHpGain: 110,
      recordedTorqueGain: 105,
      hpGainRatio: 0.46,
      torqueGainRatio: 0.5,
      supportNeeds: new Set(["cooling", "transmission-drivetrain"]),
    }),
    request: streetRequest,
    candidates: [
      candidate("Differential Upgrade", "transmission-drivetrain"),
      candidate("Cooling Package", "cooling"),
      candidate("Cold Air Intake", "air-induction", 8, 6),
    ],
  });

  assert.equal(result.limitingFactor, "THERMAL_CAPACITY");
  assert.equal(result.ranked[0]?.candidate.componentName, "Cooling Package");
  assert.equal(result.ranked[0]?.constraints.loads.transmissionStress.level, "HIGH");
});

test("known automatic transmissions reject manual-only hardware", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle({ transmission: "AUTOMATIC" }),
    build: build(),
    request: streetRequest,
    candidates: [candidate("Short Shifter", "transmission-drivetrain")],
  });

  assert.equal(result.ranked.length, 0);
  assert.equal(result.excluded[0]?.constraints.findings.some((finding) => finding.code === "TRANSMISSION_TYPE_INCOMPATIBLE"), true);
});

test("unknown transmissions withhold manual-only hardware until verified", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle({ transmission: "UNKNOWN" }),
    build: build(),
    request: streetRequest,
    candidates: [candidate("Clutch Kit", "transmission-drivetrain")],
  });

  assert.equal(result.ranked.length, 0);
  assert.equal(result.excluded[0]?.constraints.findings.some((finding) => finding.code === "MANUAL_TRANSMISSION_NOT_VERIFIED"), true);
});

test("verified manual transmissions remain eligible for manual hardware", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle({ transmission: "MANUAL" }),
    build: build(),
    request: streetRequest,
    candidates: [candidate("Short Shifter", "transmission-drivetrain")],
  });

  assert.equal(result.excluded.length, 0);
  assert.equal(result.ranked[0]?.candidate.componentName, "Short Shifter");
});

test("traction demand reflects FWD, RWD, and AWD layouts programmatically", () => {
  const ratios = Object.fromEntries((["FWD", "RWD", "AWD"] as DrivetrainLayout[]).map((drivetrain) => {
    const result = analyzeEngineeringConstraints({
      vehicle: vehicle({ drivetrain }),
      build: build({ drivetrain, recordedHpGain: 24, recordedTorqueGain: 21, hpGainRatio: 0.15, torqueGainRatio: 0.15 }),
      request: streetRequest,
    });
    return [drivetrain, result.loads.tractionDemand.ratio];
  }));

  assert.ok(ratios.FWD !== null && ratios.RWD !== null && ratios.AWD !== null);
  assert.ok(ratios.FWD > ratios.RWD);
  assert.ok(ratios.RWD > ratios.AWD);
});

test("high-mileage builds surface inspection requirements and favor reliability", () => {
  const highMileageRequest: EngineeringBuildRequest = {
    ...streetRequest,
    currentMileage: 125_000,
    constraints: [{ type: "HIGH_MILEAGE", enabled: true, numericLimit: null, unit: null, value: null }],
  };
  const ecu = candidate("ECU Tune", "ecu-electronics", 20, 17);
  const analysis = analyzeEngineeringConstraints({ vehicle: vehicle(), build: build(), request: highMileageRequest, candidate: ecu });
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle(),
    build: build(),
    request: highMileageRequest,
    candidates: [ecu, candidate("Engine Air Filter", "maintenance-service")],
  });

  assert.equal(analysis.findings.some((finding) => finding.code === "HIGH_MILEAGE_OUTPUT_INCREASE"), true);
  assert.equal(analysis.supportingRequirements.includes("pre-upgrade mechanical inspection"), true);
  assert.equal(result.ranked[0]?.candidate.componentName, "Engine Air Filter");
});

test("track intent prioritizes braking while balanced street intent prioritizes traction", () => {
  const candidates = [candidate("Brake Pad Set", "brakes"), candidate("Performance Tire Set", "wheels-tires")];
  const track = optimizeEngineeringRecommendations({ vehicle: vehicle(), build: build(), request: request("TRACK_DAY"), candidates });
  const street = optimizeEngineeringRecommendations({ vehicle: vehicle(), build: build(), request: streetRequest, candidates });

  assert.equal(track.limitingFactor, "BRAKING");
  assert.equal(track.ranked[0]?.candidate.componentName, "Brake Pad Set");
  assert.equal(street.ranked[0]?.candidate.componentName, "Performance Tire Set");
});

test("daily forced-induction use exposes thermal load and prioritizes cooling", () => {
  const result = optimizeEngineeringRecommendations({
    vehicle: vehicle({ aspiration: "FORCED_INDUCTION", drivetrain: "AWD", transmission: "DCT" }),
    build: build({
      stage: "BOLT_ON",
      aspiration: "FORCED_INDUCTION",
      drivetrain: "AWD",
      recordedHpGain: 16,
      recordedTorqueGain: 15,
      hpGainRatio: 0.1,
      torqueGainRatio: 0.1,
    }),
    request: { ...request("DAILY_DRIVER"), plannedUseFrequency: "DAILY" },
    candidates: [candidate("Cooling Package", "cooling"), candidate("Cold Air Intake", "air-induction", 6, 4)],
  });

  assert.equal(result.limitingFactor, "THERMAL_CAPACITY");
  assert.equal(result.ranked[0]?.candidate.componentName, "Cooling Package");
  assert.notEqual(result.ranked[0]?.constraints.loads.thermalLoad.level, "LOW");
});

function request(intention: EngineeringBuildRequest["intention"]): EngineeringBuildRequest {
  return { intention, constraints: [], currentMileage: 45_000, plannedUseFrequency: "WEEKLY" };
}

function candidate(name: string, systemSlug: string, hp: number | null = null, torque: number | null = null): CandidateEngineeringChange {
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
