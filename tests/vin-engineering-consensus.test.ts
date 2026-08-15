import assert from "node:assert/strict";
import test from "node:test";
import { resolveVinEngineeringConsensus, type VinEngineeringRecord } from "@/lib/parts/vin-engineering-consensus";

test("VIN engineering consensus promotes repeated code and powertrain evidence", () => {
  const result = resolveVinEngineeringConsensus([
    record({ engine: "K20A3", engineHP: "160", transmission: "Automatic", drivetrain: "FWD" }),
    record({ engine: "K20A3", engineHP: "160", transmission: "Automatic", drivetrain: "Front-Wheel Drive" }),
  ]);

  assert.equal(result.engineCode?.value, "K20A3");
  assert.equal(result.engineCode?.confidence, "MEDIUM");
  assert.equal(result.horsepower?.value, 160);
  assert.equal(result.transmissionType?.value, "AUTOMATIC");
  assert.equal(result.drivetrain?.value, "FWD");
});

test("ties remain unresolved instead of selecting an arbitrary VIN value", () => {
  const result = resolveVinEngineeringConsensus([
    record({ engine: "K20A2", transmission: "Manual" }),
    record({ engine: "K20A3", transmission: "Automatic" }),
  ]);

  assert.equal(result.engineCode, null);
  assert.equal(result.transmissionType, null);
});

test("descriptive displacement and cylinder labels are not stored as engine codes", () => {
  const result = resolveVinEngineeringConsensus([record({ engine: "3.9L V8" })]);
  assert.equal(result.engineCode, null);
});

test("explicit turbo and electrification evidence classify aspiration conservatively", () => {
  assert.equal(resolveVinEngineeringConsensus([record({ turbo: "Yes" })]).aspiration?.value, "FORCED_INDUCTION");
  assert.equal(resolveVinEngineeringConsensus([record({ fuelType: "Battery Electric Vehicle" })]).aspiration?.value, "ELECTRIC");
  assert.equal(resolveVinEngineeringConsensus([record()]).aspiration, null);
});

test("records outside model production years cannot contaminate consensus", () => {
  const result = resolveVinEngineeringConsensus([
    record({ year: 2004, engine: "F133E" }),
    record({ year: 2017, engine: "F154BD" }),
    record({ year: 2017, engine: "F154BD" }),
  ], { start: 2002, end: 2006 });

  assert.equal(result.engineCode?.value, "F133E");
  assert.equal(result.engineCode?.supportingRecords, 1);
});

function record(overrides: Partial<VinEngineeringRecord> = {}): VinEngineeringRecord {
  return { year: null, engine: null, engineHP: null, transmission: null, drivetrain: null, turbo: null, fuelType: null, ...overrides };
}
