/**
 * prisma/seed-bat.ts
 *
 * Sprint 5.6 — BaT Connector Verification Script
 *
 * Runs the full ingestion pipeline:
 *   Fixture → normalizeSale() → ingestSales() → generateSnapshot()
 *
 * Then queries the DB to verify the data landed correctly.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json -e "require('./prisma/seed-bat.ts')"
 * or (via tsx):
 *   npx tsx prisma/seed-bat.ts
 */

import { BaTConnector } from "../lib/market-sources/connectors/bat.connector";
import { runConnector } from "../lib/market-sources/ingestion-engine";
import { getMarketSummary } from "../lib/market-intelligence";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  Sprint 5.6 — BaT Connector Ingestion Test");
  console.log("══════════════════════════════════════════════════\n");

  // ── Step 1: Run the connector ─────────────────────────────────────────────
  const connector = new BaTConnector();
  const result = await runConnector(connector);

  console.log("\n── Ingestion Result ──────────────────────────────");
  console.log("Source:          ", result.sourceName);
  console.log("Listings upserted:", result.listingsUpserted);
  console.log("Sales created:   ", result.salesCreated);
  console.log("Processed at:    ", result.processedAt);

  if (result.unresolved.length > 0) {
    console.log("\n── Unresolved / Skipped ─────────────────────────");
    result.unresolved.forEach((u) => console.log("  ✗", u));
  }

  // ── Step 2: Verify DB — Ferrari 458 Italia ────────────────────────────────
  const ferrari458Id = "c4f3ae59-2991-4a4b-a691-ab2f8f399fb8"; // from DB query above
  const ferrariSales = await prisma.marketSale.findMany({
    where: { modelId: ferrari458Id },
    orderBy: { saleDate: "desc" },
    include: { source: { select: { name: true } } },
  });

  console.log("\n── Ferrari 458 Italia — MarketSale records ──────");
  ferrariSales.forEach((s) => {
    console.log(
      `  [${s.source.name}] ${new Date(s.saleDate).toLocaleDateString()} — ` +
        `$${s.salePrice.toLocaleString()} | ${s.mileage?.toLocaleString() ?? "?"} mi | ${s.color ?? "?"}`
    );
  });

  // ── Step 3: Verify DB — Lamborghini Huracan ───────────────────────────────
  const hurachanId = "af147aba-a7a5-42e3-895d-6b1e30292356";
  const huracSales = await prisma.marketSale.findMany({
    where: { modelId: hurachanId },
    orderBy: { saleDate: "desc" },
    include: { source: { select: { name: true } } },
  });

  console.log("\n── Lamborghini Huracan — MarketSale records ─────");
  huracSales.forEach((s) => {
    console.log(
      `  [${s.source.name}] ${new Date(s.saleDate).toLocaleDateString()} — ` +
        `$${s.salePrice.toLocaleString()} | ${s.mileage?.toLocaleString() ?? "?"} mi | ${s.color ?? "?"}`
    );
  });

  // ── Step 4: Market Intelligence after ingestion ───────────────────────────
  console.log("\n── Market Intelligence: Ferrari 458 Italia ──────");
  const ferrariMkt = await getMarketSummary(ferrari458Id);
  console.log("  Has data:         ", ferrariMkt.hasData);
  if (ferrariMkt.range) {
    console.log("  Avg asking:       $" + ferrariMkt.range.averageAskingPrice.toLocaleString());
    console.log("  Range:            $" + ferrariMkt.range.lowestPrice.toLocaleString() + " – $" + ferrariMkt.range.highestPrice.toLocaleString());
  }
  console.log("  Active listings:  ", ferrariMkt.supply.activeListingCount);
  console.log("  Recent sales:     ", ferrariMkt.recentSales.salesCount);
  if (ferrariMkt.recentSales.averageSalePrice) {
    console.log("  Avg sale price:  $" + ferrariMkt.recentSales.averageSalePrice.toLocaleString());
    console.log("  Median sale:     $" + ferrariMkt.recentSales.medianSalePrice?.toLocaleString());
  }
  if (ferrariMkt.askingVsSold.differencePercent !== null) {
    console.log("  Asking vs Sold:  ", ferrariMkt.askingVsSold.differencePercent + "%");
  }
  if (ferrariMkt.trend) {
    console.log("  Trend:           ", ferrariMkt.trend.label);
  }

  console.log("\n── Market Intelligence: Lamborghini Huracan ─────");
  const huracMkt = await getMarketSummary(hurachanId);
  console.log("  Has data:         ", huracMkt.hasData);
  console.log("  Active listings:  ", huracMkt.supply.activeListingCount);
  console.log("  Recent sales:     ", huracMkt.recentSales.salesCount);
  if (huracMkt.recentSales.averageSalePrice) {
    console.log("  Avg sale price:  $" + huracMkt.recentSales.averageSalePrice.toLocaleString());
  }
  if (huracMkt.trend) {
    console.log("  Trend:           ", huracMkt.trend.label);
  }

  // ── Step 5: MarketSnapshot verification ───────────────────────────────────
  const snapshots = await prisma.marketSnapshot.findMany({
    where: {
      modelId: { in: [ferrari458Id, hurachanId] },
    },
    orderBy: { date: "desc" },
    include: { model: { select: { name: true } } },
  });

  console.log("\n── MarketSnapshot records after ingestion ────────");
  snapshots.slice(0, 6).forEach((s) => {
    console.log(
      `  ${s.model.name} | ${new Date(s.date).toLocaleDateString()} | ` +
        `listings: ${s.activeListingCount} | avg: $${s.averagePrice?.toLocaleString() ?? "—"} | sales: ${s.salesCount}`
    );
  });

  console.log("\n══════════════════════════════════════════════════");
  console.log("  Verification complete ✓");
  console.log("══════════════════════════════════════════════════\n");
}

main()
  .catch((err) => {
    console.error("[seed-bat] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
