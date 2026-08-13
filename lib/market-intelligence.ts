/**
 * lib/market-intelligence.ts
 *
 * Sprint 5.4: Market Intelligence Calculation Engine
 *
 * Pure server-side functions. No UI. No external APIs.
 * Consumes: Listing, MarketSale, MarketSnapshot tables.
 *
 * Future pipeline:
 *   External Sources → Listing/MarketSale → Market Intelligence Engine → Charts + Valuation
 */

import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MarketRange = {
  lowestPrice: number;
  highestPrice: number;
  averageAskingPrice: number;
  medianAskingPrice: number;
  activeListingCount: number;
};

export type MarketSupply = {
  activeListingCount: number;
};

export type RecentSalesPerformance = {
  salesCount: number;
  averageSalePrice: number | null;
  medianSalePrice: number | null;
  averageMileage: number | null;
  periodDays: number;
};

export type AskingVsSold = {
  averageAskingPrice: number | null;
  averageSoldPrice: number | null;
  difference: number | null;
  differencePercent: number | null;
};

export type TrendDirection = "UP" | "DOWN" | "STABLE";

export type MarketTrend = {
  direction: TrendDirection;
  changePercent: number | null;
  snapshotCount: number;
  label: string;
};

export type MarketSummary = {
  modelId: string;
  range: MarketRange | null;
  supply: MarketSupply;
  recentSales: RecentSalesPerformance;
  askingVsSold: AskingVsSold;
  trend: MarketTrend | null;
  hasData: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trendLabel(direction: TrendDirection, pct: number | null): string {
  if (pct === null) return "Insufficient data";
  const pctStr = Math.abs(pct).toFixed(1);
  if (direction === "UP") return `Increasing +${pctStr}%`;
  if (direction === "DOWN") return `Decreasing -${pctStr}%`;
  return "Stable";
}

function toTrendDirection(value: string): TrendDirection {
  return value === "UP" || value === "DOWN" || value === "STABLE" ? value : "STABLE";
}

function sourceBackedInventoryListingWhere(modelId: string): Prisma.ListingWhereInput {
  return {
    modelId,
    status: "ACTIVE",
    validationStatus: "VALID",
    vehicleId: { not: null },
    sourceId: { not: null },
    externalListingId: { not: null },
    url: { not: null },
    sellerId: null,
    priceStatus: { not: "PRICE_INVALID" },
    vehicle: {
      is: {
        inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] },
      },
    },
    OR: [
      { askingPrice: { gte: 10000 } },
      { price: { gte: 10000 } },
    ],
    NOT: [
      { source: { is: { type: "AUCTION" } } },
      { url: { contains: "bringatrailer.com", mode: "insensitive" } },
      { externalListingId: { contains: "sprint-", mode: "insensitive" } },
      { externalListingId: { contains: "admin-ops", mode: "insensitive" } },
      { externalListingId: { contains: "demo", mode: "insensitive" } },
      { externalListingId: { contains: "test", mode: "insensitive" } },
    ],
  };
}

async function getMarketModelSummaryRow(modelId: string) {
  return prisma.marketModelSummary.findUnique({
    where: { modelId },
    select: {
      modelId: true,
      activeListingCount: true,
      lowestListingPrice: true,
      highestListingPrice: true,
      averageAskingPrice: true,
      medianAskingPrice: true,
      recentSalesCount: true,
      averageSalePrice: true,
      medianSalePrice: true,
      averageSaleMileage: true,
      averageSoldPrice: true,
      askingVsSoldDifference: true,
      askingVsSoldDifferencePct: true,
      trendDirection: true,
      trendChangePercent: true,
      trendSnapshotCount: true,
    },
  });
}

type MarketRangeAggregate = {
  lowestPrice: number | null;
  highestPrice: number | null;
  averageAskingPrice: number | null;
  medianAskingPrice: number | null;
  activeListingCount: number;
};

