import { spawn } from "node:child_process";
import { prisma } from "@/lib/prisma";
import { crawlInventory } from "@/lib/market-crawlers/crawler-engine";
import { createAuthorizedDealerSourcesFromDirectory } from "@/lib/market-crawlers/sources/authorized-dealers";
import { normalizeSupportedMake } from "@/lib/supported-makes";

function argValue(name: string) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const makeArg = normalizeSupportedMake(argValue("--make") || "");
const dealerArg = argValue("--dealer")?.trim().toLowerCase() || null;
const offset = positiveInt(argValue("--offset"), 0);
const limit = positiveInt(argValue("--limit"), 20);
const skipPostClean = process.argv.includes("--skip-post-clean");

async function main() {
  const before = await publicInventoryStats();
  const allSources = await createAuthorizedDealerSourcesFromDirectory();
  const filtered = allSources.filter((source) => {
    const name = source.sourceName.toLowerCase();
    if (makeArg && !name.includes(makeArg.toLowerCase())) return false;
    if (dealerArg && !name.includes(dealerArg)) return false;
    return true;
  });
  const deduped = dedupeSources(filtered);
  const sources = deduped.slice(offset, offset + limit);

  console.log("==================================================");
  console.log("  SUPERCAR DASH Verified Dealer Inventory Batch");
  console.log("==================================================");
  console.log(JSON.stringify({
    make: makeArg || "ALL",
    dealer: dealerArg || "ALL",
    offset,
    limit,
    availableSources: deduped.length,
    selectedSources: sources.map((source) => source.sourceName),
    before,
  }, null, 2));

  const result = await crawlInventory(sources);

  for (const source of result.sources) {
    console.log(
      `${source.sourceName}: pages=${source.pagesFetched} raw=${source.rawListings} VIN=${source.normalizedListings} ingested=${source.ingestedListings} skipped=${source.skipped.length}`,
    );
  }

  if (!skipPostClean) {
    await runStep("Backfill listing images from vehicle images", "npm", ["run", "backfill-listing-images"]);
    await runStep("Polish inventory quality gate", "npm", ["run", "polish-inventory-quality", "--", "--execute", "--limit=1000"]);
  }

  const after = await publicInventoryStats();
  console.log("Batch summary:");
  console.log(JSON.stringify({
    crawl: result.totals,
    before,
    after,
    delta: {
      publicListings: after.publicListings - before.publicListings,
      activeListings: after.activeListings - before.activeListings,
      activeInvalid: after.activeInvalid - before.activeInvalid,
      missingImage: after.missingImage - before.missingImage,
      missingPrice: after.missingPrice - before.missingPrice,
    },
  }, null, 2));
}

function dedupeSources<T extends { sourceName: string; sourceType: string }>(sources: T[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.sourceType}:${source.sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function publicInventoryStats() {
  const [activeListings, publicListings, activeInvalid, missingImage, missingPrice, byMakeRows] = await Promise.all([
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.listing.count({
      where: {
        status: "ACTIVE",
        validationStatus: "VALID",
        vehicleId: { not: null },
        imageUrl: { not: null },
        OR: [{ askingPrice: { gte: 10000 } }, { price: { gte: 10000 } }],
      },
    }),
    prisma.listing.count({ where: { status: "ACTIVE", NOT: { validationStatus: "VALID" } } }),
    prisma.listing.count({ where: { status: "ACTIVE", OR: [{ imageUrl: null }, { imageUrl: "" }] } }),
    prisma.listing.count({
      where: {
        status: "ACTIVE",
        AND: [
          { OR: [{ askingPrice: null }, { askingPrice: { lt: 10000 } }] },
          { OR: [{ price: null }, { price: { lt: 10000 } }] },
        ],
      },
    }),
    prisma.listing.findMany({
      where: {
        status: "ACTIVE",
        validationStatus: "VALID",
        vehicleId: { not: null },
      },
      select: {
        vehicle: {
          select: {
            model: {
              select: {
                make: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const byMake = byMakeRows.reduce((acc, row) => {
    const make = row.vehicle?.model.make.name || "Unknown";
    acc[make] = (acc[make] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return { activeListings, publicListings, activeInvalid, missingImage, missingPrice, byMake };
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
}

async function runStep(label: string, command: string, args: string[]) {
  console.log(`\n${label}`);
  console.log(`$ ${command} ${args.join(" ")}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

main()
  .catch((error) => {
    console.error("Verified dealer inventory batch failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
