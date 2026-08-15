import {
  searchEbayOffersForFerrariComponentQuery,
} from "../lib/ebay/browse.server";
import { FERRARI_AFTERMARKET_QUERY_BRANDS } from "../lib/parts/ferrari-component-library";
import {
  buildComponentAffiliateReference,
  getFerrariComponentOffers,
} from "../lib/parts/ferrari-component-service";
import { prisma } from "../lib/prisma";

function readArgument(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  return raw?.replace(/^['"]|['"]$/g, "").trim() || fallback;
}

async function main() {
  const compact = process.argv.includes("--compact");
  const modelInput = readArgument("model", "458 Italia");
  const componentInput = readArgument("component", "Engine Air Filter");
  const mapping = await prisma.modelPartComponent.findFirst({
    where: {
      active: true,
      model: { name: { equals: modelInput, mode: "insensitive" }, make: { slug: "ferrari" } },
      componentType: { name: { equals: componentInput, mode: "insensitive" }, active: true },
    },
    select: {
      id: true,
      model: { select: { id: true, name: true, slug: true, productionStartYear: true, productionEndYear: true } },
      componentType: {
        select: {
          name: true,
          slug: true,
          aliases: true,
          fitmentRisk: true,
          category: { select: { slug: true } },
        },
      },
    },
  });
  if (!mapping) throw new Error(`No active Ferrari mapping found for ${modelInput} / ${componentInput}.`);

  const knownFerrariModels = (await prisma.model.findMany({
    where: { make: { slug: "ferrari" } },
    select: { name: true },
  })).map((model) => model.name);
  const aliases = Array.isArray(mapping.componentType.aliases)
    ? mapping.componentType.aliases.filter((value): value is string => typeof value === "string")
    : [];
  const year = mapping.model.productionEndYear ?? mapping.model.productionStartYear;
  const referenceId = buildComponentAffiliateReference(
    "ferrari",
    mapping.model.slug,
    mapping.componentType.category.slug,
    mapping.componentType.slug,
    year,
  );
  const shortModel = mapping.model.name.match(/\b\d{3}\b/)?.[0] ?? mapping.model.name;
  const broadComponent = mapping.componentType.name.replace(/^engine\s+/i, "");
  const queries = [...new Set([
    `Ferrari ${mapping.model.name} ${broadComponent}`,
    `Ferrari ${shortModel} ${broadComponent}`,
    `Ferrari ${shortModel} engine air filter`,
    `Ferrari ${shortModel} performance air filter`,
  ])];

  const queryReports = [];
  for (const query of queries) {
    const result = await searchEbayOffersForFerrariComponentQuery({
      query,
      modelName: mapping.model.name,
      componentName: mapping.componentType.name,
      knownFerrariModels,
      knownBrands: FERRARI_AFTERMARKET_QUERY_BRANDS[mapping.componentType.category.slug] ?? [],
      aliases,
      fitmentRisk: mapping.componentType.fitmentRisk === "LOW" || mapping.componentType.fitmentRisk === "HIGH"
        ? mapping.componentType.fitmentRisk
        : "MEDIUM",
      categorySlug: mapping.componentType.category.slug,
      year,
      referenceId,
      limit: 20,
      includeDiagnostics: true,
    });
    queryReports.push({
      query,
      rawResultCount: result.examinedCount,
      relevantResultCount: result.offers.length,
      rejectedResults: result.rejectedCount,
      missingAffiliateUrls: result.missingAffiliateUrlCount,
      rejectionReasons: result.rejectionReasons,
      ...(!compact ? { candidates: result.candidateDiagnostics?.slice(0, 12) } : {}),
    });
  }

  const before = await prisma.partOfferContext.count({
    where: { modelPartComponentId: mapping.id, active: true, offer: { provider: "EBAY", active: true } },
  });
  const refreshed = await getFerrariComponentOffers({
    modelSlug: mapping.model.slug,
    categorySlug: mapping.componentType.category.slug,
    componentSlug: mapping.componentType.slug,
    year,
    forceRefresh: true,
  });
  const after = await prisma.partOfferContext.count({
    where: { modelPartComponentId: mapping.id, active: true, offer: { provider: "EBAY", active: true } },
  });

  console.log(JSON.stringify({
    model: mapping.model.name,
    component: mapping.componentType.name,
    generatedQueries: queries,
    affiliateRequest: {
      campaignConfigured: Boolean(process.env.EBAY_EPN_CAMPAIGN_ID?.trim()),
      affiliateReferenceId: referenceId,
    },
    queryReports,
    persistence: {
      offersBefore: before,
      offersAfter: after,
      databaseWriteStatus: refreshed?.cache.refreshed ? "REFRESH_COMPLETED" : "CACHE_RETURNED",
    },
    pageVisible: {
      offers: refreshed?.offers.length ?? 0,
      affiliateEnabledOffers: refreshed?.offers.filter((offer) => Boolean(offer.itemAffiliateWebUrl)).length ?? 0,
      status: refreshed?.cache.status ?? "MAPPING_NOT_FOUND",
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