async function calculateMarketRange(modelId: string): Promise<MarketRange | null> {
  const [aggregate] = await prisma.$queryRaw<MarketRangeAggregate[]>(Prisma.sql`
    SELECT
      MIN(COALESCE(listing."askingPrice", listing."price"))::double precision AS "lowestPrice",
      MAX(COALESCE(listing."askingPrice", listing."price"))::double precision AS "highestPrice",
      AVG(COALESCE(listing."askingPrice", listing."price"))::double precision AS "averageAskingPrice",
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY COALESCE(listing."askingPrice", listing."price")
      )::double precision AS "medianAskingPrice",
      COUNT(*)::int AS "activeListingCount"
    FROM "Listing" listing
    INNER JOIN "Vehicle" vehicle ON vehicle."id" = listing."vehicleId"
    LEFT JOIN "MarketSource" source ON source."id" = listing."sourceId"
    WHERE listing."modelId" = ${modelId}
      AND listing."status" = 'ACTIVE'
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
  `);

  if (!aggregate || aggregate.activeListingCount === 0) return null;

  return {
    lowestPrice: aggregate.lowestPrice ?? 0,
    highestPrice: aggregate.highestPrice ?? 0,
    averageAskingPrice: Math.round(aggregate.averageAskingPrice ?? 0),
    medianAskingPrice: Math.round(aggregate.medianAskingPrice ?? aggregate.averageAskingPrice ?? 0),
    activeListingCount: aggregate.activeListingCount,
  };
}

type RecentSalesAggregate = {
  salesCount: number;
  averageSalePrice: number | null;
  medianSalePrice: number | null;
  averageMileage: number | null;
};

async function calculateRecentSales(modelId: string, periodDays: number): Promise<RecentSalesPerformance> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const [aggregate] = await prisma.$queryRaw<RecentSalesAggregate[]>(Prisma.sql`
    SELECT
      COUNT(*)::int AS "salesCount",
      AVG(sale."salePrice")::double precision AS "averageSalePrice",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY sale."salePrice")::double precision AS "medianSalePrice",
      AVG(sale."mileage")::double precision AS "averageMileage"
    FROM "MarketSale" sale
    WHERE sale."modelId" = ${modelId}
      AND sale."saleDate" >= ${since}
      AND sale."salePrice" BETWEEN 10000 AND 20000000
  `);

  return {
    salesCount: aggregate?.salesCount ?? 0,
    averageSalePrice: aggregate?.averageSalePrice === null || aggregate?.averageSalePrice === undefined
      ? null
      : Math.round(aggregate.averageSalePrice),
    medianSalePrice: aggregate?.medianSalePrice === null || aggregate?.medianSalePrice === undefined
      ? null
      : Math.round(aggregate.medianSalePrice),
    averageMileage: aggregate?.averageMileage === null || aggregate?.averageMileage === undefined
      ? null
      : Math.round(aggregate.averageMileage),
    periodDays,
  };
}

type TrendAggregate = {
  firstPrice: number | null;
  lastPrice: number | null;
  snapshotCount: number;
};

async function calculateMarketTrend(modelId: string, monthsBack: number): Promise<MarketTrend | null> {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);

  const [aggregate] = await prisma.$queryRaw<TrendAggregate[]>(Prisma.sql`
    SELECT
      (array_agg(snapshot."averagePrice" ORDER BY snapshot."date" ASC))[1]::double precision AS "firstPrice",
      (array_agg(snapshot."averagePrice" ORDER BY snapshot."date" DESC))[1]::double precision AS "lastPrice",
      COUNT(*)::int AS "snapshotCount"
    FROM "MarketSnapshot" snapshot
    WHERE snapshot."modelId" = ${modelId}
      AND snapshot."date" >= ${since}
      AND snapshot."averagePrice" IS NOT NULL
  `);

  if (!aggregate || aggregate.snapshotCount < 2 || aggregate.firstPrice === null || aggregate.lastPrice === null) {
    return null;
  }

  const changePercent = aggregate.firstPrice !== 0
    ? Math.round(((aggregate.lastPrice - aggregate.firstPrice) / aggregate.firstPrice) * 1000) / 10
    : null;
  let direction: TrendDirection = "STABLE";
  if (changePercent !== null) {
    if (changePercent > 1) direction = "UP";
    else if (changePercent < -1) direction = "DOWN";
  }

  return {
    direction,
    changePercent,
    snapshotCount: aggregate.snapshotCount,
    label: trendLabel(direction, changePercent),
  };
}

