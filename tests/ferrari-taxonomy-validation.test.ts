import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOMOTIVE_PART_SYSTEMS,
  FERRARI_COMPONENT_LIBRARY,
  type FerrariComponentCategorySeed,
} from "../lib/parts/ferrari-component-library";
import {
  buildFerrariTaxonomySnapshot,
  FERRARI_COMPONENT_COUNT_RANGE,
  normalizeTaxonomyTerm,
  REQUIRED_SERVICE_FLUIDS,
} from "../lib/parts/taxonomy-validation";

test("canonical Ferrari taxonomy passes the integrity gate", () => {
  const snapshot = buildFerrariTaxonomySnapshot();
  assert.equal(snapshot.issues.length, 0);
  assert.equal(snapshot.systemCount, 17);
  assert.equal(snapshot.componentCount, 190);
  assert.ok(snapshot.componentCount >= FERRARI_COMPONENT_COUNT_RANGE.minimum);
  assert.ok(snapshot.componentCount <= FERRARI_COMPONENT_COUNT_RANGE.maximum);
  assert.equal(snapshot.componentsBySystem.every((system) => Boolean(system.icon)), true);
});

test("maintenance taxonomy retains every major service fluid", () => {
  const maintenance = FERRARI_COMPONENT_LIBRARY.find((system) => system.slug === "maintenance-service");
  assert.ok(maintenance);
  const names = new Set(maintenance.components.map((component) => normalizeTaxonomyTerm(typeof component === "string" ? component : component.name)));
  for (const fluid of REQUIRED_SERVICE_FLUIDS) assert.equal(names.has(normalizeTaxonomyTerm(fluid)), true, fluid);
});

test("taxonomy gate rejects duplicate component identities", () => {
  const library = cloneLibrary();
  library[0].components.push(library[0].components[0]);
  const snapshot = buildFerrariTaxonomySnapshot(library);
  assert.ok(snapshot.issues.some((entry) => entry.code === "DUPLICATE_COMPONENT_SLUG"));
});

test("taxonomy gate rejects aliases owned by different components", () => {
  const library = cloneLibrary();
  library[0].components[0] = { name: "Oil Filter", aliases: ["shared component alias"], systemGroup: "ROUTINE_SERVICE" };
  library[1].components[0] = { name: "Engine Mount", aliases: ["shared component alias"], systemGroup: "ENGINE_CORE" };
  const snapshot = buildFerrariTaxonomySnapshot(library);
  assert.ok(snapshot.issues.some((entry) => entry.code === "AMBIGUOUS_COMPONENT_ALIAS"));
});

test("approved systems remain stable and taxonomy terms normalize whitespace", () => {
  assert.deepEqual(FERRARI_COMPONENT_LIBRARY.map((system) => system.slug), AUTOMOTIVE_PART_SYSTEMS.map((system) => system.slug));
  assert.equal(normalizeTaxonomyTerm("  Front   Brake Pads "), "front brake pads");
});

function cloneLibrary(): FerrariComponentCategorySeed[] {
  return FERRARI_COMPONENT_LIBRARY.map((system) => ({
    ...system,
    components: system.components.map((component) => typeof component === "string" ? component : { ...component, aliases: [...(component.aliases ?? [])] }),
  }));
}
