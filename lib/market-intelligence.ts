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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function trendLabel(direction: TrendDirection, pct: number | null): string {
  if (pct === null) return "Insufficient data";
  const pctStr = Math.abs(pct).toFixed(1);
  if (direction === "UP") return `Increasing +${pctStr}%`;
  if (direction === "DOWN") return `Decreasing -${pctStr}%`;
  return "Stable";
}

// ─── 1. Market Range ─────────────────────────────────────────────────────────

export async function getMarketRange(modelId: string): Promise<MarketRange | null> {
  // This protects market intelligence from invalid source pricing.
  const listings = await prisma.listing.findMany({
    where: {
      modelId,
      status: "ACTIVE",
      validationStatus: "VALID",
      priceStatus: { not: "PRICE_INVALID" },
      vehicle: {
        is: {
          inventoryStatus: { in: ["VALID", "WARNING"] }
        }
      },
      OR: [
        { price: null },
        { price: { gte: 10000 } }
      ],
      AND: [
        {
          OR: [
            { askingPrice: null },
            { askingPrice: { gte: 10000 } }
          ]
        }
      ]
    },
    select: { price: true },
  });

  const prices = listings
    .map((l) => l.price)
    .filter((p): p is number => p !== null);

  if (prices.length === 0) return null;

  return {
    lowestPrice: Math.min(...prices),
    highestPrice: Math.max(...prices),
    averageAskingPrice: Math.round(mean(prices)),
    medianAskingPrice: Math.round(median(prices)),
    activeListingCount: prices.length,
  };
}

// ─── 2. Market Supply ────────────────────────────────────────────────────────

export async function getMarketSupply(modelId: string): Promise<MarketSupply> {
  // This protects market intelligence from invalid source pricing.
  const activeListingCount = await prisma.listing.count({
    where: {
      modelId,
      status: "ACTIVE",
      validationStatus: "VALID",
      priceStatus: { not: "PRICE_INVALID" },
      vehicle: {
        is: {
          inventoryStatus: { in: ["VALID", "WARNING"] }
        }
      },
      OR: [
        { price: null },
        { price: { gte: 10000 } }
      ],
      AND: [
        {
          OR: [
            { askingPrice: null },
            { askingPrice: { gte: 10000 } }
          ]
        }
      ]
    },
  });
  return { activeListingCount };
}

// ─── 3. Recent Sales Performance ─────────────────────────────────────────────

export async function getRecentSales(
  modelId: string,
  periodDays = 90
): Promise<RecentSalesPerformance> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  // This protects market intelligence from invalid source pricing.
  const sales = await prisma.marketSale.findMany({
    where: {
      modelId,
      saleDate: { gte: since },
      salePrice: { gte: 10000, lte: 20000000 },
    },
    select: { salePrice: true, mileage: true },
  });

  const prices = sales.map((s) => s.salePrice);
  const mileages = sales
    .map((s) => s.mileage)
    .filter((m): m is number => m !== null);

  return {
    salesCount: sales.length,
    averageSalePrice: prices.length > 0 ? Math.round(mean(prices)) : null,
    medianSalePrice: prices.length > 0 ? Math.round(median(prices)) : null,
    averageMileage: mileages.length > 0 ? Math.round(mean(mileages)) : null,
    periodDays,
  };
}

// ─── 4. Asking vs Sold Difference ────────────────────────────────────────────

export async function getAskingVsSold(modelId: string): Promise<AskingVsSold> {
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
}

// ─── 5. Market Trend ─────────────────────────────────────────────────────────

export async function getMarketTrend(
  modelId: string,
  monthsBack = 12
): Promise<MarketTrend | null> {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);

  const snapshots = await prisma.marketSnapshot.findMany({
    where: { modelId, date: { gte: since }, averagePrice: { not: null } },
    orderBy: { date: "asc" },
    select: { averagePrice: true, date: true },
  });

  if (snapshots.length < 2) return null;

  const firstPrice = snapshots[0].averagePrice as number;
  const lastPrice = snapshots[snapshots.length - 1].averagePrice as number;

  const changePercent =
    firstPrice !== 0
      ? Math.round(((lastPrice - firstPrice) / firstPrice) * 1000) / 10
      : null;

  let direction: TrendDirection = "STABLE";
  if (changePercent !== null) {
    if (changePercent > 1) direction = "UP";
    else if (changePercent < -1) direction = "DOWN";
  }

  return {
    direction,
    changePercent,
    snapshotCount: snapshots.length,
    label: trendLabel(direction, changePercent),
  };
}

// ─── 6. Composite Market Summary ─────────────────────────────────────────────

export async function getMarketSummary(modelId: string): Promise<MarketSummary> {
  const [range, supply, recentSales, askingVsSold, trend] = await Promise.all([
    getMarketRange(modelId),
    getMarketSupply(modelId),
    getRecentSales(modelId),
    getAskingVsSold(modelId),
    getMarketTrend(modelId),
  ]);

  const hasData =
    range !== null ||
    supply.activeListingCount > 0 ||
    recentSales.salesCount > 0;

  return { modelId, range, supply, recentSales, askingVsSold, trend, hasData };
}

// ─── 7. Historical Sales Price History ───────────────────────────────────────

export type MarketPriceHistoryItem = {
  month: string; // Format: "YYYY-MM"
  averageSalePrice: number;
  salesCount: number;
};

export async function getMarketPriceHistory(modelId: string): Promise<MarketPriceHistoryItem[]> {
  // This protects market intelligence from invalid source pricing.
  const sales = await prisma.marketSale.findMany({
    where: {
      modelId,
      salePrice: { gte: 10000 },
    },
    select: { saleDate: true, salePrice: true },
    orderBy: { saleDate: "asc" },
  });

  if (sales.length === 0) return [];

  const groups: { [key: string]: { sum: number; count: number } } = {};
  for (const sale of sales) {
    const d = new Date(sale.saleDate);
    if (isNaN(d.getTime())) continue;
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const key = `${year}-${month}`;

    if (!groups[key]) {
      groups[key] = { sum: 0, count: 0 };
    }
    groups[key].sum += sale.salePrice;
    groups[key].count += 1;
  }

  return Object.keys(groups)
    .sort()
    .map((key) => ({
      month: key,
      averageSalePrice: Math.round(groups[key].sum / groups[key].count),
      salesCount: groups[key].count,
    }));
}

