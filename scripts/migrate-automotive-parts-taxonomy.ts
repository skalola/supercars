import { PrismaClient } from "@prisma/client";
import {
  AUTOMOTIVE_PART_SYSTEMS,
  getFerrariComponentMigrationMap,
  LEGACY_CATEGORY_SYSTEM_MAP,
} from "../lib/parts/ferrari-component-library";
import { buildPreferredBrandScopeKey } from "../lib/parts/ecosystem-config";
import { assertFerrariTaxonomyIntegrity } from "../lib/parts/taxonomy-validation";

const prisma = new PrismaClient({ log: ["error"] });

type ComponentRow = Awaited<ReturnType<typeof loadComponents>>[number];

async function main() {
  assertFerrariTaxonomyIntegrity();
  const startedAt = new Date();
  const migrationMap = getFerrariComponentMigrationMap();
  const migrationBySource = new Map(migrationMap.map((row) => [`${row.oldCategory}:${row.oldSlug}`, row]));
  const systems = new Map<string, { id: string; slug: string }>();
  for (const [index, system] of AUTOMOTIVE_PART_SYSTEMS.entries()) {
    const row = await prisma.partCategory.upsert({
      where: { slug: system.slug },
      update: {
        name: system.name,
        description: `Global automotive ${system.name.toLowerCase()} system.`,
        displayOrder: (index + 1) * 10,
        active: true,
      },
      create: {
        name: system.name,
        slug: system.slug,
        description: `Global automotive ${system.name.toLowerCase()} system.`,
        displayOrder: (index + 1) * 10,
        active: true,
      },
      select: { id: true, slug: true },
    });
    systems.set(system.slug, row);
  }

  const components = await loadComponents();
  const sourceCategories = new Set(Object.keys(LEGACY_CATEGORY_SYSTEM_MAP));
  const eligible = components.filter((component) => sourceCategories.has(component.category.slug));
  const groups = new Map<string, Array<ComponentRow & { target: ReturnType<typeof resolveTarget> }>>();
  for (const component of eligible) {
    const target = resolveTarget(component, migrationBySource);
    const key = `${target.categorySlug}:${target.slug}`;
    const values = groups.get(key) ?? [];
    values.push({ ...component, target });
    groups.set(key, values);
  }

  let componentsMerged = 0;
  let componentsReassigned = 0;
  let mappingsMerged = 0;
  const componentIdMap = new Map<string, string>();

  for (const values of groups.values()) {
    const targetCategory = systems.get(values[0].target.categorySlug);
    if (!targetCategory) throw new Error(`Missing target system ${values[0].target.categorySlug}.`);
    const canonical = chooseCanonical(values, targetCategory.id);

    for (const source of values) {
      componentIdMap.set(source.id, canonical.id);
      if (source.id === canonical.id) continue;
      mappingsMerged += await mergeComponentMappings(source.id, canonical.id);
      await mergeSearchTemplates(source.id, canonical.id);
      await migrateComponentPreferredBrands(source.id, canonical.id, targetCategory.id, values[0].target.categorySlug, values[0].target.slug);
      await prisma.performancePart.updateMany({
        where: { componentTypeId: source.id },
        data: {
          componentTypeId: canonical.id,
          categoryId: targetCategory.id,
          ...(source.target.material ? { material: source.target.material } : {}),
          ...(source.target.replacementType ? { replacementType: source.target.replacementType } : {}),
        },
      });
      await prisma.partComponentType.delete({ where: { id: source.id } });
      componentsMerged += 1;
    }

    const aliases = [...new Set(values.flatMap((value) => [
      value.name.toLowerCase(),
      ...readAliases(value.aliases),
      ...value.target.aliases,
    ]))].sort();
    const target = values[0].target;
    await prisma.partComponentType.update({
      where: { id: canonical.id },
      data: {
        categoryId: targetCategory.id,
        name: target.name,
        slug: target.slug,
        aliases,
        systemGroup: target.systemGroup,
        fitmentRisk: strongestRisk(values.map((value) => value.target.fitmentRisk)),
        performanceRelated: values.some((value) => value.performanceRelated),
        active: values.some((value) => value.active),
      },
    });
    await prisma.performancePart.updateMany({
      where: { componentTypeId: canonical.id },
      data: { categoryId: targetCategory.id },
    });
    if (canonical.categoryId !== targetCategory.id) componentsReassigned += 1;
  }

  const categories = await prisma.partCategory.findMany({ select: { id: true, slug: true } });
  const oldCategoryRows = categories.filter((category) => {
    const target = LEGACY_CATEGORY_SYSTEM_MAP[category.slug]?.system;
    return target && target !== category.slug;
  });
  for (const oldCategory of oldCategoryRows) {
    const targetSlug = LEGACY_CATEGORY_SYSTEM_MAP[oldCategory.slug].system;
    const target = systems.get(targetSlug);
    if (!target) continue;
    await migrateCategoryPreferredBrands(oldCategory.id, target.id, targetSlug, componentIdMap);
    await Promise.all([
      prisma.performancePart.updateMany({ where: { categoryId: oldCategory.id }, data: { categoryId: target.id } }),
      prisma.vehicleInstalledPart.updateMany({ where: { categoryId: oldCategory.id }, data: { categoryId: target.id } }),
      prisma.partCatalogNode.updateMany({ where: { categoryId: oldCategory.id }, data: { categoryId: target.id } }),
      prisma.partCategory.update({ where: { id: oldCategory.id }, data: { active: false } }),
    ]);
  }

  const duplicateComponentsDetected = migrationMap.length - new Set(migrationMap.map((row) => `${row.newCategory}:${row.newSlug}`)).size;
  const [canonicalComponents, ferrariMappingsPreserved] = await Promise.all([
    prisma.partComponentType.count({ where: { active: true, category: { slug: { in: AUTOMOTIVE_PART_SYSTEMS.map((system) => system.slug) } } } }),
    prisma.modelPartComponent.count({ where: { active: true, model: { make: { slug: "ferrari" } } } }),
  ]);
  const stats = {
    oldTopLevelCategories: new Set(migrationMap.map((row) => row.oldCategory)).size,
    topLevelSystems: AUTOMOTIVE_PART_SYSTEMS.length,
    sourceComponentDefinitions: migrationMap.length,
    canonicalComponents,
    duplicateComponentsDetected,
    componentsMerged: duplicateComponentsDetected,
    componentsMergedThisRun: componentsMerged,
    componentsReassigned,
    mappingsMerged,
    ferrariMappingsPreserved,
    categoriesRetired: oldCategoryRows.length,
  };
  await prisma.partSourceRun.create({
    data: {
      source: "SUPERCARDASH",
      runType: "AUTOMOTIVE_TAXONOMY_MIGRATION",
      makeSlug: "ferrari",
      status: "COMPLETED",
      stats,
      startedAt,
      completedAt: new Date(),
    },
  });
  console.log(JSON.stringify(stats, null, 2));
}

