import { getFerrariComponentOffers } from "../lib/parts/ferrari-component-service";
import { prisma } from "../lib/prisma";

async function main() {
  const result = await getFerrariComponentOffers({
    modelSlug: "458-italia",
    categorySlug: "brakes",
    componentSlug: "front-brake-pads",
    year: 2013,
    cacheOnly: true,
  });

  const [providers, nonFerrariProductionMappings] = await Promise.all([
    prisma.partOfferProvider.findMany({
      select: {
        code: true,
        providerType: true,
        active: true,
        _count: { select: { offers: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.preferredPartBrand.count({
      where: { vehicleMake: { slug: { not: "ferrari" } } },
    }),
  ]);

  console.log(JSON.stringify({
    ferrariFlow: {
      found: Boolean(result),
      model: result?.model.name ?? null,
      component: result?.component.name ?? null,
      preferredBrands: result?.preferredBrands.map((brand) => ({
        name: brand.name,
        relationshipType: brand.relationshipType,
        badge: brand.badge,
        affiliateStatus: brand.affiliateStatus,
      })) ?? [],
      canonicalProductCount: result?.products.length ?? 0,
      offerCount: result?.offers.length ?? 0,
      topOffer: result?.offers[0]
        ? {
            provider: result.offers[0].provider,
            providerType: result.offers[0].providerType,
            rankReason: result.offers[0].rankReason,
          }
        : null,
    },
    providers,
    nonFerrariProductionMappings,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
