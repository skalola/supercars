import { PrismaClient } from "@prisma/client";
import {
  AUTOMOTIVE_PART_SYSTEMS,
  FERRARI_COMPONENT_LIBRARY,
  LEGACY_CATEGORY_SYSTEM_MAP,
  normalizeFerrariComponent,
} from "../lib/parts/ferrari-component-library";
import { toPartSlug } from "../lib/parts/slug";
import { buildFerrariTaxonomySnapshot, normalizeTaxonomyTerm } from "../lib/parts/taxonomy-validation";

const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  const source = buildFerrariTaxonomySnapshot();
  const canonicalSlugs: string[] = AUTOMOTIVE_PART_SYSTEMS.map((system) => system.slug);
  const [categories, ferrariMappingCount, ferrariModelCount] = await Promise.all([
    prisma.partCategory.findMany({
      select: {
        name: true,
        slug: true,
        active: true,
        componentTypes: {
          where: { active: true },
          select: { name: true, slug: true, aliases: true, systemGroup: true },
          orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        },
      },
      orderBy: [{ displayOrder: "asc" }, { slug: "asc" }],
    }),
    prisma.modelPartComponent.count({ where: { active: true, model: { make: { slug: "ferrari" } } } }),
    prisma.model.count({ where: { make: { slug: "ferrari" } } }),
  ]);

  const canonicalCategories = categories.filter((category) => canonicalSlugs.includes(category.slug));
  const sourceComponents = new Map(FERRARI_COMPONENT_LIBRARY.flatMap((system) => system.components.map((rawComponent) => {
    const component = normalizeFerrariComponent(rawComponent);
    return [`${system.slug}:${toPartSlug(component.name)}`, component.name] as const;
  })));
  const databaseComponents = new Map(canonicalCategories.flatMap((category) => category.componentTypes.map((component) => [
    `${category.slug}:${component.slug}`,
    component.name,
  ] as const)));

  const missingSystems = canonicalSlugs.filter((slug) => !canonicalCategories.some((category) => category.slug === slug && category.active));
  const activeLegacySystems = categories
    .filter((category) => {
      const route = LEGACY_CATEGORY_SYSTEM_MAP[category.slug];
      return category.active && route && route.system !== category.slug;
    })
    .map((category) => category.slug)
    .sort();
  const missingComponents = [...sourceComponents.keys()].filter((key) => !databaseComponents.has(key)).sort();
  const unexpectedComponents = [...databaseComponents.keys()].filter((key) => !sourceComponents.has(key)).sort();
  const renamedComponents = [...sourceComponents]
    .filter(([key, name]) => databaseComponents.has(key) && databaseComponents.get(key) !== name)
    .map(([key, expected]) => ({ key, expected, actual: databaseComponents.get(key) }))
    .sort((left, right) => left.key.localeCompare(right.key));

  const aliasOwners = new Map<string, string>();
  const ambiguousAliases: Array<{ alias: string; owners: string[] }> = [];
  const duplicateNames: Array<{ system: string; name: string }> = [];
  for (const category of canonicalCategories) {
    const names = new Set<string>();
    for (const component of category.componentTypes) {
      const owner = `${category.slug}:${component.slug}`;
      const normalizedName = normalizeTaxonomyTerm(component.name);
      if (names.has(normalizedName)) duplicateNames.push({ system: category.slug, name: component.name });
      names.add(normalizedName);
      for (const alias of readAliases(component.aliases)) {
        const normalizedAlias = toPartSlug(normalizeTaxonomyTerm(alias));
        if (!normalizedAlias) continue;
        const previousOwner = aliasOwners.get(normalizedAlias);
        if (previousOwner && previousOwner !== owner) ambiguousAliases.push({ alias: normalizedAlias, owners: [previousOwner, owner] });
        else aliasOwners.set(normalizedAlias, owner);
      }
    }
  }

  const database = {
    systemCount: canonicalCategories.filter((category) => category.active).length,
    componentCount: databaseComponents.size,
    ferrariModelCount,
    ferrariModelComponentMappings: ferrariMappingCount,
    componentsBySystem: canonicalCategories.map((category) => ({
      name: category.name,
      slug: category.slug,
      active: category.active,
      componentCount: category.componentTypes.length,
      subgroupCount: new Set(category.componentTypes.map((component) => component.systemGroup).filter(Boolean)).size,
    })),
  };
  const drift = {
    missingSystems,
    activeLegacySystems,
    missingComponents,
    unexpectedComponents,
    renamedComponents,
    duplicateNames,
    ambiguousAliases,
  };
  const passed = source.issues.length === 0 && Object.values(drift).every((entries) => entries.length === 0);
  console.log(JSON.stringify({ passed, source, database, drift }, null, 2));
  if (!passed) process.exitCode = 1;
}

function readAliases(value: unknown) {
  return Array.isArray(value) ? value.filter((alias): alias is string => typeof alias === "string") : [];
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ passed: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
