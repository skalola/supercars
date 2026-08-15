import assert from "node:assert/strict";
import test from "node:test";
import { buildVehiclePerformanceProfile } from "../lib/parts/build-profile";
import { describeVehicleBuild, rankBuildAwarePartRecommendations } from "../lib/parts/recommendations";

function candidate(
  id: string,
  category: string,
  options?: { modelFitment?: boolean; hpGain?: number; name?: string; description?: string; fitmentNotes?: string },
) {
  return {
    id,
    name: options?.name || `${category} part`,
    description: options?.description,
    estimatedHpGain: options?.hpGain ?? 0,
    category: { name: category, slug: category },
    compatibility: [{
      makeId: "make-1",
      modelId: options?.modelFitment === false ? null : "model-1",
      notes: options?.fitmentNotes,
    }],
  };
}

test("build-aware recommendations complement installed power modifications", () => {
  const recommendations = rankBuildAwarePartRecommendations({
    candidates: [
      candidate("brakes", "brakes"),
      candidate("ecu", "ecu-tuning", { hpGain: 25 }),
      candidate("cooling", "cooling"),
      candidate("aero", "aero-body"),
    ],
    installedParts: [
      {
        part: {
          name: "Cold Air Intake",
          estimatedHpGain: 12,
          category: { name: "Intake", slug: "intake" },
        },
      },
      {
        part: {
          name: "Cat-back Exhaust",
          estimatedHpGain: 18,
          category: { name: "Exhaust", slug: "exhaust" },
        },
      },
    ],
    vehicle: { engine: "2.0L I4" },
  });

  assert.equal(recommendations[0]?.id, "ecu");
  assert.match(recommendations[0]?.recommendationReason || "", /Coordinates the power parts/);
  assert.equal(new Set(recommendations.map((part) => part.category.slug)).size, recommendations.length);
});

test("naturally aspirated builds do not receive premature forced-induction recommendations", () => {
  const recommendations = rankBuildAwarePartRecommendations({
    candidates: [
      candidate("turbo", "forced-induction", { hpGain: 180 }),
      candidate("brakes", "brakes"),
      candidate("tires", "wheels-tires"),
    ],
    installedParts: [],
    vehicle: { engine: "3.5L V6" },
  });

  assert.equal(recommendations.some((part) => part.id === "turbo"), false);
  assert.equal(recommendations[0]?.id, "brakes");
});

test("higher-output builds prioritize supporting systems", () => {
  const recommendations = rankBuildAwarePartRecommendations({
    candidates: [
      candidate("aero", "aero-body"),
      candidate("cooling", "cooling"),
      candidate("drivetrain", "drivetrain"),
    ],
    installedParts: [
      {
        hpGainOverride: 90,
        part: {
          name: "ECU Calibration",
          estimatedHpGain: 45,
          category: { name: "ECU & Tuning", slug: "ecu-tuning" },
        },
      },
    ],
    vehicle: { engine: "Twin-turbo V8", stockHorsepower: 300 },
  });

  assert.equal(recommendations[0]?.id, "cooling");
  assert.match(recommendations[0]?.recommendationReason || "", /thermal support.*high-output/);
});

test("automatic vehicles reject manual-only parts before recommendation scoring", () => {
  const recommendations = rankBuildAwarePartRecommendations({
    candidates: [
      candidate("manual-shifter", "drivetrain", {
        name: "Billet Short Shifter",
        fitmentNotes: "Manual transmission fitment.",
      }),
      candidate("intake", "intake", { name: "Cold Air Intake", hpGain: 8 }),
      candidate("brakes", "brakes", { name: "Brake Kit" }),
    ],
    installedParts: [],
    vehicle: { engine: "2.0L I4", transmission: "Automatic" },
  });

  assert.equal(recommendations.some((part) => part.id === "manual-shifter"), false);
  assert.equal(recommendations.some((part) => part.id === "intake"), true);
});

test("manual vehicles remain eligible for verified manual drivetrain parts", () => {
  const recommendations = rankBuildAwarePartRecommendations({
    candidates: [
      candidate("manual-shifter", "drivetrain", {
        name: "Billet Short Shifter",
        fitmentNotes: "Manual transmission fitment.",
      }),
    ],
    installedParts: [],
    vehicle: { engine: "2.0L I4", transmission: "6-speed manual" },
  });

  assert.equal(recommendations[0]?.id, "manual-shifter");
});