async function loadComponents() {
  return prisma.partComponentType.findMany({
    select: {
      id: true,
      categoryId: true,
      name: true,
      slug: true,
      aliases: true,
      systemGroup: true,
      active: true,
      performanceRelated: true,
      category: { select: { slug: true } },
    },
    orderBy: [{ category: { slug: "asc" } }, { name: "asc" }],
  });
}

function resolveTarget(component: ComponentRow, migrationBySource: Map<string, ReturnType<typeof getFerrariComponentMigrationMap>[number]>) {
  const explicit = migrationBySource.get(`${component.category.slug}:${component.slug}`);
  const fallback = LEGACY_CATEGORY_SYSTEM_MAP[component.category.slug];
  return {
    categorySlug: explicit?.newCategory ?? fallback?.system ?? "accessories-care",
    name: explicit?.newComponent ?? component.name,
    slug: explicit?.newSlug ?? component.slug,
    systemGroup: explicit?.systemGroup ?? component.systemGroup ?? fallback?.group ?? "OTHER",
    fitmentRisk: explicit?.fitmentRisk ?? "MEDIUM",
    aliases: explicit ? [explicit.oldComponent.toLowerCase()] : [component.name.toLowerCase()],
    material: explicit?.material ?? null,
    replacementType: explicit?.replacementType ?? null,
  };
}

function chooseCanonical<T extends ComponentRow & { target: ReturnType<typeof resolveTarget> }>(values: T[], targetCategoryId: string) {
  return values.find((value) => value.categoryId === targetCategoryId && value.slug === value.target.slug)
    ?? values.find((value) => value.slug === value.target.slug)
    ?? values[0];
}

