/**
 * prisma/seed-inventory.ts
 *
 * Sprint 5.7 — Active Inventory Ingestion Test
 *
 * Runs the ingestion pipeline for the InventoryConnector:
 *   Fixture → normalizeListing() → ingestListings() → generateSnapshot()
 *
 * Then queries the DB to verify the data landed correctly and updates snapshots.
 *
 * Usage:
 *   npx tsx prisma/seed-inventory.ts
 */

import { InventoryConnector } from "../lib/market-sources/connectors/inventory.connector";
import { runConnector } from "../lib/market-sources/ingestion-engine";
import { getMarketSummary } from "../lib/market-intelligence";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  Sprint 5.7 — Inventory Connector Ingestion Test");
  console.log("══════════════════════════════════════════════════\n");

  // Get Ferrari 458 Italia & Lamborghini Huracan model records
  const ferrariModel = await prisma.model.findFirst({
    where: {
      name: "458 Italia",
      make: { name: "Ferrari" }
    }
  });

  const huracanModel = await prisma.model.findFirst({
    where: {
      name: "Huracan",
      make: { name: "Lamborghini" }
    }
  });

  if (!ferrariModel || !huracanModel) {
    console.error("Error: Could not find Ferrari 458 Italia or Lamborghini Huracan in the database!");
    process.exit(1);
  }

  console.log(`Resolved model IDs:`);
  console.log(`  Ferrari 458 Italia:  ${ferrariModel.id}`);
  console.log(`  Lamborghini Huracan: ${huracanModel.id}\n`);

  // Run the connector
  const connector = new InventoryConnector();
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

  // Verify Active Listings for Ferrari 458 Italia
  const activeFerrariListings = await prisma.listing.findMany({
    where: { modelId: ferrariModel.id, status: "ACTIVE" },
    include: { source: { select: { name: true } } },
    orderBy: { price: "asc" }
  });

  console.log("\n── Ferrari 458 Italia — Active Listings ────────");
  activeFerrariListings.forEach((l) => {
    console.log(
      `  [${l.source?.name ?? "Local"}] $${l.price?.toLocaleString() ?? "—"} | ${l.mileage?.toLocaleString() ?? "?"} mi | ${l.color ?? "?"} | ${l.dealerName ?? l.location ?? "Unknown"}`
    );
  });

  // Verify Active Listings for Lamborghini Huracan
  const activeHuracanListings = await prisma.listing.findMany({
    where: { modelId: huracanModel.id, status: "ACTIVE" },
    include: { source: { select: { name: true } } },
    orderBy: { price: "asc" }
  });

  console.log("\n── Lamborghini Huracan — Active Listings ───────");
  activeHuracanListings.forEach((l) => {
    console.log(
      `  [${l.source?.name ?? "Local"}] $${l.price?.toLocaleString() ?? "—"} | ${l.mileage?.toLocaleString() ?? "?"} mi | ${l.color ?? "?"} | ${l.dealerName ?? l.location ?? "Unknown"}`
    );
  });

  // Verify Market Summaries
  console.log("\n── Market Intelligence Summary: Ferrari 458 Italia ──────");
  const ferrariMkt = await getMarketSummary(ferrariModel.id);
  console.log("  Has data:         ", ferrariMkt.hasData);
  if (ferrariMkt.range) {
    console.log("  Asking range:     $" + ferrariMkt.range.lowestPrice.toLocaleString() + " – $" + ferrariMkt.range.highestPrice.toLocaleString());
    console.log("  Avg asking price: $" + ferrariMkt.range.averageAskingPrice.toLocaleString());
    console.log("  Median asking:    $" + ferrariMkt.range.medianAskingPrice.toLocaleString());
  }
  console.log("  Active listings:  ", ferrariMkt.supply.activeListingCount);
  console.log("  Recent sales:     ", ferrariMkt.recentSales.salesCount);

  console.log("\n── Market Intelligence Summary: Lamborghini Huracan ─────");
  const huracanMkt = await getMarketSummary(huracanModel.id);
  console.log("  Has data:         ", huracanMkt.hasData);
  if (huracanMkt.range) {
    console.log("  Asking range:     $" + huracanMkt.range.lowestPrice.toLocaleString() + " – $" + huracanMkt.range.highestPrice.toLocaleString());
    console.log("  Avg asking price: $" + huracanMkt.range.averageAskingPrice.toLocaleString());
    console.log("  Median asking:    $" + huracanMkt.range.medianAskingPrice.toLocaleString());
  }
  console.log("  Active listings:  ", huracanMkt.supply.activeListingCount);
  console.log("  Recent sales:     ", huracanMkt.recentSales.salesCount);

  // MarketSnapshot verification
  const snapshots = await prisma.marketSnapshot.findMany({
    where: {
      modelId: { in: [ferrariModel.id, huracanModel.id] },
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
    console.error("[seed-inventory] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