// ─── 1. Market Range ─────────────────────────────────────────────────────────

export const getMarketRange = unstable_cache(
  async (modelId: string): Promise<MarketRange | null> => {
  const summary = await getMarketModelSummaryRow(modelId);
  if (summary) {
    return summary.activeListingCount > 0 ? {
      lowestPrice: summary.lowestListingPrice ?? 0,
      highestPrice: summary.highestListingPrice ?? 0,
      averageAskingPrice: Math.round(summary.averageAskingPrice ?? 0),
      medianAskingPrice: Math.round(summary.medianAskingPrice ?? summary.averageAskingPrice ?? 0),
      activeListingCount: summary.activeListingCount,
    } : null;
  }

  return calculateMarketRange(modelId);
  },
  ["market-range-v2"],
  { revalidate: 900, tags: ["market-intelligence"] }
);

// ─── 2. Market Supply ────────────────────────────────────────────────────────

export const getMarketSupply = unstable_cache(
  async (modelId: string): Promise<MarketSupply> => {
  const summary = await getMarketModelSummaryRow(modelId);
  if (summary) return { activeListingCount: summary.activeListingCount };

  // Supply uses the same source-backed active inventory filter as market range.
  const activeListingCount = await prisma.listing.count({
    where: sourceBackedInventoryListingWhere(modelId),
  });
  return { activeListingCount };
  },
  ["market-supply-v2"],
  { revalidate: 900, tags: ["market-intelligence"] }
);

// ─── 3. Recent Sales Performance ─────────────────────────────────────────────

export const getRecentSales = unstable_cache(
  async (
  modelId: string,
  periodDays = 90
): Promise<RecentSalesPerformance> => {
  const summary = periodDays === 90 ? await getMarketModelSummaryRow(modelId) : null;
  if (summary) {
    return {
      salesCount: summary.recentSalesCount,
      averageSalePrice: summary.averageSalePrice === null ? null : Math.round(summary.averageSalePrice),
      medianSalePrice: summary.medianSalePrice === null ? null : Math.round(summary.medianSalePrice),
      averageMileage: summary.averageSaleMileage === null ? null : Math.round(summary.averageSaleMileage),
      periodDays,
    };
  }

  return calculateRecentSales(modelId, periodDays);
  },
  ["recent-sales-v2"],
  { revalidate: 3_600, tags: ["market-intelligence"] }
);

// ─── 4. Asking vs Sold Difference ────────────────────────────────────────────

export const getAskingVsSold = unstable_cache(
  async (modelId: string): Promise<AskingVsSold> => {
  const summary = await getMarketModelSummaryRow(modelId);
  if (summary) {
    return {
      averageAskingPrice: summary.averageAskingPrice === null ? null : Math.round(summary.averageAskingPrice),
      averageSoldPrice: summary.averageSoldPrice === null ? null : Math.round(summary.averageSoldPrice),
      difference: summary.askingVsSoldDifference === null ? null : Math.round(summary.askingVsSoldDifference),
      differencePercent: summary.askingVsSoldDifferencePct,
    };
  }

  const [range, sales] = await Promise.all([
    getMarketRange(modelId),
    getRecentSales(modelId, 90),
  ]);

  const averageAskingPrice = range?.averageAskingPrice ?? null;
  const averageSoldPrice = sales.averageSalePrice;

  if (averageAskingPrice === null || averageSoldPrice === null) {
    return { averageAskingPrice, averageSoldPrice, difference: null, differencePercent: null };
  }

  const difference = averageSoldPrice - averageAskingPrice;
  const differencePercent =
    averageAskingPrice !== 0
      ? Math.round((difference / averageAskingPrice) * 1000) / 10
      : null;

  return {
    averageAskingPrice,
    averageSoldPrice,
    difference: Math.round(difference),
    differencePercent,
  };
  },
  ["asking-vs-sold-v2"],
  { revalidate: 900, tags: ["market-intelligence"] }
);

