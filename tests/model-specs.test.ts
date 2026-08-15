import assert from "node:assert/strict";
import test from "node:test";
import { fillMissingModelSpec, resolveVinDecodedModelSpec } from "@/lib/model-catalog/model-specs";

test("VIN-derived model specs use consensus values and skip ties", () => {
  const resolved = resolveVinDecodedModelSpec([
    { engine: "K20A3", displacement: "2.0", engineCylinders: "4", engineHP: "160", transmission: "Automatic", drivetrain: null },
    { engine: "K20A3", displacement: "2.0", engineCylinders: "4", engineHP: "160", transmission: "Automatic", drivetrain: "FWD" },
    { engine: "K20A2", displacement: "2.0", engineCylinders: "4", engineHP: "200", transmission: "Manual", drivetrain: "FWD" },
  ]);

  assert.equal(resolved.engine, "K20A3");
  assert.equal(resolved.horsepower, "160");
  assert.equal(resolved.transmission, "Automatic");
  assert.equal(resolved.drivetrain, "FWD");
});

test("model spec enrichment fills blanks without replacing canonical data", () => {
  const { resolved, filledFields } = fillMissingModelSpec(
    { engine: "4.5L V8", horsepower: "563 HP", torque: null },
    [{ engine: "VIN engine value", horsepower: "570", torque: "398.5 ft-lb", weight: "3274 lbs." }],
  );

  assert.equal(resolved.engine, "4.5L V8");
  assert.equal(resolved.horsepower, "563 HP");
  assert.equal(resolved.torque, "398.5 ft-lb");
  assert.equal(resolved.weight, "3274 lbs.");
  assert.deepEqual(filledFields, ["torque", "weight"]);
});
