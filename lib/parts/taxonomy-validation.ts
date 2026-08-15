import { PART_CATEGORY_SEEDS } from "@/lib/parts/catalog-foundation";
import { PART_CATEGORY_ICON_BY_SLUG } from "@/lib/parts/category-icons";
import {
  AUTOMOTIVE_PART_SYSTEMS,
  FERRARI_COMPONENT_LIBRARY,
  getFerrariComponentAliases,
  getFerrariComponentMigrationMap,
  LEGACY_CATEGORY_SYSTEM_MAP,
  normalizeFerrariComponent,
  type FerrariComponentCategorySeed,
} from "@/lib/parts/ferrari-component-library";
import { toPartSlug } from "@/lib/parts/slug";

export const FERRARI_COMPONENT_COUNT_RANGE = { minimum: 120, maximum: 200 } as const;

export type TaxonomyIssue = {
  code: string;
  path: string;
  message: string;
};

export type FerrariTaxonomySnapshot = {
  systemCount: number;
  componentCount: number;
  aliasCount: number;
  subgroupCount: number;
  componentsBySystem: Array<{
    name: string;
    slug: string;
    icon: string | null;
    componentCount: number;
    subgroupCount: number;
  }>;
  issues: TaxonomyIssue[];
};

export function normalizeTaxonomyTerm(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildFerrariTaxonomySnapshot(
  library: FerrariComponentCategorySeed[] = FERRARI_COMPONENT_LIBRARY,
): FerrariTaxonomySnapshot {
  const issues: TaxonomyIssue[] = [];
  const expectedSystems = new Map<string, string>(AUTOMOTIVE_PART_SYSTEMS.map((system) => [system.slug, system.name]));
  const seenSystemSlugs = new Set<string>();
  const seenSystemNames = new Set<string>();
  const componentOwners = new Map<string, string>();
  const aliasOwners = new Map<string, string>();
  let componentCount = 0;
  let aliasCount = 0;
  const subgroupKeys = new Set<string>();

  if (library.length !== AUTOMOTIVE_PART_SYSTEMS.length) {
    issues.push(issue("SYSTEM_COUNT", "systems", `Expected ${AUTOMOTIVE_PART_SYSTEMS.length} systems; found ${library.length}.`));
  }

  const componentsBySystem = library.map((system, systemIndex) => {
    const systemPath = `systems[${systemIndex}]`;
    const normalizedName = normalizeTaxonomyTerm(system.name);
    const expectedName = expectedSystems.get(system.slug);
    if (seenSystemSlugs.has(system.slug)) issues.push(issue("DUPLICATE_SYSTEM_SLUG", systemPath, `Duplicate system slug ${system.slug}.`));
    if (seenSystemNames.has(normalizedName)) issues.push(issue("DUPLICATE_SYSTEM_NAME", systemPath, `Duplicate system name ${system.name}.`));
    if (!expectedName) issues.push(issue("UNAPPROVED_SYSTEM", systemPath, `${system.slug} is not an approved automotive system.`));
    else if (expectedName !== system.name) issues.push(issue("SYSTEM_NAME_DRIFT", systemPath, `Expected ${expectedName}; found ${system.name}.`));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(system.slug)) issues.push(issue("INVALID_SYSTEM_SLUG", systemPath, `${system.slug} is not a stable URL slug.`));
    seenSystemSlugs.add(system.slug);
    seenSystemNames.add(normalizedName);

    const icon = PART_CATEGORY_ICON_BY_SLUG[system.slug] ?? null;
    if (!icon || icon === "unknown") issues.push(issue("MISSING_SYSTEM_ICON", systemPath, `${system.slug} needs an explicit icon identity.`));

    const localSlugs = new Set<string>();
    const localNames = new Set<string>();
    const subgroups = new Set<string>();
    for (const [componentIndex, rawComponent] of system.components.entries()) {
      const component = normalizeFerrariComponent(rawComponent);
      const componentPath = `${systemPath}.components[${componentIndex}]`;
      const name = component.name.trim().replace(/\s+/g, " ");
      const slug = toPartSlug(name);
      const owner = `${system.slug}:${slug}`;
      componentCount += 1;

      if (!name) issues.push(issue("EMPTY_COMPONENT_NAME", componentPath, "Component name cannot be empty."));
      if (component.name !== name) issues.push(issue("UNNORMALIZED_COMPONENT_NAME", componentPath, `${component.name} contains unstable whitespace.`));
      if (localSlugs.has(slug)) issues.push(issue("DUPLICATE_COMPONENT_SLUG", componentPath, `Duplicate ${system.slug}:${slug}.`));
      if (localNames.has(normalizeTaxonomyTerm(name))) issues.push(issue("DUPLICATE_COMPONENT_NAME", componentPath, `Duplicate component name ${name} in ${system.name}.`));
      localSlugs.add(slug);
      localNames.add(normalizeTaxonomyTerm(name));
      componentOwners.set(owner, componentPath);

      const subgroup = component.systemGroup?.trim();
      if (!subgroup) issues.push(issue("MISSING_SYSTEM_GROUP", componentPath, `${name} needs a system group.`));
      else {
        subgroups.add(subgroup);
        subgroupKeys.add(`${system.slug}:${subgroup}`);
      }

      const aliases = getFerrariComponentAliases(component);
      aliasCount += aliases.length;
      for (const alias of aliases) {
        const normalizedAlias = toPartSlug(normalizeTaxonomyTerm(alias));
        if (!normalizedAlias) issues.push(issue("EMPTY_COMPONENT_ALIAS", componentPath, `${name} contains an empty alias.`));
        const previousOwner = aliasOwners.get(normalizedAlias);
        if (previousOwner && previousOwner !== owner) {
          issues.push(issue("AMBIGUOUS_COMPONENT_ALIAS", componentPath, `Alias ${alias} resolves to both ${previousOwner} and ${owner}.`));
        } else {
          aliasOwners.set(normalizedAlias, owner);
        }
      }
    }

    return {
      name: system.name,
      slug: system.slug,
      icon,
      componentCount: system.components.length,
      subgroupCount: subgroups.size,
    };
  });

  for (const system of AUTOMOTIVE_PART_SYSTEMS) {
    if (!seenSystemSlugs.has(system.slug)) issues.push(issue("MISSING_SYSTEM", "systems", `Missing approved system ${system.slug}.`));
  }
  if (componentCount < FERRARI_COMPONENT_COUNT_RANGE.minimum || componentCount > FERRARI_COMPONENT_COUNT_RANGE.maximum) {
    issues.push(issue(
      "COMPONENT_COUNT_RANGE",
      "components",
      `Expected ${FERRARI_COMPONENT_COUNT_RANGE.minimum}-${FERRARI_COMPONENT_COUNT_RANGE.maximum} components; found ${componentCount}.`,
    ));
  }

  const seedSlugs = PART_CATEGORY_SEEDS.map((seed) => seed.slug);
  if (seedSlugs.join("|") !== AUTOMOTIVE_PART_SYSTEMS.map((system) => system.slug).join("|")) {
    issues.push(issue("FOUNDATION_SYSTEM_DRIFT", "PART_CATEGORY_SEEDS", "Foundation seeds must match the approved systems and order."));
  }

  const canonicalIcons = AUTOMOTIVE_PART_SYSTEMS.map((system) => PART_CATEGORY_ICON_BY_SLUG[system.slug]).filter(Boolean);
  if (new Set(canonicalIcons).size !== canonicalIcons.length) {
    issues.push(issue("DUPLICATE_SYSTEM_ICON", "icons", "Canonical automotive systems must have distinct icon identities."));
  }

  for (const [legacySlug, route] of Object.entries(LEGACY_CATEGORY_SYSTEM_MAP)) {
    if (!expectedSystems.has(route.system)) issues.push(issue("INVALID_LEGACY_ROUTE", `legacy.${legacySlug}`, `Legacy route targets missing system ${route.system}.`));
  }
  for (const route of getFerrariComponentMigrationMap()) {
    if (!componentOwners.has(`${route.newCategory}:${route.newSlug}`)) {
      issues.push(issue("MISSING_MIGRATION_TARGET", `migration.${route.oldCategory}:${route.oldSlug}`, `Missing target ${route.newCategory}:${route.newSlug}.`));
    }
  }

  return { systemCount: library.length, componentCount, aliasCount, subgroupCount: subgroupKeys.size, componentsBySystem, issues };
}

export function assertFerrariTaxonomyIntegrity() {
  const snapshot = buildFerrariTaxonomySnapshot();
  if (snapshot.issues.length > 0) {
    throw new Error(`Ferrari component taxonomy validation failed:\n${snapshot.issues.map((entry) => `- [${entry.code}] ${entry.path}: ${entry.message}`).join("\n")}`);
  }
  return snapshot;
}

function issue(code: string, path: string, message: string): TaxonomyIssue {
  return { code, path, message };
}