// ─── 5. Market Trend ─────────────────────────────────────────────────────────

export const getMarketTrend = unstable_cache(
  async (
  modelId: string,
  monthsBack = 12
): Promise<MarketTrend | null> => {
  const summary = monthsBack === 12 ? await getMarketModelSummaryRow(modelId) : null;
  if (summary) {
    if (!summary.trendDirection) return null;
    const direction = toTrendDirection(summary.trendDirection);
    return {
      direction,
      changePercent: summary.trendChangePercent,
      snapshotCount: summary.trendSnapshotCount,
      label: trendLabel(direction, summary.trendChangePercent),
    };
  }

  return calculateMarketTrend(modelId, monthsBack);
  },
  ["market-trend-v2"],
  { revalidate: 3_600, tags: ["market-intelligence"] }
);

// ─── 6. Composite Market Summary ─────────────────────────────────────────────

export const getMarketSummary = unstable_cache(
  async (modelId: string): Promise<MarketSummary> => {
  const summary = await getMarketModelSummaryRow(modelId);
  if (summary) {
    const range = summary.activeListingCount > 0
      ? {
          lowestPrice: summary.lowestListingPrice ?? 0,
          highestPrice: summary.highestListingPrice ?? 0,
          averageAskingPrice: Math.round(summary.averageAskingPrice ?? 0),
          medianAskingPrice: Math.round(summary.medianAskingPrice ?? summary.averageAskingPrice ?? 0),
          activeListingCount: summary.activeListingCount,
        }
      : null;
    const direction = summary.trendDirection ? toTrendDirection(summary.trendDirection) : null;
    const trend = direction
      ? {
          direction,
          changePercent: summary.trendChangePercent,
          snapshotCount: summary.trendSnapshotCount,
          label: trendLabel(direction, summary.trendChangePercent),
        }
      : null;

    return {
      modelId,
      range,
      supply: { activeListingCount: summary.activeListingCount },
      recentSales: {
        salesCount: summary.recentSalesCount,
        averageSalePrice: summary.averageSalePrice === null ? null : Math.round(summary.averageSalePrice),
        medianSalePrice: summary.medianSalePrice === null ? null : Math.round(summary.medianSalePrice),
        averageMileage: summary.averageSaleMileage === null ? null : Math.round(summary.averageSaleMileage),
        periodDays: 90,
      },
      askingVsSold: {
        averageAskingPrice: summary.averageAskingPrice === null ? null : Math.round(summary.averageAskingPrice),
        averageSoldPrice: summary.averageSoldPrice === null ? null : Math.round(summary.averageSoldPrice),
        difference: summary.askingVsSoldDifference === null ? null : Math.round(summary.askingVsSoldDifference),
        differencePercent: summary.askingVsSoldDifferencePct,
      },
      trend,
      hasData: summary.activeListingCount > 0 || summary.recentSalesCount > 0,
    };
  }

  const [range, recentSales, trend] = await Promise.all([
    calculateMarketRange(modelId),
    calculateRecentSales(modelId, 90),
    calculateMarketTrend(modelId, 12),
  ]);
  const supply = { activeListingCount: range?.activeListingCount ?? 0 };
  const averageAskingPrice = range?.averageAskingPrice ?? null;
  const averageSoldPrice = recentSales.averageSalePrice;
  const difference = averageAskingPrice !== null && averageSoldPrice !== null
    ? averageSoldPrice - averageAskingPrice
    : null;
  const askingVsSold: AskingVsSold = {
    averageAskingPrice,
    averageSoldPrice,
    difference: difference === null ? null : Math.round(difference),
    differencePercent: difference === null || averageAskingPrice === null || averageAskingPrice === 0
      ? null
      : Math.round((difference / averageAskingPrice) * 1000) / 10,
  };

  const hasData =
    range !== null ||
    supply.activeListingCount > 0 ||
    recentSales.salesCount > 0;

  return { modelId, range, supply, recentSales, askingVsSold, trend, hasData };
  },
  ["market-summary-v2"],
  { revalidate: 900, tags: ["market-intelligence"] }
);

