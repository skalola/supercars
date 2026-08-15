import assert from "node:assert/strict";
import test from "node:test";
import { buildPartEngineeringEffect, partEngineeringEffectSchema, SYSTEM_EFFECT_RULES } from "@/lib/parts/part-effects";

test("every automotive system produces a valid structured effect baseline", () => {
  assert.equal(Object.keys(SYSTEM_EFFECT_RULES).length, 17);
  for (const categorySlug of Object.keys(SYSTEM_EFFECT_RULES)) {
    const effect = buildPartEngineeringEffect({ categorySlug, componentName: "Representative component" });
    assert.equal(partEngineeringEffectSchema.safeParse(effect).success, true, categorySlug);
    assert.equal(effect.benefits.some((benefit) => benefit.measurable), false);
  }
});

test("forced-induction components require fuel, calibration, and thermal support", () => {
  const effect = buildPartEngineeringEffect({ categorySlug: "air-induction", componentName: "Turbocharger" });
  assert.equal(effect.primaryDimension, "POWER");
  assert.deepEqual(effect.dependencies.filter((item) => item.level === "REQUIRED").map((item) => item.systemSlug), [
    "fuel-system",
    "ecu-electronics",
    "cooling",
  ]);
  assert.equal(effect.risks.some((item) => item.code === "BOOST_SYSTEM_OVERLOAD"), true);
});

test("system baselines disclose qualitative confidence instead of inventing gains", () => {
  const effect = buildPartEngineeringEffect({ categorySlug: "brakes", componentName: "Front Brake Pads" });
  assert.equal(effect.confidence, "LOW");
  assert.match(effect.evidenceBasis, /numerical effects require/i);
  assert.equal(effect.benefits[0].measurable, false);
});
