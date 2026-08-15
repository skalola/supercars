import assert from "node:assert/strict";
import test from "node:test";
import {
  isDisplayableModelImage,
  selectModelHeroImage,
} from "../lib/model-catalog/model-display";

test("model hero selection excludes review candidates and prefers an approved hero", () => {
  const images = [
    { url: "candidate.jpg", type: "candidate", reviewStatus: "APPROVED", source: "candidate" },
    { url: "review.jpg", type: "hero", reviewStatus: "NEEDS_REVIEW", source: "review" },
    { url: "gallery.jpg", type: "gallery", reviewStatus: "APPROVED", source: "gallery" },
    { url: "hero.jpg", type: "hero", reviewStatus: "APPROVED", source: "hero" },
  ];

  const selected = selectModelHeroImage(images);

  assert.equal(selected?.url, "hero.jpg");
  assert.equal(selected?.source, "hero");
});

test("model hero selection falls back to the first displayable image", () => {
  const images = [
    { url: "candidate.jpg", type: "candidate", reviewStatus: null },
    { url: "gallery.jpg", type: "gallery", reviewStatus: null },
  ];

  assert.equal(selectModelHeroImage(images)?.url, "gallery.jpg");
  assert.equal(isDisplayableModelImage(images[0]), false);
  assert.equal(isDisplayableModelImage(images[1]), true);
});

test("model hero selection returns null when no approved image can be displayed", () => {
  const images = [
    { url: "review.jpg", type: "hero", reviewStatus: "NEEDS_REVIEW" },
    { url: "candidate.jpg", type: "candidate", reviewStatus: null },
  ];

  assert.equal(selectModelHeroImage(images), null);
});

test("model hero selection never displays rejected identity matches", () => {
  const images = [
    { url: "wrong-model.jpg", type: "hero", reviewStatus: "REJECTED" },
    { url: "correct-model.jpg", type: "reference", reviewStatus: "APPROVED" },
  ];

  assert.equal(selectModelHeroImage(images)?.url, "correct-model.jpg");
  assert.equal(isDisplayableModelImage(images[0]), false);
});
