import { getFerrariComponentOffers } from "../lib/parts/ferrari-component-service";
import { prisma } from "../lib/prisma";

async function main() {
  const result = await getFerrariComponentOffers({
    modelSlug: "458-italia",
    categorySlug: "maintenance-service",
    componentSlug: "engine-air-filter",
    year: 2013,
    forceRefresh: true,
  });
  if (!result) throw new Error("Ferrari 458 Italia Engine Air Filter mapping was not found.");
  const confidenceCounts = result.offers.reduce<Record<string, number>>((counts, offer) => {
    counts[offer.fitmentConfidence] = (counts[offer.fitmentConfidence] ?? 0) + 1;
    return counts;
  }, {});
  console.log(JSON.stringify({
    model: result.model.name,
    system: result.category.name,
    component: result.component.name,
    searchStatus: result.cache.status,
    refreshed: result.cache.refreshed,
    offersReturned: result.offers.length,
    confidenceCounts,
    affiliateUrlsPresent: result.offers.every((offer) => Boolean(offer.itemAffiliateWebUrl)),
    affiliateBuyRoutesPresent: result.offers.every((offer) => offer.buyUrl.startsWith("/out/parts/offers/")),
    sample: result.offers.slice(0, 3).map((offer) => ({
      title: offer.title,
      confidence: offer.fitmentConfidence,
      compatibilityStatus: offer.compatibilityStatus,
      rankReason: offer.rankReason,
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
