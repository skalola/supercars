import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFerrariComponentApplicability } from "../lib/parts/ferrari-applicability";

const baseModel = {
  productionStartYear: 2009,
  productionEndYear: 2015,
  engine: "4.5L naturally aspirated V8",
  transmission: "7-speed dual-clutch",
  drivetrain: "RWD",
  bodyStyle: "Berlinetta / Spider",
  category: "Sports Car",
};

test("naturally aspirated Ferrari models reject turbo-only components", () => {
  const result = evaluateFerrariComponentApplicability({ name: "Turbocharger", turboOnly: true }, baseModel);
  assert.equal(result.status, "NOT_APPLICABLE");
  assert.equal(result.publiclyApplicable, false);
  assert.equal(result.confidence, "HIGH");
});

test("turbocharged Ferrari models accept turbo-system components", () => {
  const result = evaluateFerrariComponentApplicability({ name: "Charge Pipes", turboOnly: true }, {
    ...baseModel,
    productionStartYear: 2015,
    productionEndYear: 2019,
    engine: "3.9L twin-turbo V8",
  });
  assert.equal(result.status, "APPLICABLE");
  assert.equal(result.profile.aspiration, "TURBOCHARGED");
});

test("mixed engine families require variant selection for turbo components", () => {
  const result = evaluateFerrariComponentApplicability({ name: "Intercooler", turboOnly: true }, {
    ...baseModel,
    engine: "6.3L V12 / 3.9L twin-turbo V8",
  });
  assert.equal(result.status, "VARIANT_DEPENDENT");
  assert.equal(result.publiclyApplicable, false);
});

test("hybrid components require explicit hybrid evidence", () => {
  const hybrid = evaluateFerrariComponentApplicability({ name: "Hybrid Battery Component", hybridOnly: true }, {
    ...baseModel,
    engine: "4.0L twin-turbo V8 plug-in hybrid",
    category: "Plug-in Hybrid Supercar",
  });
  const combustion = evaluateFerrariComponentApplicability({ name: "Hybrid Battery Component", hybridOnly: true }, baseModel);
  assert.equal(hybrid.status, "APPLICABLE");
  assert.equal(combustion.status, "NOT_APPLICABLE");
});

test("automated-only controls reject manuals and flag mixed transmissions", () => {
  const manual = evaluateFerrariComponentApplicability({ name: "Paddle Shifter" }, { ...baseModel, transmission: "6-speed manual" });
  const mixed = evaluateFerrariComponentApplicability({ name: "Paddle Shifter" }, { ...baseModel, transmission: "6-speed manual / F1 automated manual" });
  assert.equal(manual.status, "NOT_APPLICABLE");
  assert.equal(mixed.status, "VARIANT_DEPENDENT");
});

test("modern electronics are year-dependent across a production threshold", () => {
  const old = evaluateFerrariComponentApplicability({ name: "ECU", modernOnly: true }, { ...baseModel, productionStartYear: 1962, productionEndYear: 1964 });
  const crossing = evaluateFerrariComponentApplicability({ name: "ECU", modernOnly: true }, { ...baseModel, productionStartYear: 1989, productionEndYear: 1995 });
  assert.equal(old.status, "NOT_APPLICABLE");
  assert.equal(crossing.status, "YEAR_DEPENDENT");
});

test("missing powertrain evidence never promotes a constrained component", () => {
  const result = evaluateFerrariComponentApplicability({ name: "Turbocharger", turboOnly: true }, {
    ...baseModel,
    engine: null,
  });
  assert.equal(result.status, "VARIANT_DEPENDENT");
  assert.equal(result.confidence, "LOW");
  assert.equal(result.publiclyApplicable, false);
});

test("ordinary service components remain applicable without speculative fitment", () => {
  const result = evaluateFerrariComponentApplicability({ name: "Oil Filter" }, { ...baseModel, engine: null });
  assert.equal(result.status, "APPLICABLE");
  assert.equal(result.reason, "No model-specific constraint applies to this component.");
});
