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
import type { Prisma } from "@prisma/client";

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

// ─── 1. Market Range ─────────────────────────────────────────────────────────

export async function getMarketRange(modelId: string): Promise<MarketRange | null> {
  // Market range is based only on active inventory with source-backed listing identity.
  const listings = await prisma.listing.findMany({
    where: sourceBackedInventoryListingWhere(modelId),
    select: { price: true, askingPrice: true },
  });

  const prices = listings
    .map((l) => l.askingPrice ?? l.price)
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
  // Supply uses the same source-backed active inventory filter as market range.
  const activeListingCount = await prisma.listing.count({
    where: sourceBackedInventoryListingWhere(modelId),
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
  averageSalePrice: number | null;
  averageListingPrice: number | null;
  salesCount: number;
  listingCount: number;
};

export async function getMarketPriceHistory(modelId: string): Promise<MarketPriceHistoryItem[]> {
  const [sales, listings] = await Promise.all([
    prisma.marketSale.findMany({
      where: {
        modelId,
        salePrice: { gte: 10000, lte: 20000000 },
      },
      select: { saleDate: true, salePrice: true },
      orderBy: { saleDate: "asc" },
    }),
    prisma.listing.findMany({
      where: {
        modelId,
        validationStatus: "VALID",
        priceStatus: { not: "PRICE_INVALID" },
        vehicleId: { not: null },
        vehicle: {
          is: {
            inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] },
          },
        },
        OR: [
          { askingPrice: { gte: 10000, lte: 20000000 } },
          { price: { gte: 10000, lte: 20000000 } },
        ],
        NOT: [
          { source: { is: { type: "AUCTION" } } },
          { url: { contains: "bringatrailer.com", mode: "insensitive" } },
        ],
      },
      select: { firstSeen: true, createdAt: true, askingPrice: true, price: true },
      orderBy: { firstSeen: "asc" },
    }),
  ]);

  if (sales.length === 0 && listings.length === 0) return [];

  const groups: Record<string, {
    saleSum: number;
    saleCount: number;
    listingSum: number;
    listingCount: number;
  }> = {};

  for (const sale of sales) {
    const key = monthKey(sale.saleDate);
    if (!key) continue;

    if (!groups[key]) {
      groups[key] = emptyHistoryGroup();
    }
    groups[key].saleSum += sale.salePrice;
    groups[key].saleCount += 1;
  }

  for (const listing of listings) {
    const key = monthKey(listing.firstSeen || listing.createdAt);
    const price = listing.askingPrice ?? listing.price;
    if (!key || !price) continue;

    if (!groups[key]) {
      groups[key] = emptyHistoryGroup();
    }
    groups[key].listingSum += price;
    groups[key].listingCount += 1;
  }

  return Object.keys(groups)
    .sort()
    .map((key) => ({
      month: key,
      averageSalePrice: groups[key].saleCount > 0 ? Math.round(groups[key].saleSum / groups[key].saleCount) : null,
      averageListingPrice: groups[key].listingCount > 0 ? Math.round(groups[key].listingSum / groups[key].listingCount) : null,
      salesCount: groups[key].saleCount,
      listingCount: groups[key].listingCount,
    }));
}

function emptyHistoryGroup() {
  return {
    saleSum: 0,
    saleCount: 0,
    listingSum: 0,
    listingCount: 0,
  };
}

function monthKey(value: Date | string) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
