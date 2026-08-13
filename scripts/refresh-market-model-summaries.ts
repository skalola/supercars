import { Prisma, PrismaClient } from "@prisma/client";
import { getArgValue, getBatchLimit } from "./lib/script-guards";

const prisma = new PrismaClient();

async function main() {
  const make = getArgValue("--make");
  const modelId = getArgValue("--model-id");
  const limit = getBatchLimit({ defaultLimit: 1000, maxLimit: 2000 });

  const models = await prisma.model.findMany({
    where: {
      ...(modelId ? { id: modelId } : {}),
      ...(make ? { make: { name: { equals: make, mode: "insensitive" } } } : {}),
    },
    select: { id: true },
    orderBy: [{ make: { name: "asc" } }, { name: "asc" }],
    take: limit,
  });

  if (models.length === 0) {
    console.log(JSON.stringify({ refreshed: 0, limit, make: make || null, modelId: modelId || null }, null, 2));
    return;
  }

  const modelIds = models.map((model) => model.id);
  const refreshed = await refreshSummaries(modelIds);

  console.log(JSON.stringify({ refreshed, limit, make: make || null, modelId: modelId || null }, null, 2));
}

async function refreshSummaries(modelIds: string[]) {
  return prisma.$executeRaw(Prisma.sql`
    WITH target_models AS (
      SELECT model."id"
      FROM "Model" model
      WHERE model."id" IN (${Prisma.join(modelIds)})
    ),
    listing_stats AS (
      SELECT
        listing."modelId",
        COUNT(*)::int AS listing_count,
        MIN(COALESCE(listing."askingPrice", listing."price"))::double precision AS lowest_price,
        MAX(COALESCE(listing."askingPrice", listing."price"))::double precision AS highest_price,
        AVG(COALESCE(listing."askingPrice", listing."price"))::double precision AS average_price,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY COALESCE(listing."askingPrice", listing."price")
        )::double precision AS median_price,
        SUM(COALESCE(listing."askingPrice", listing."price"))::double precision AS inventory_value,
        MAX(COALESCE(listing."lastSeen", listing."updatedAt")) AS last_seen_at
      FROM "Listing" listing
      INNER JOIN target_models target ON target."id" = listing."modelId"
      INNER JOIN "Vehicle" vehicle ON vehicle."id" = listing."vehicleId"
      LEFT JOIN "MarketSource" source ON source."id" = listing."sourceId"
      WHERE listing."status" = 'ACTIVE'
        AND listing."validationStatus" = 'VALID'
        AND listing."vehicleId" IS NOT NULL
        AND listing."sourceId" IS NOT NULL
        AND listing."externalListingId" IS NOT NULL
        AND listing."url" IS NOT NULL
        AND listing."sellerId" IS NULL
        AND listing."priceStatus" IS DISTINCT FROM 'PRICE_INVALID'
        AND vehicle."inventoryStatus" IN ('ACTIVE', 'VALID', 'WARNING')
        AND COALESCE(listing."askingPrice", listing."price") >= 10000
        AND (source."type" IS NULL OR source."type" <> 'AUCTION')
        AND listing."url" NOT ILIKE '%bringatrailer.com%'
        AND listing."externalListingId" NOT ILIKE '%sprint-%'
        AND listing."externalListingId" NOT ILIKE '%admin-ops%'
        AND listing."externalListingId" NOT ILIKE '%demo%'
        AND listing."externalListingId" NOT ILIKE '%test%'
      GROUP BY listing."modelId"
    ),
    recent_sale_stats AS (
      SELECT
        sale."modelId",
        COUNT(*)::int AS sale_count,
        AVG(sale."salePrice")::double precision AS average_sale_price,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY sale."salePrice")::double precision AS median_sale_price,
        AVG(sale."mileage")::double precision AS average_sale_mileage
      FROM "MarketSale" sale
      INNER JOIN target_models target ON target."id" = sale."modelId"
      WHERE sale."saleDate" >= NOW() - INTERVAL '90 days'
        AND sale."salePrice" BETWEEN 10000 AND 20000000
      GROUP BY sale."modelId"
    ),
    latest_sales AS (
      SELECT sale."modelId", MAX(sale."saleDate") AS last_sale_at
      FROM "MarketSale" sale
      INNER JOIN target_models target ON target."id" = sale."modelId"
      WHERE sale."salePrice" BETWEEN 10000 AND 20000000
      GROUP BY sale."modelId"
    ),
    ranked_snapshots AS (
      SELECT
        snapshot."modelId",
        snapshot."averagePrice",
        ROW_NUMBER() OVER (PARTITION BY snapshot."modelId" ORDER BY snapshot."date" ASC) AS first_rank,
        ROW_NUMBER() OVER (PARTITION BY snapshot."modelId" ORDER BY snapshot."date" DESC) AS last_rank,
        COUNT(*) OVER (PARTITION BY snapshot."modelId")::int AS snapshot_count
      FROM "MarketSnapshot" snapshot
      INNER JOIN target_models target ON target."id" = snapshot."modelId"
      WHERE snapshot."date" >= NOW() - INTERVAL '12 months'
        AND snapshot."averagePrice" IS NOT NULL
    ),
    trend_stats AS (
      SELECT
        ranked."modelId",
        MAX(CASE WHEN ranked.first_rank = 1 THEN ranked."averagePrice" END)::double precision AS first_price,
        MAX(CASE WHEN ranked.last_rank = 1 THEN ranked."averagePrice" END)::double precision AS last_price,
        MAX(ranked.snapshot_count)::int AS snapshot_count
      FROM ranked_snapshots ranked
      GROUP BY ranked."modelId"
    ),
    summary_rows AS (
      SELECT
        target."id" AS model_id,
        COALESCE(listing.listing_count, 0) AS listing_count,
        listing.lowest_price,
        listing.highest_price,
        listing.average_price,
        listing.median_price,
        COALESCE(listing.inventory_value, 0)::double precision AS inventory_value,
        COALESCE(sales.sale_count, 0) AS sale_count,
        sales.average_sale_price,
        sales.median_sale_price,
        sales.average_sale_mileage,
        CASE
          WHEN listing.average_price IS NOT NULL AND sales.average_sale_price IS NOT NULL
            THEN sales.average_sale_price - listing.average_price
          ELSE NULL
        END AS asking_sold_difference,
        CASE
          WHEN listing.average_price IS NOT NULL AND listing.average_price <> 0 AND sales.average_sale_price IS NOT NULL
            THEN ROUND((((sales.average_sale_price - listing.average_price) / listing.average_price) * 100)::numeric, 1)::double precision
          ELSE NULL
        END AS asking_sold_difference_pct,
        CASE
          WHEN trend.snapshot_count < 2 OR trend.first_price IS NULL OR trend.first_price = 0 OR trend.last_price IS NULL THEN NULL
          WHEN ((trend.last_price - trend.first_price) / trend.first_price) * 100 > 1 THEN 'UP'
          WHEN ((trend.last_price - trend.first_price) / trend.first_price) * 100 < -1 THEN 'DOWN'
          ELSE 'STABLE'
        END AS trend_direction,
        CASE
          WHEN trend.snapshot_count < 2 OR trend.first_price IS NULL OR trend.first_price = 0 OR trend.last_price IS NULL THEN NULL
          ELSE ROUND((((trend.last_price - trend.first_price) / trend.first_price) * 100)::numeric, 1)::double precision
        END AS trend_change_pct,
        COALESCE(trend.snapshot_count, 0) AS snapshot_count,
        listing.last_seen_at,
        latest.last_sale_at
      FROM target_models target
      LEFT JOIN listing_stats listing ON listing."modelId" = target."id"
      LEFT JOIN recent_sale_stats sales ON sales."modelId" = target."id"
      LEFT JOIN latest_sales latest ON latest."modelId" = target."id"
      LEFT JOIN trend_stats trend ON trend."modelId" = target."id"
    )
    INSERT INTO "MarketModelSummary" (
      "modelId", "activeListingCount", "lowestListingPrice", "highestListingPrice",
      "averageAskingPrice", "medianAskingPrice", "totalActiveInventoryValue",
      "recentSalesCount", "averageSalePrice", "medianSalePrice", "averageSaleMileage",
      "averageSoldPrice", "askingVsSoldDifference", "askingVsSoldDifferencePct",
      "trendDirection", "trendChangePercent", "trendSnapshotCount",
      "lastListingSeenAt", "lastSaleSeenAt", "refreshedAt", "createdAt", "updatedAt"
    )
    SELECT
      summary.model_id, summary.listing_count, summary.lowest_price, summary.highest_price,
      summary.average_price, summary.median_price, summary.inventory_value,
      summary.sale_count, summary.average_sale_price, summary.median_sale_price, summary.average_sale_mileage,
      summary.average_sale_price, summary.asking_sold_difference, summary.asking_sold_difference_pct,
      summary.trend_direction, summary.trend_change_pct, summary.snapshot_count,
      summary.last_seen_at, summary.last_sale_at, NOW(), NOW(), NOW()
    FROM summary_rows summary
    ON CONFLICT ("modelId") DO UPDATE SET
      "activeListingCount" = EXCLUDED."activeListingCount",
      "lowestListingPrice" = EXCLUDED."lowestListingPrice",
      "highestListingPrice" = EXCLUDED."highestListingPrice",
      "averageAskingPrice" = EXCLUDED."averageAskingPrice",
      "medianAskingPrice" = EXCLUDED."medianAskingPrice",
      "totalActiveInventoryValue" = EXCLUDED."totalActiveInventoryValue",
      "recentSalesCount" = EXCLUDED."recentSalesCount",
      "averageSalePrice" = EXCLUDED."averageSalePrice",
      "medianSalePrice" = EXCLUDED."medianSalePrice",
      "averageSaleMileage" = EXCLUDED."averageSaleMileage",
      "averageSoldPrice" = EXCLUDED."averageSoldPrice",
      "askingVsSoldDifference" = EXCLUDED."askingVsSoldDifference",
      "askingVsSoldDifferencePct" = EXCLUDED."askingVsSoldDifferencePct",
      "trendDirection" = EXCLUDED."trendDirection",
      "trendChangePercent" = EXCLUDED."trendChangePercent",
      "trendSnapshotCount" = EXCLUDED."trendSnapshotCount",
      "lastListingSeenAt" = EXCLUDED."lastListingSeenAt",
      "lastSaleSeenAt" = EXCLUDED."lastSaleSeenAt",
      "refreshedAt" = EXCLUDED."refreshedAt",
      "updatedAt" = NOW()
  `);
}

main()
  .catch((error) => {
    console.error("Market summary refresh failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
