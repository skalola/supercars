import { prisma } from "@/lib/prisma";
import { crawlInventory } from "@/lib/market-crawlers/crawler-engine";
import { assertVehicleMarketplaceEnabled } from "@/lib/marketplace/config";

async function main() {
  assertVehicleMarketplaceEnabled();
  console.log("Starting public inventory crawl (VIN-first)...");

  const result = await crawlInventory();

  for (const source of result.sources) {
    console.log(
      `${source.sourceName}: ${source.pagesFetched} pages, ${source.rawListings} raw, ${source.normalizedListings} VIN-backed, ${source.ingestedListings} ingested`
    );

    for (const skipped of source.skipped) {
      console.warn(`- ${skipped}`);
    }
  }

  console.log("Crawl summary:");
  console.log(JSON.stringify(result.totals, null, 2));
}

main()
  .catch((error) => {
    console.error("Inventory crawl failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
