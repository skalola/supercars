import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  const [partBrandsConfigured, mappings, statuses, relationships, providers] = await Promise.all([
    prisma.partBrand.count({ where: { preferredMappings: { some: {} } } }),
    prisma.preferredPartBrand.count(),
    prisma.preferredPartBrand.groupBy({ by: ["affiliateStatus"], _count: true }),
    prisma.preferredPartBrand.groupBy({ by: ["relationshipType"], _count: true }),
    prisma.partOfferProvider.findMany({
      select: {
        code: true,
        name: true,
        providerType: true,
        active: true,
        _count: { select: { offers: true, preferredBrands: true } },
      },
      orderBy: { code: "asc" },
    }),
  ]);
  console.log(JSON.stringify({
    partBrandsConfigured,
    preferredBrandMappings: mappings,
    affiliateStatuses: Object.fromEntries(statuses.map((row) => [row.affiliateStatus, row._count])),
    relationshipTypes: Object.fromEntries(relationships.map((row) => [row.relationshipType, row._count])),
    providers,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
