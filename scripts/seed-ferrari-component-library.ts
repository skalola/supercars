import { PrismaClient } from "@prisma/client";
import {
  FERRARI_COMPONENT_LIBRARY,
  getFerrariComponentSearchTemplates,
  getFerrariComponentAliases,
  getFerrariComponentSlug,
  normalizeFerrariComponent,
} from "@/lib/parts/ferrari-component-library";
import { assertFerrariTaxonomyIntegrity } from "@/lib/parts/taxonomy-validation";
import { evaluateFerrariComponentApplicability } from "@/lib/parts/ferrari-applicability";
import { buildModelPartApplicabilityKey } from "@/lib/parts/canonical-catalog";
import { getUniversalPartComponentGroup } from "@/lib/parts/part-type-hierarchy";

const prisma = new PrismaClient();

async function main() {
  assertFerrariTaxonomyIntegrity();
  const ferrari = await prisma.make.findUnique({ where: { slug: "ferrari" }, select: { id: true } });
  if (!ferrari) throw new Error("Ferrari make record is missing.");

  for (const [categoryIndex, categorySeed] of FERRARI_COMPONENT_LIBRARY.entries()) {
    await prisma.partCategory.upsert({
      where: { slug: categorySeed.slug },
      update: { name: categorySeed.name, description: categorySeed.description, active: true },
      create: {
        name: categorySeed.name,
        slug: categorySeed.slug,
        description: categorySeed.description,
        displayOrder: (categoryIndex + 1) * 10,
        active: true,
      },
    });
  }

  const categories = await prisma.partCategory.findMany({
    where: { slug: { in: FERRARI_COMPONENT_LIBRARY.map((categorySeed) => categorySeed.slug) } },
    select: { id: true, slug: true },
  });
  const categoryIds = new Map(categories.map((categoryRow) => [categoryRow.slug, categoryRow.id]));
  const componentRows = FERRARI_COMPONENT_LIBRARY.flatMap((categorySeed) => {
    const categoryId = categoryIds.get(categorySeed.slug);
    if (!categoryId) throw new Error(`Category ${categorySeed.slug} was not created.`);
    return categorySeed.components.map((rawComponent, componentIndex) => {
      const component = normalizeFerrariComponent(rawComponent);
      return {
        categoryId,
        name: component.name,
        slug: getFerrariComponentSlug(component),
        description: `${component.name} for compatible Ferrari model applications.`,
        aliases: getFerrariComponentAliases(component),
        systemGroup: getUniversalPartComponentGroup(categorySeed.slug, component.name, component.systemGroup).slug,
        fitmentRisk: component.fitmentRisk ?? "MEDIUM",
        displayOrder: (componentIndex + 1) * 10,
        performanceRelated: component.performance ?? false,
        active: true,
      };
    });
  });
  for (const componentRow of componentRows) {
    await prisma.partComponentType.upsert({
      where: { categoryId_slug: { categoryId: componentRow.categoryId, slug: componentRow.slug } },
      update: componentRow,
      create: componentRow,
    });
  }

  const activeComponentKeys = new Set(componentRows.map((row) => `${row.categoryId}:${row.slug}`));
  const existingComponents = await prisma.partComponentType.findMany({
    where: { categoryId: { in: categories.map((categoryRow) => categoryRow.id) } },
    select: {
      id: true,
      categoryId: true,
      slug: true,
      modelMappings: { where: { model: { makeId: ferrari.id } }, select: { id: true }, take: 1 },
    },
  });
  const retiredComponentIds = existingComponents
    .filter((row) => row.modelMappings.length > 0 && !activeComponentKeys.has(`${row.categoryId}:${row.slug}`))
    .map((row) => row.id);
  if (retiredComponentIds.length) {
    await prisma.partComponentType.updateMany({ where: { id: { in: retiredComponentIds } }, data: { active: false } });
    await prisma.modelPartComponent.updateMany({ where: { componentTypeId: { in: retiredComponentIds } }, data: { active: false } });
  }

  const components = await prisma.partComponentType.findMany({
    where: { categoryId: { in: categories.map((categoryRow) => categoryRow.id) }, active: true },
    select: { id: true, name: true, slug: true, category: { select: { slug: true } } },
  });
  const seedByKey = new Map(FERRARI_COMPONENT_LIBRARY.flatMap((categorySeed) =>
    categorySeed.components.map((rawComponent) => {
      const component = normalizeFerrariComponent(rawComponent);
      return [`${categorySeed.slug}:${getFerrariComponentSlug(component)}`, component] as const;
    }),
  ));
  const templateRows = components.flatMap((component) => {
    const seed = seedByKey.get(`${component.category.slug}:${component.slug}`);
    const stagedTemplates = [
      ...getFerrariComponentSearchTemplates(component.category.slug, component.name),
      ...getFerrariComponentAliases(seed ?? { name: component.name })
        .filter((alias) => alias !== component.name.toLowerCase())
        .slice(0, 5)
        .map((alias) => `{make} {model} ${alias}`),
    ];
    return [...new Set(stagedTemplates)].map((template, priority) => ({
      componentTypeId: component.id,
      template,
      priority,
      brandEnhancer: priority >= 2 ? template.split(" ").find((token) => /^[A-Z]/.test(token) && !token.startsWith("{")) ?? null : null,
      active: true,
    }));
  });
  await prisma.partComponentSearchTemplate.createMany({ data: templateRows, skipDuplicates: true });

  const models = await prisma.model.findMany({
    where: { makeId: ferrari.id },
    select: {
      id: true,
      name: true,
      productionStartYear: true,
      productionEndYear: true,
      category: true,
      bodyStyle: true,
      spec: { select: { engine: true, transmission: true, drivetrain: true } },
      variants: { select: { id: true } },
    },
  });
  const mappingCandidates = models.flatMap((model) => components.flatMap((component) => {
    const componentSeed = seedByKey.get(`${component.category.slug}:${component.slug}`);
    if (!componentSeed) return [];
    const evaluation = evaluateFerrariComponentApplicability(componentSeed, {
      name: model.name,
      productionStartYear: model.productionStartYear,
      productionEndYear: model.productionEndYear,
      engine: model.spec?.engine ?? null,
      category: model.category,
      transmission: model.spec?.transmission ?? null,
      drivetrain: model.spec?.drivetrain ?? null,
      bodyStyle: model.bodyStyle,
      variantCount: model.variants.length,
    });
    return [{ modelId: model.id, componentTypeId: component.id, evaluation, model }];
  }));
  await prisma.modelPartComponent.createMany({
    data: mappingCandidates.map((row) => ({
      modelId: row.modelId,
      componentTypeId: row.componentTypeId,
      applicability: row.evaluation.status,
      active: row.evaluation.publiclyApplicable,
    })),
    skipDuplicates: true,
  });
  const mappings = await prisma.modelPartComponent.findMany({
    where: { model: { makeId: ferrari.id }, componentTypeId: { in: components.map((component) => component.id) } },
    select: { id: true, modelId: true, componentTypeId: true, applicability: true, active: true },
  });
  const mappingByKey = new Map(mappings.map((mapping) => [`${mapping.modelId}:${mapping.componentTypeId}`, mapping]));
  for (const status of ["APPLICABLE", "NOT_APPLICABLE", "YEAR_DEPENDENT", "VARIANT_DEPENDENT"] as const) {
    const ids = mappingCandidates
      .filter((row) => row.evaluation.status === status)
      .map((row) => mappingByKey.get(`${row.modelId}:${row.componentTypeId}`))
      .filter((mapping): mapping is NonNullable<typeof mapping> => Boolean(mapping))
      .filter((mapping) => mapping.applicability !== status || mapping.active !== (status === "APPLICABLE"))
      .map((mapping) => mapping.id);
    for (const batch of chunks(ids, 1_000)) {
      await prisma.modelPartComponent.updateMany({
        where: { id: { in: batch } },
        data: { applicability: status, active: status === "APPLICABLE" },
      });
    }
  }

  const constrainedRules = mappingCandidates.flatMap((row) => {
    const mapping = mappingByKey.get(`${row.modelId}:${row.componentTypeId}`);
    const requirements = row.evaluation.requirements;
    if (!mapping || !Object.values(requirements).some((value) => value != null)) return [];
    const rule = {
      modelPartComponentId: mapping.id,
      modelVariantId: null,
      yearStart: requirements.minimumYear,
      yearEnd: null,
      engine: null,
      transmission: requirements.transmission,
      drivetrain: null,
      bodyStyle: null,
      aspiration: requirements.aspiration,
      electrificationLevel: requirements.electrification,
    };
    return [{
      ...rule,
      ruleKey: buildModelPartApplicabilityKey(rule),
      applicability: row.evaluation.status,
      confidence: row.evaluation.confidence,
      source: row.evaluation.source,
      notes: row.evaluation.reason,
      active: true,
    }];
  });
  for (const batch of chunks(constrainedRules, 25)) {
    await Promise.all(batch.map((rule) => prisma.modelPartApplicability.upsert({
      where: { ruleKey: rule.ruleKey },
      update: {
        applicability: rule.applicability,
        confidence: rule.confidence,
        source: rule.source,
        notes: rule.notes,
        active: true,
      },
      create: rule,
    })));
  }
  await Promise.all([
    prisma.partOffer.updateMany({ where: { fitmentConfidence: "HIGH" }, data: { fitmentConfidence: "HIGH_CONFIDENCE" } }),
    prisma.partOffer.updateMany({ where: { fitmentConfidence: "POSSIBLE" }, data: { fitmentConfidence: "LIKELY_COMPATIBLE" } }),
    prisma.partOfferContext.updateMany({ where: { fitmentConfidence: "HIGH" }, data: { fitmentConfidence: "HIGH_CONFIDENCE" } }),
    prisma.partOfferContext.updateMany({ where: { fitmentConfidence: "POSSIBLE" }, data: { fitmentConfidence: "LIKELY_COMPATIBLE" } }),
  ]);

  const [categoryCount, componentCount, mappingCount, templateCount] = await Promise.all([
    prisma.partCategory.count({ where: { id: { in: categories.map((categoryRow) => categoryRow.id) } } }),
    prisma.partComponentType.count({ where: { categoryId: { in: categories.map((categoryRow) => categoryRow.id) }, active: true } }),
    prisma.modelPartComponent.count({ where: { model: { makeId: ferrari.id }, active: true } }),
    prisma.partComponentSearchTemplate.count({ where: { active: true, componentType: { active: true, categoryId: { in: categories.map((categoryRow) => categoryRow.id) } } } }),
  ]);
  console.log(JSON.stringify({
    ferrariModels: models.length,
    categories: categoryCount,
    componentTypes: componentCount,
    modelComponentMappings: mappingCount,
    searchTemplates: templateCount,
    applicability: Object.fromEntries(["APPLICABLE", "NOT_APPLICABLE", "YEAR_DEPENDENT", "VARIANT_DEPENDENT"].map((status) => [
      status,
      mappingCandidates.filter((row) => row.evaluation.status === status).length,
    ])),
    structuredApplicabilityRules: constrainedRules.length,
  }, null, 2));
}

function chunks<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