test("parts needing trim confirmation are withheld until the vehicle trim is known", () => {
  const recommendations = rankBuildAwarePartRecommendations({
    candidates: [
      candidate("trim-specific-intake", "intake", {
        name: "Trim-Specific Short Ram Intake",
        fitmentNotes: "Verify trim before purchase.",
        hpGain: 8,
      }),
      candidate("header", "exhaust", { name: "Performance Header", hpGain: 6 }),
    ],
    installedParts: [],
    vehicle: { engine: "2.0L I4", transmission: "Automatic", trim: "" },
  });

  assert.equal(recommendations.some((part) => part.id === "trim-specific-intake"), false);
  assert.equal(recommendations.some((part) => part.id === "header"), true);
});

test("build stage uses gains relative to stock output instead of a universal horsepower threshold", () => {
  const installedParts = [{
    hpGainOverride: 30,
    part: {
      name: "Cold Air Intake",
      estimatedHpGain: 15,
      category: { name: "Intake", slug: "intake" },
    },
  }];
  const lowerOutputCar = buildVehiclePerformanceProfile(
    { engine: "Naturally aspirated I4", stockHorsepower: 200 },
    installedParts,
  );
  const higherOutputCar = buildVehiclePerformanceProfile(
    { engine: "Naturally aspirated V12", stockHorsepower: 700 },
    installedParts,
  );

  assert.equal(lowerOutputCar.stage, "TUNED");
  assert.equal(higherOutputCar.stage, "BOLT_ON");
});

test("forced-induction and drivetrain specs create appropriate support priorities", () => {
  const profile = buildVehiclePerformanceProfile(
    {
      engine: "2.0L I4",
      forcedInduction: "Turbocharged",
      drivetrain: "FWD",
      stockHorsepower: 250,
      stockTorque: 260,
    },
    [{
      hpGainOverride: 40,
      torqueGainOverride: 45,
      part: {
        name: "ECU Calibration",
        estimatedHpGain: 35,
        estimatedTorqueGain: 40,
        category: { name: "ECU & Tuning", slug: "ecu-tuning" },
      },
    }],
  );

  assert.equal(profile.stage, "TUNED");
  assert.equal(profile.aspiration, "FORCED_INDUCTION");
  assert.equal(profile.drivetrain, "FWD");
  assert.equal(profile.supportNeeds.has("cooling"), true);
  assert.equal(profile.supportNeeds.has("fueling"), true);
  assert.equal(profile.supportNeeds.has("brakes"), true);
  assert.equal(profile.supportNeeds.has("drivetrain"), true);
  assert.equal(profile.supportNeeds.has("wheels-tires"), true);
});

test("canonical storage systems retain functional build intelligence", () => {
  const profile = buildVehiclePerformanceProfile(
    { engine: "Naturally aspirated V8", stockHorsepower: 450 },
    [{
      hpGainOverride: 18,
      part: {
        name: "Cold Air Intake",
        estimatedHpGain: 18,
        category: { name: "Air Induction", slug: "air-induction" },
      },
    }],
  );

  assert.equal(profile.installedCategories.has("intake"), true);
  assert.equal(profile.installedCategories.has("forced-induction"), false);

  const recommendations = rankBuildAwarePartRecommendations({
    candidates: [
      candidate("ecu", "ecu-electronics", { hpGain: 20, name: "ECU Calibration" }),
      candidate("turbo", "air-induction", { hpGain: 180, name: "Twin Turbocharger Kit" }),
      candidate("brakes", "brakes", { name: "Brake Kit" }),
    ],
    installedParts: [{
      part: {
        name: "Cold Air Intake",
        estimatedHpGain: 18,
        category: { name: "Air Induction", slug: "air-induction" },
      },
    }],
    vehicle: { engine: "Naturally aspirated V8" },
  });

  assert.equal(recommendations[0]?.id, "ecu");
  assert.equal(recommendations.some((part) => part.id === "turbo"), false);
});

test("build guidance explains strengths and the next weak system in plain language", () => {
  const stockProfile = buildVehiclePerformanceProfile(
    { engine: "Naturally aspirated V8", drivetrain: "RWD", stockHorsepower: 450 },
    [],
  );
  const stockGuidance = describeVehicleBuild(stockProfile, "brakes");
  assert.match(stockGuidance.strength, /factory setup/i);
  assert.match(stockGuidance.weakness, /braking upgrade/i);

  const boltOnProfile = buildVehiclePerformanceProfile(
    { engine: "Naturally aspirated I4", transmission: "Automatic", stockHorsepower: 200 },
    [{
      hpGainOverride: 12,
      part: {
        name: "Cold Air Intake",
        estimatedHpGain: 12,
        category: { name: "Air Induction", slug: "air-induction" },
      },
    }],
  );
  const boltOnGuidance = describeVehicleBuild(boltOnProfile, "ecu-tuning");
  assert.match(boltOnGuidance.strength, /focused improvement/i);
  assert.match(boltOnGuidance.weakness, /engine management/i);
});
