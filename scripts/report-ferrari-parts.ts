import { prisma } from "../lib/prisma";

async function main() {
  const now = new Date();
  const [
    models,
    coverageRows,
    gapRows,
    processedModelRows,
    categories,
    componentTypes,
    discoveryTotals,
    discoveryStatuses,
    productFamilies,
    oemIdentifiers,
    mpnIdentifiers,
    activeOffers,
    affiliateOffers,
    classifications,
    latestSuccessfulRun,
    latestRun,
  ] = await Promise.all([
    prisma.model.findMany({
      where: { make: { slug: "ferrari" } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
    prisma.$queryRaw<Array<{
      model_id: string;
      category_slug: string;
      category_name: string;
      mapped_components: bigint;
      covered_components: bigint;
    }>>`
      SELECT
        model.id AS model_id,
        category.slug AS category_slug,
        category.name AS category_name,
        COUNT(*)::bigint AS mapped_components,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1
          FROM "PartOfferContext" context
          JOIN "PartOffer" offer ON offer.id = context."offerId"
          WHERE context."modelPartComponentId" = mapping.id
            AND context.active = true
            AND offer.active = true
            AND offer."affiliateUrl" IS NOT NULL
            AND (offer."expiresAt" IS NULL OR offer."expiresAt" > ${now})
        ))::bigint AS covered_components
      FROM "ModelPartComponent" mapping
      JOIN "Model" model ON model.id = mapping."modelId"
      JOIN "Make" make ON make.id = model."makeId"
      JOIN "PartComponentType" component ON component.id = mapping."componentTypeId"
      JOIN "PartCategory" category ON category.id = component."categoryId"
      WHERE make.slug = 'ferrari' AND mapping.active = true AND component.active = true
      GROUP BY model.id, category.slug, category.name
    `,
    prisma.$queryRaw<Array<{ model_id: string; category_name: string; component_name: string }>>`
      WITH uncovered AS (
        SELECT
          model.id AS model_id,
          category.name AS category_name,
          component.name AS component_name,
          ROW_NUMBER() OVER (
            PARTITION BY model.id
            ORDER BY category."displayOrder", component."displayOrder", component.name
          ) AS row_number
        FROM "ModelPartComponent" mapping
        JOIN "Model" model ON model.id = mapping."modelId"
        JOIN "Make" make ON make.id = model."makeId"
        JOIN "PartComponentType" component ON component.id = mapping."componentTypeId"
        JOIN "PartCategory" category ON category.id = component."categoryId"
        WHERE make.slug = 'ferrari'
          AND mapping.active = true
          AND component.active = true
          AND NOT EXISTS (
            SELECT 1
            FROM "PartOfferContext" context
            JOIN "PartOffer" offer ON offer.id = context."offerId"
            WHERE context."modelPartComponentId" = mapping.id
              AND context.active = true
              AND offer.active = true
              AND offer."affiliateUrl" IS NOT NULL
              AND (offer."expiresAt" IS NULL OR offer."expiresAt" > ${now})
          )
      )
      SELECT model_id, category_name, component_name
      FROM uncovered
      WHERE row_number <= 25
    `,
    prisma.modelPartComponent.findMany({
      where: {
        active: true,
        lastOfferSearchAt: { not: null },
        model: { make: { slug: "ferrari" } },
        componentType: { active: true },
      },
      distinct: ["modelId"],
      select: { modelId: true },
    }),
    prisma.partCategory.count({ where: { active: true, componentTypes: { some: { active: true, modelMappings: { some: { active: true, model: { make: { slug: "ferrari" } } } } } } } }),
    prisma.partComponentType.count({ where: { active: true, modelMappings: { some: { active: true, model: { make: { slug: "ferrari" } } } } } }),
    prisma.partDiscoveryQuery.aggregate({
      where: { modelPartComponent: { model: { make: { slug: "ferrari" } } } },
      _sum: {
        attempts: true,
        listingsExamined: true,
        listingsAccepted: true,
        listingsRejected: true,
        rateLimitEvents: true,
      },
      _count: true,
      _max: { lastSuccessAt: true },
    }),
    prisma.partDiscoveryQuery.groupBy({
      by: ["status"],
      where: { modelPartComponent: { model: { make: { slug: "ferrari" } } } },
      _count: true,
    }),
    prisma.performancePart.count({
      where: {
        sourceCatalog: "EBAY_PRODUCT_FAMILY",
        status: "ACTIVE",
        compatibility: { some: { model: { make: { slug: "ferrari" } } } },
      },
    }),
    prisma.partIdentifier.findMany({
      where: {
        type: "OEM",
        confidence: "HIGH",
        part: { status: "ACTIVE", compatibility: { some: { model: { make: { slug: "ferrari" } } } } },
      },
      distinct: ["normalizedValue"],
      select: { normalizedValue: true },
    }),
    prisma.partIdentifier.findMany({
      where: {
        type: "MPN",
        confidence: "HIGH",
        part: { status: "ACTIVE", compatibility: { some: { model: { make: { slug: "ferrari" } } } } },
      },
      distinct: ["normalizedValue"],
      select: { normalizedValue: true },
    }),
    prisma.partOffer.count({
      where: {
        provider: "EBAY",
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        contexts: { some: { active: true, modelPartComponent: { model: { make: { slug: "ferrari" } } } } },
      },
    }),
    prisma.partOffer.count({
      where: {
        provider: "EBAY",
        active: true,
        affiliateUrl: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        contexts: { some: { active: true, modelPartComponent: { model: { make: { slug: "ferrari" } } } } },
      },
    }),
    prisma.partOffer.groupBy({
      by: ["classification"],
      where: { provider: "EBAY", active: true, contexts: { some: { modelPartComponent: { model: { make: { slug: "ferrari" } } } } } },
      _count: true,
    }),
    prisma.partSourceRun.findFirst({
      where: { source: "EBAY_BROWSE_API", runType: "FERRARI_COMPONENT_DISCOVERY", status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select: { id: true, status: true, startedAt: true, completedAt: true, stats: true },
    }),
    prisma.partSourceRun.findFirst({
      where: { source: "EBAY_BROWSE_API", runType: "FERRARI_COMPONENT_DISCOVERY" },
      orderBy: { startedAt: "desc" },
      select: { id: true, status: true, startedAt: true, completedAt: true, errorSummary: true, stats: true },
    }),
  ]);

  const modelCoverage = new Map<string, { total: number; covered: number; gaps: Array<{ category: string; component: string }> }>();
  const categoryCoverage = new Map<string, { name: string; total: number; covered: number }>();
  for (const row of coverageRows) {
    const total = Number(row.mapped_components);
    const covered = Number(row.covered_components);
    const modelRow = modelCoverage.get(row.model_id) ?? { total: 0, covered: 0, gaps: [] };
    modelRow.total += total;
    modelRow.covered += covered;
    modelCoverage.set(row.model_id, modelRow);
    const categoryRow = categoryCoverage.get(row.category_slug) ?? { name: row.category_name, total: 0, covered: 0 };
    categoryRow.total += total;
    categoryRow.covered += covered;
    categoryCoverage.set(row.category_slug, categoryRow);
  }
  for (const gap of gapRows) {
    const modelRow = modelCoverage.get(gap.model_id) ?? { total: 0, covered: 0, gaps: [] };
    modelRow.gaps.push({ category: gap.category_name, component: gap.component_name });
    modelCoverage.set(gap.model_id, modelRow);
  }

  const coverageByModel = Object.fromEntries(models.map((model) => {
    const coverage = modelCoverage.get(model.id) ?? { total: 0, covered: 0, gaps: [] };
    return [model.name, {
      mappedComponents: coverage.total,
      componentsWithOffers: coverage.covered,
      coveragePercent: percent(coverage.covered, coverage.total),
      sampleSourcingGaps: coverage.gaps,
    }];
  }));
  const coverageByCategory = Object.fromEntries([...categoryCoverage.entries()]
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([slug, coverage]) => [slug, {
      name: coverage.name,
      mappedComponents: coverage.total,
      componentsWithOffers: coverage.covered,
      coveragePercent: percent(coverage.covered, coverage.total),
    }]));
  const processedModelIds = new Set(processedModelRows.map((row) => row.modelId));
  const modelsProcessed = models.filter((model) => processedModelIds.has(model.id));
  const modelsWithOffers = models.filter((model) => (modelCoverage.get(model.id)?.covered ?? 0) > 0);
  const modelComponentMappings = coverageRows.reduce((sum, row) => sum + Number(row.mapped_components), 0);
  const componentsWithOffers = coverageRows.reduce((sum, row) => sum + Number(row.covered_components), 0);

  console.log(JSON.stringify({
    methodology: "Coverage is the percentage of active model-component mappings with at least one active, unexpired, affiliate-enabled offer. Raw listing volume does not increase the score.",
    ferrariModelsInSupercarDash: models.length,
    modelsProcessed: modelsProcessed.length,
    modelsWithComponentMappings: models.filter((model) => (modelCoverage.get(model.id)?.total ?? 0) > 0).length,
    modelsWithEbayResults: modelsWithOffers.length,
    modelsWithZeroResults: models.filter((model) => (modelCoverage.get(model.id)?.covered ?? 0) === 0).map((model) => model.name),
    categories,
    canonicalComponentTypes: componentTypes,
    modelComponentMappings,
    discoveryQueries: discoveryTotals._count,
    ebayQueriesExecuted: discoveryTotals._sum.attempts ?? 0,
    ebayListingsExamined: discoveryTotals._sum.listingsExamined ?? 0,
    listingsAccepted: discoveryTotals._sum.listingsAccepted ?? 0,
    listingsRejected: discoveryTotals._sum.listingsRejected ?? 0,
    canonicalProductFamilies: productFamilies,
    uniqueOemNumbers: oemIdentifiers.length,
    uniqueManufacturerPartNumbers: mpnIdentifiers.length,
    activeAffiliateOffers: affiliateOffers,
    activeOffers,
    affiliateUrlCoverage: `${percent(affiliateOffers, activeOffers)}%`,
    componentsWithOffers,
    componentsWithoutOffers: modelComponentMappings - componentsWithOffers,
    queryStatuses: Object.fromEntries(discoveryStatuses.map((row) => [row.status, row._count])),
    offerClassifications: Object.fromEntries(classifications.map((row) => [row.classification, row._count])),
    apiFailures: discoveryStatuses.filter((row) => row.status === "FAILED").reduce((sum, row) => sum + row._count, 0),
    rateLimitEvents: discoveryTotals._sum.rateLimitEvents ?? 0,
    lastSuccessfulRefresh: discoveryTotals._max.lastSuccessAt,
    latestSuccessfulRun,
    latestRun,
    coverageByModel,
    coverageByCategory,
  }, null, 2));
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
