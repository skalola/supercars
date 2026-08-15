import assert from "node:assert/strict";
import test from "node:test";
import { PART_CATEGORY_ICON_BY_SLUG } from "../lib/parts/category-icons";

const REQUIRED_CATEGORY_SLUGS = [
  "maintenance-service",
  "engine",
  "air-induction",
  "fuel-system",
  "cooling",
  "exhaust-emissions",
  "ecu-electronics",
  "transmission-drivetrain",
  "suspension-steering",
  "brakes",
  "wheels-tires",
  "body-exterior",
  "aerodynamics",
  "interior",
  "lighting",
  "accessories-care",
  "performance-packages",
  "aero-body",
  "drivetrain",
  "fueling",
  "interior-safety",
  "performance",
] as const;

test("every required parts category has an explicit non-placeholder icon", () => {
  const icons = REQUIRED_CATEGORY_SLUGS.map((slug) => PART_CATEGORY_ICON_BY_SLUG[slug]);
  assert.equal(icons.every(Boolean), true);
  assert.equal(icons.includes("unknown"), false);
  assert.equal(new Set(icons).size, REQUIRED_CATEGORY_SLUGS.length);
});

test("visually confusing legacy and canonical category pairs remain distinct", () => {
  const distinctPairs = [
    ["transmission-drivetrain", "drivetrain"],
    ["fuel-system", "fueling"],
    ["interior", "interior-safety"],
    ["aerodynamics", "aero-body"],
    ["performance-packages", "performance"],
  ] as const;

  for (const [left, right] of distinctPairs) {
    assert.notEqual(PART_CATEGORY_ICON_BY_SLUG[left], PART_CATEGORY_ICON_BY_SLUG[right]);
  }
});
