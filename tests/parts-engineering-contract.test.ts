import assert from "node:assert/strict";
import test from "node:test";
import {
  ENGINEERING_CONTRACT_VERSION,
  auditVehicleEngineeringProfile,
  engineeringMeasurementSchema,
  type VehicleEngineeringProfile,
} from "@/lib/parts/engineering-contract";

test("engineering measurements enforce dimension-specific units", () => {
  assert.equal(engineeringMeasurementSchema.safeParse({
    dimension: "POWER",
    value: 300,
    unit: "hp",
    confidence: "MEDIUM",
  }).success, true);

  assert.equal(engineeringMeasurementSchema.safeParse({
    dimension: "POWER",
    value: 300,
    unit: "lb-ft",
    confidence: "MEDIUM",
  }).success, false);
});

test("high-confidence measurements require evidence", () => {
  assert.equal(engineeringMeasurementSchema.safeParse({
    dimension: "TORQUE",
    value: 280,
    unit: "lb-ft",
    confidence: "HIGH",
    evidenceIds: [],
  }).success, false);
});

test("vehicle profile audit blocks engineering claims when critical systems are missing", () => {
  const profile: VehicleEngineeringProfile = {
    contractVersion: ENGINEERING_CONTRACT_VERSION,
    makeId: "make-1",
    modelId: "model-1",
    variantId: null,
    year: 2006,
    engineCode: "K20A3",
    aspiration: "NATURALLY_ASPIRATED",
    drivetrain: "FWD",
    transmission: "AUTOMATIC",
    measurements: [{
      dimension: "POWER",
      value: 160,
      minimum: null,
      maximum: null,
      unit: "hp",
      confidence: "MEDIUM",
      evidenceIds: ["vin-decode"],
      derivedFrom: [],
    }],
    tires: null,
    brakes: null,
    thermal: null,
    evidence: [],
  };

  const audit = auditVehicleEngineeringProfile(profile);
  assert.equal(audit.complete, false);
  assert.equal(audit.numericalRecommendationReady, false);
  assert.equal(audit.constraintAnalysisReady, false);
  assert.deepEqual(audit.missing, ["torque", "weight", "tires", "brakes", "thermal"]);
});
