import { PrismaClient } from "@prisma/client";
import { getUniversalPartComponentGroup } from "../lib/parts/part-type-hierarchy";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const ferrari = await prisma.make.findUnique({ where: { slug: "ferrari" }, select: { id: true } });
  if (!ferrari) throw new Error("Ferrari make record is missing.");
  const [
    models,
    mappings,
    componentGroups,
    partTypes,
    templateCount,
    liveContextGroups,
    liveContexts,
    affiliateContexts,
    canonicalOemParts,
  ] = await Promise.all([
    prisma.model.count({ where: { makeId: ferrari.id } }),
    prisma.modelPartComponent.findMany({
      where: { model: { makeId: ferrari.id }, active: true },
      select: {
        id: true,
        lastOfferRejectedCount: true,
        componentType: { select: { id: true, categoryId: true } },
      },
    }),
    prisma.modelPartComponent.groupBy({
      by: ["componentTypeId"],
      where: { model: { makeId: ferrari.id }, active: true },
    }),
    prisma.partComponentType.findMany({
      where: { active: true, modelMappings: { some: { active: true, model: { makeId: ferrari.id } } } },
      select: { name: true, systemGroup: true, category: { select: { slug: true } } },
    }),
    prisma.partComponentSearchTemplate.count({
      where: { active: true, componentType: { modelMappings: { some: { model: { makeId: ferrari.id }, active: true } } } },
    }),
    prisma.partOfferContext.groupBy({
      by: ["modelPartComponentId"],
      where: {
        active: true,
        modelPartComponent: { model: { makeId: ferrari.id } },
        offer: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      },
    }),
    prisma.partOfferContext.count({
      where: {
        active: true,
        modelPartComponent: { model: { makeId: ferrari.id } },
        offer: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      },
    }),
    prisma.partOfferContext.count({
      where: {
        active: true,
        modelPartComponent: { model: { makeId: ferrari.id } },
        offer: { active: true, affiliateUrl: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      },
    }),
    prisma.performancePart.count({
      where: { oemPartNumber: { not: null }, compatibility: { some: { model: { makeId: ferrari.id } } } },
    }),
  ]);
  const categoryIds = new Set(mappings.map((mapping) => mapping.componentType.categoryId));
  const universalComponents = new Set(partTypes.map((partType) =>
    getUniversalPartComponentGroup(partType.category.slug, partType.name, partType.systemGroup).slug,
  ));
  const rejectedResults = mappings.reduce((sum, mapping) => sum + mapping.lastOfferRejectedCount, 0);
  console.log(JSON.stringify({
    architecture: {
      permanentHierarchy: "System -> Component -> Part Type -> Vehicle Applicability",
      supplierQueryTrigger: "PART_TYPE_SELECTION",
      canonicalSkuRequiredForNavigation: false,
      marketplaceMayCreateCanonicalProducts: false,
      offerQualityTiers: ["OEM", "BEST", "BETTER", "GOOD", "GENERIC"],
    },
    ferrariModels: models,
    systems: categoryIds.size,
    components: universalComponents.size,
    partTypes: componentGroups.length,
    vehicleApplicabilityMappings: mappings.length,
    searchTemplates: templateCount,
    componentsWithLiveOffers: liveContextGroups.length,
    componentsWithoutLiveOffers: Math.max(0, mappings.length - liveContextGroups.length),
    liveOffers: liveContexts,
    rejectedEbayResults: rejectedResults,
    affiliateUrlCoverage: liveContexts === 0 ? "No live offers yet" : `${((affiliateContexts / liveContexts) * 100).toFixed(1)}%`,
    displayedBuyLinksWithoutAffiliateUrl: liveContexts - affiliateContexts,
    canonicalOemParts,
    storagePolicy: {
      navigation: "PERMANENT",
      marketplaceOffers: "VOLATILE_TTL_CACHE",
      canonicalProducts: "OPTIONAL_ENRICHMENT",
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
