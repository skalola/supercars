import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyEngineeringAspiration,
  classifyEngineeringDrivetrain,
  classifyEngineeringTransmission,
  normalizeHorsepower,
  normalizeTorqueLbFt,
  normalizeWeightLb,
} from "@/lib/parts/engineering-normalization";

test("engineering values convert only when source units are explicit", () => {
  assert.equal(normalizeHorsepower("562 hp"), 562);
  assert.equal(normalizeHorsepower("419 kW"), 562);
  assert.equal(normalizeTorqueLbFt("540 N·m"), 398);
  assert.equal(normalizeTorqueLbFt("398 lb-ft"), 398);
  assert.equal(normalizeWeightLb("1,485 kg"), 3274);
  assert.equal(normalizeWeightLb("3,274 lb"), 3274);
  assert.equal(normalizeWeightLb(null), null);
});

test("powertrain classifiers preserve unknowns instead of guessing", () => {
  assert.equal(classifyEngineeringAspiration("3.9L twin-turbo V8"), "FORCED_INDUCTION");
  assert.equal(classifyEngineeringAspiration("4.5L V8"), "UNKNOWN");
  assert.equal(classifyEngineeringDrivetrain("MR"), "RWD");
  assert.equal(classifyEngineeringTransmission("7-speed dual-clutch"), "DCT");
  assert.equal(classifyEngineeringTransmission("gearbox"), "UNKNOWN");
});
