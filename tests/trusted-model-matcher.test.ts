import assert from "node:assert/strict";
import test from "node:test";
import { findTrustedModelMatch, slugifyTrustedModel } from "@/lib/model-catalog/trusted-model-matcher";

test("matches punctuation and manufacturer-prefix aliases without merging trims", () => {
  const match = findTrustedModelMatch("Ferrari F 40", "Ferrari", [
    { id: "one", name: "F40", slug: "f40" },
    { id: "two", name: "F40 Competizione", slug: "f40-competizione" },
  ]);
  assert.equal(match?.model.id, "one");
});

test("does not select an ambiguous model-family match", () => {
  const match = findTrustedModelMatch("Civic", "Honda", [
    { id: "one", name: "Civic Type R", slug: "civic-type-r" },
    { id: "two", name: "Civic Type S", slug: "civic-type-s" },
  ]);
  assert.equal(match, null);
});

test("does not collapse a base family into a performance trim", () => {
  const match = findTrustedModelMatch("Accord", "Honda", [
    { id: "one", name: "Accord Euro R", slug: "accord-euro-r" },
  ]);
  assert.equal(match, null);
});

test("creates stable URL slugs for trusted model names", () => {
  assert.equal(slugifyTrustedModel("296 GTB Spider"), "296-gtb-spider");
});