// ─── 7. Historical Sales Price History ───────────────────────────────────────

export type MarketPriceHistoryItem = {
  month: string; // Format: "YYYY-MM"
  averageSalePrice: number | null;
  averageListingPrice: number | null;
  salesCount: number;
  listingCount: number;
};

export const getMarketPriceHistory = unstable_cache(
  async (modelId: string): Promise<MarketPriceHistoryItem[]> => {
  const [sales, listings] = await Promise.all([
    prisma.$queryRaw<Array<{ month: string; averageSalePrice: number | null; salesCount: bigint | number }>>`
      SELECT
        to_char(date_trunc('month', "saleDate"), 'YYYY-MM') AS month,
        ROUND(AVG("salePrice"))::int AS "averageSalePrice",
        COUNT(*) AS "salesCount"
      FROM "MarketSale"
      WHERE "modelId" = ${modelId}
        AND "salePrice" BETWEEN 10000 AND 20000000
      GROUP BY date_trunc('month', "saleDate")
      ORDER BY month ASC
    `,
    prisma.$queryRaw<Array<{ month: string; averageListingPrice: number | null; listingCount: bigint | number }>>`
      SELECT
        to_char(date_trunc('month', COALESCE(listing."firstSeen", listing."createdAt")), 'YYYY-MM') AS month,
        ROUND(AVG(COALESCE(listing."askingPrice", listing."price")))::int AS "averageListingPrice",
        COUNT(*) AS "listingCount"
      FROM "Listing" listing
      LEFT JOIN "Vehicle" vehicle ON vehicle."id" = listing."vehicleId"
      LEFT JOIN "MarketSource" source ON source."id" = listing."sourceId"
      WHERE listing."modelId" = ${modelId}
        AND listing."validationStatus" = 'VALID'
        AND listing."priceStatus" IS DISTINCT FROM 'PRICE_INVALID'
        AND listing."vehicleId" IS NOT NULL
        AND vehicle."inventoryStatus" IN ('ACTIVE', 'VALID', 'WARNING')
        AND COALESCE(listing."askingPrice", listing."price") BETWEEN 10000 AND 20000000
        AND (source."type" IS NULL OR source."type" <> 'AUCTION')
        AND (listing."url" IS NULL OR listing."url" NOT ILIKE '%bringatrailer.com%')
      GROUP BY date_trunc('month', COALESCE(listing."firstSeen", listing."createdAt"))
      ORDER BY month ASC
    `,
  ]);

  if (sales.length === 0 && listings.length === 0) return [];

  const groups: Record<string, {
    averageSalePrice: number | null;
    saleCount: number;
    averageListingPrice: number | null;
    listingCount: number;
  }> = {};

  for (const sale of sales) {
    const key = sale.month;
    if (!key) continue;

    if (!groups[key]) {
      groups[key] = emptyHistoryGroup();
    }
    groups[key].averageSalePrice = sale.averageSalePrice;
    groups[key].saleCount = Number(sale.salesCount);
  }

  for (const listing of listings) {
    const key = listing.month;
    if (!key) continue;

    if (!groups[key]) {
      groups[key] = emptyHistoryGroup();
    }
    groups[key].averageListingPrice = listing.averageListingPrice;
    groups[key].listingCount = Number(listing.listingCount);
  }

  return Object.keys(groups)
    .sort()
    .map((key) => ({
      month: key,
      averageSalePrice: groups[key].averageSalePrice,
      averageListingPrice: groups[key].averageListingPrice,
      salesCount: groups[key].saleCount,
      listingCount: groups[key].listingCount,
    }));
  },
  ["market-price-history-v1"],
  { revalidate: 3_600, tags: ["market-intelligence"] }
);

function emptyHistoryGroup() {
  return {
    averageSalePrice: null,
    saleCount: 0,
    averageListingPrice: null,
    listingCount: 0,
  };
}
