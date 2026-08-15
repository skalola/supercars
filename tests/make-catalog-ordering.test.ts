import assert from "node:assert/strict";
import test from "node:test";
import { sortCatalogLabels } from "../lib/makes/catalog-order";

test("catalog labels sort alphabetically without case sensitivity", () => {
  const sorted = sortCatalogLabels([
    { name: "Volvo" },
    { name: "acura" },
    { name: "BMW" },
  ]);

  assert.deepEqual(sorted.map((item) => item.name), ["acura", "BMW", "Volvo"]);
});

test("numbered model names use natural alphabetical order", () => {
  const sorted = sortCatalogLabels([
    { name: "911 GT3" },
    { name: "718 Cayman" },
    { name: "911 GT2" },
  ]);

  assert.deepEqual(sorted.map((item) => item.name), ["718 Cayman", "911 GT2", "911 GT3"]);
});
