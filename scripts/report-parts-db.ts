import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

const PART_TABLES = [
  "PartComponentType",
  "ModelPartComponent",
  "PerformancePart",
  "PartIdentifier",
  "PartCompatibility",
  "PartOffer",
  "PartOfferContext",
  "PartOfferProvider",
  "PreferredPartBrand",
  "PartAffiliateClick",
  "PartDiscoveryQuery",
  "PartSourceRun",
] as const;

async function main() {
  const now = new Date();
  const [
    componentTypes,
    modelComponentMappings,
    canonicalParts,
    identifiers,
    compatibility,
    activeOffers,
    inactiveOffers,
    affiliateClicks,
    performanceRecords,
    offerProviders,
    preferredBrandMappings,
    tableSizes,
    databaseSize,
  ] = await Promise.all([
    prisma.partComponentType.count(),
    prisma.modelPartComponent.count(),
    prisma.performancePart.count(),
    prisma.partIdentifier.count(),
    prisma.partCompatibility.count(),
    prisma.partOffer.count({ where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    prisma.partOffer.count({ where: { OR: [{ active: false }, { expiresAt: { lte: now } }] } }),
    prisma.partAffiliateClick.count(),
    prisma.performancePart.count({
      where: { OR: [{ estimatedHpGain: { not: null } }, { estimatedTorqueGain: { not: null } }] },
    }),
    prisma.partOfferProvider.count(),
    prisma.preferredPartBrand.count(),
    prisma.$queryRaw<Array<{
      tableName: string;
      tableBytes: bigint;
      indexBytes: bigint;
      totalBytes: bigint;
      estimatedRows: bigint;
    }>>`
      SELECT
        tables.relname AS "tableName",
        pg_relation_size(tables.relid)::bigint AS "tableBytes",
        pg_indexes_size(tables.relid)::bigint AS "indexBytes",
        pg_total_relation_size(tables.relid)::bigint AS "totalBytes",
        COALESCE(stats.n_live_tup, 0)::bigint AS "estimatedRows"
      FROM pg_catalog.pg_statio_user_tables tables
      LEFT JOIN pg_catalog.pg_stat_user_tables stats ON stats.relid = tables.relid
      WHERE tables.relname = ANY(${PART_TABLES as unknown as string[]})
      ORDER BY pg_total_relation_size(tables.relid) DESC
    `,
    prisma.$queryRaw<Array<{ bytes: bigint }>>`SELECT pg_database_size(current_database())::bigint AS bytes`,
  ]);

  console.log(JSON.stringify({
    counts: {
      componentTypes,
      modelComponentMappings,
      canonicalParts,
      partIdentifiers: identifiers,
      partCompatibility: compatibility,
      activePartOffers: activeOffers,
      inactivePartOffers: inactiveOffers,
      affiliateClicks,
      performanceRecords,
      offerProviders,
      preferredBrandMappings,
    },
    databaseBytes: Number(databaseSize[0]?.bytes ?? 0),
    partsTablesBytes: tableSizes.reduce((sum, table) => sum + Number(table.totalBytes), 0),
    tables: tableSizes.map((table) => ({
      ...table,
      tableBytes: Number(table.tableBytes),
      indexBytes: Number(table.indexBytes),
      totalBytes: Number(table.totalBytes),
      estimatedRows: Number(table.estimatedRows),
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
