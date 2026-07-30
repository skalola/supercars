/**
 * scripts/crawl-dealer-inventory.ts
 *
 * Inventory Expansion Engine — Authorized Supported-Make Dealers
 *
 * Crawls all active dealers from the dealer registry, ingests new vehicles
 * and listings through the existing validation pipeline, and prints a
 * structured expansion report.
 *
 * Usage:
 *   npm run crawl-dealer-inventory
 *
 * The existing pipeline is fully preserved:
 *   Dealer URL → PublicPageSource → VIN extraction → model resolution
 *   → vehicle upsert → listing upsert → VinDiscovery
 *
 * After this run, execute:
 *   npm run validate-vehicle-data   (apply VALID/WARNING/NEEDS_REVIEW statuses)
 *   npm run build                   (verify no regressions)
 */

import { prisma } from "../lib/prisma";
import { crawlInventory } from "../lib/market-crawlers/crawler-engine";
import { createAuthorizedDealerSources } from "../lib/market-crawlers/sources/authorized-dealers";
import { ALL_AUTHORIZED_DEALERS } from "../lib/market-crawlers/dealer-registry";
import { SUPPORTED_MAKES } from "../lib/supported-makes";

function hr(char = "═", length = 58): string {
  return char.repeat(length);
}

function pad(label: string, width = 30): string {
  return (label + ":").padEnd(width);
}

async function main() {
  const startedAt = Date.now();
  const dealerArg = process.argv.find((arg) => arg.startsWith("--dealer="))?.split("=").slice(1).join("=").trim();

  console.log("\n" + hr());
  console.log("  Inventory Expansion Engine");
  console.log("  Supported Authorized Dealers");
  console.log(hr());

  // ── Dealer registry summary ────────────────────────────────────────────
  console.log(`\n  Dealer registry loaded:`);
  for (const make of SUPPORTED_MAKES) {
    console.log(`    ${make} dealers: ${ALL_AUTHORIZED_DEALERS.filter((d) => d.brand === make).length}`);
  }
  console.log(`    Total active:         ${ALL_AUTHORIZED_DEALERS.length}`);
  console.log(`\n  Starting crawl...\n`);

  // ── Baseline counts before crawl ───────────────────────────────────────
  const [vehiclesBefore, listingsBefore] = await Promise.all([
    prisma.vehicle.count(),
    prisma.listing.count({ where: { status: "ACTIVE" } }),
  ]);

  // ── Run the crawl ──────────────────────────────────────────────────────
  const sources = createAuthorizedDealerSources().filter((source) => {
    if (!dealerArg) return true;
    return source.sourceName.toLowerCase().includes(dealerArg.toLowerCase());
  });
  if (dealerArg && sources.length === 0) {
    throw new Error(`No authorized dealer source matched "${dealerArg}".`);
  }
  const result = await crawlInventory(sources);

  // ── Post-crawl counts ──────────────────────────────────────────────────
  const [vehiclesAfter, listingsAfter] = await Promise.all([
    prisma.vehicle.count(),
    prisma.listing.count({ where: { status: "ACTIVE" } }),
  ]);

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

  // ── Per-source breakdown ────────────────────────────────────────────────
  console.log("\n" + hr("─"));
  console.log("  Per-source Results");
  console.log(hr("─"));

  for (const source of result.sources) {
    const status =
      source.ingestedListings > 0
        ? `✓ ${source.ingestedListings} ingested`
        : source.pagesFetched === 0
        ? "✗ unreachable"
        : `○ ${source.normalizedListings} found, 0 new`;

    console.log(
      `  ${source.sourceName.padEnd(40)} ${status}`
    );

    if (source.pagesFetched > 0) {
      console.log(
        `    pages: ${source.pagesFetched}  raw: ${source.rawListings}  VIN-backed: ${source.normalizedListings}  skipped: ${source.skipped.length}`
      );
    }

    // Show skip reasons (truncated to keep output readable)
    const uniqueReasons = [...new Set(source.skipped.map((s) => s.split(":").slice(1).join(":").trim()))];
    for (const reason of uniqueReasons.slice(0, 3)) {
      console.log(`    ↳ ${reason}`);
    }
    if (uniqueReasons.length > 3) {
      console.log(`    ↳ ... and ${uniqueReasons.length - 3} more`);
    }
  }

  // ── Summary report ──────────────────────────────────────────────────────
  console.log("\n" + hr());
  console.log("  Inventory Expansion Report");
  console.log(hr());
  console.log(`  ${pad("Sources crawled")}         ${result.sources.length}`);
  console.log(
    `  ${pad("Sources with results")}         ${result.sources.filter((s) => s.ingestedListings > 0).length}`
  );
  console.log(
    `  ${pad("Sources unreachable")}         ${result.sources.filter((s) => s.pagesFetched === 0).length}`
  );
  console.log(`  ${pad("Pages fetched")}         ${result.totals.pagesFetched}`);
  console.log(`  ${pad("Vehicles discovered")}         ${result.totals.normalizedListings}`);
  console.log(`  ${pad("Vehicles created")}         ${result.totals.createdVehicles}`);
  console.log(`  ${pad("Vehicles updated")}         ${result.totals.updatedVehicles}`);
  console.log(`  ${pad("Listings created")}         ${result.totals.createdListings}`);
  console.log(`  ${pad("Listings updated")}         ${result.totals.updatedListings}`);
  console.log(`  ${pad("Records skipped")}         ${result.totals.skipped}`);
  console.log(hr("─"));
  console.log(`  ${pad("Vehicles before")}         ${vehiclesBefore}`);
  console.log(`  ${pad("Vehicles after")}         ${vehiclesAfter}`);
  console.log(
    `  ${pad("Net new vehicles")}         +${vehiclesAfter - vehiclesBefore}`
  );
  console.log(`  ${pad("Active listings before")}         ${listingsBefore}`);
  console.log(`  ${pad("Active listings after")}         ${listingsAfter}`);
  console.log(
    `  ${pad("Net new listings")}         +${listingsAfter - listingsBefore}`
  );
  console.log(hr("─"));
  console.log(`  ${pad("Duration")}         ${elapsedSec}s`);
  console.log(hr());
  console.log(`\n  ✓ Next step: npm run validate-vehicle-data`);
  console.log(`  ✓ Then:      npm run build\n`);
}

main()
  .catch((error) => {
    console.error("\n[crawl-dealer-inventory] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