async function mergeComponentMappings(sourceId: string, targetId: string) {
  await prisma.$executeRaw`
    DELETE FROM "PartOfferContext" source_context
    USING "ModelPartComponent" source_mapping,
          "ModelPartComponent" target_mapping,
          "PartOfferContext" target_context
    WHERE source_mapping.id = source_context."modelPartComponentId"
      AND source_mapping."componentTypeId" = ${sourceId}
      AND target_mapping."componentTypeId" = ${targetId}
      AND target_mapping."modelId" = source_mapping."modelId"
      AND target_context."modelPartComponentId" = target_mapping.id
      AND target_context."offerId" = source_context."offerId"
  `;
  await prisma.$executeRaw`
    UPDATE "PartOfferContext" context
    SET "modelPartComponentId" = target_mapping.id, "updatedAt" = NOW()
    FROM "ModelPartComponent" source_mapping,
         "ModelPartComponent" target_mapping
    WHERE context."modelPartComponentId" = source_mapping.id
      AND source_mapping."componentTypeId" = ${sourceId}
      AND target_mapping."componentTypeId" = ${targetId}
      AND target_mapping."modelId" = source_mapping."modelId"
  `;
  await prisma.$executeRaw`
    UPDATE "PartDiscoveryQuery" query
    SET "modelPartComponentId" = target_mapping.id, "updatedAt" = NOW()
    FROM "ModelPartComponent" source_mapping,
         "ModelPartComponent" target_mapping
    WHERE query."modelPartComponentId" = source_mapping.id
      AND source_mapping."componentTypeId" = ${sourceId}
      AND target_mapping."componentTypeId" = ${targetId}
      AND target_mapping."modelId" = source_mapping."modelId"
  `;
  await prisma.$executeRaw`
    UPDATE "PartAffiliateClick" click
    SET "modelPartComponentId" = target_mapping.id
    FROM "ModelPartComponent" source_mapping,
         "ModelPartComponent" target_mapping
    WHERE click."modelPartComponentId" = source_mapping.id
      AND source_mapping."componentTypeId" = ${sourceId}
      AND target_mapping."componentTypeId" = ${targetId}
      AND target_mapping."modelId" = source_mapping."modelId"
  `;
  const merged = await prisma.$executeRaw`
    DELETE FROM "ModelPartComponent" source_mapping
    USING "ModelPartComponent" target_mapping
    WHERE source_mapping."componentTypeId" = ${sourceId}
      AND target_mapping."componentTypeId" = ${targetId}
      AND target_mapping."modelId" = source_mapping."modelId"
  `;
  await prisma.modelPartComponent.updateMany({ where: { componentTypeId: sourceId }, data: { componentTypeId: targetId } });
  return merged;
}

async function mergeSearchTemplates(sourceId: string, targetId: string) {
  const templates = await prisma.partComponentSearchTemplate.findMany({ where: { componentTypeId: sourceId } });
  for (const template of templates) {
    await prisma.partComponentSearchTemplate.upsert({
      where: { componentTypeId_template: { componentTypeId: targetId, template: template.template } },
      update: { active: template.active, priority: Math.min(template.priority, 50), brandEnhancer: template.brandEnhancer },
      create: {
        componentTypeId: targetId,
        template: template.template,
        priority: template.priority,
        brandEnhancer: template.brandEnhancer,
        active: template.active,
      },
    });
  }
}

async function migrateComponentPreferredBrands(sourceId: string, targetId: string, categoryId: string, categorySlug: string, componentSlug: string) {
  const mappings = await prisma.preferredPartBrand.findMany({
    where: { componentTypeId: sourceId },
    include: { vehicleMake: { select: { slug: true } }, partBrand: { select: { slug: true } } },
  });
  for (const mapping of mappings) {
    const scopeKey = buildPreferredBrandScopeKey({ makeSlug: mapping.vehicleMake.slug, brandSlug: mapping.partBrand.slug, categorySlug, componentSlug });
    const collision = await prisma.preferredPartBrand.findUnique({ where: { scopeKey }, select: { id: true } });
    if (collision && collision.id !== mapping.id) await prisma.preferredPartBrand.delete({ where: { id: mapping.id } });
    else await prisma.preferredPartBrand.update({
      where: { id: mapping.id },
      data: { scopeKey, componentCategoryId: categoryId, componentTypeId: targetId },
    });
  }
}

async function migrateCategoryPreferredBrands(oldCategoryId: string, targetCategoryId: string, targetCategorySlug: string, componentIdMap: Map<string, string>) {
  const mappings = await prisma.preferredPartBrand.findMany({
    where: { componentCategoryId: oldCategoryId },
    include: {
      vehicleMake: { select: { slug: true } },
      partBrand: { select: { slug: true } },
      componentType: { select: { id: true, slug: true } },
    },
  });
  for (const mapping of mappings) {
    const targetComponentId = mapping.componentTypeId ? componentIdMap.get(mapping.componentTypeId) ?? mapping.componentTypeId : null;
    const targetComponent = targetComponentId
      ? await prisma.partComponentType.findUnique({ where: { id: targetComponentId }, select: { slug: true } })
      : null;
    const scopeKey = buildPreferredBrandScopeKey({
      makeSlug: mapping.vehicleMake.slug,
      brandSlug: mapping.partBrand.slug,
      categorySlug: targetCategorySlug,
      componentSlug: targetComponent?.slug ?? null,
    });
    const collision = await prisma.preferredPartBrand.findUnique({ where: { scopeKey }, select: { id: true } });
    if (collision && collision.id !== mapping.id) await prisma.preferredPartBrand.delete({ where: { id: mapping.id } });
    else await prisma.preferredPartBrand.update({
      where: { id: mapping.id },
      data: { scopeKey, componentCategoryId: targetCategoryId, componentTypeId: targetComponentId },
    });
  }
}

function readAliases(value: unknown) {
  return Array.isArray(value) ? value.filter((alias): alias is string => typeof alias === "string") : [];
}

function strongestRisk(values: string[]) {
  if (values.includes("HIGH")) return "HIGH";
  if (values.includes("MEDIUM")) return "MEDIUM";
  return "LOW";
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
