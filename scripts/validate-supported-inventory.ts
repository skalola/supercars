import { prisma } from "@/lib/prisma";
import { isModelMatch } from "@/lib/data-quality/inventory-validator";
import { isValidVin } from "@/lib/market-crawlers/vin-extractor";
import { normalizeSupportedMake, SUPPORTED_MAKES } from "@/lib/supported-makes";
import { getArgValue, getBatchLimit, isExecuteMode, logScriptMode } from "./lib/script-guards";

const makeArg = getArgValue("--make");
const execute = isExecuteMode();
const limit = getBatchLimit({ defaultLimit: 250, maxLimit: 1000 });
const targetMakes = makeArg
  ? [normalizeSupportedMake(makeArg)].filter((make): make is (typeof SUPPORTED_MAKES)[number] => Boolean(make))
  : [...SUPPORTED_MAKES];

async function main() {
  if (targetMakes.length === 0) {
    throw new Error(`Unsupported make: ${makeArg}`);
  }
  logScriptMode("validate-supported-inventory", execute, limit);

  const vehicles = await prisma.vehicle.findMany({
    where: {
      model: {
        make: {
          name: { in: targetMakes },
        },
      },
      listings: {
        some: {
          status: "ACTIVE",
          validationStatus: "VALID",
          priceStatus: { not: "PRICE_INVALID" },
          OR: [{ askingPrice: { gte: 10000 } }, { price: { gte: 10000 } }],
        },
      },
    },
    select: {
      id: true,
      vin: true,
      model: {
        select: {
          name: true,
          make: {
            select: { name: true },
          },
        },
      },
      images: {
        where: { validationStatus: "VALID" },
        select: { id: true },
        take: 1,
      },
      listings: {
        select: {
          status: true,
          validationStatus: true,
          priceStatus: true,
          askingPrice: true,
          price: true,
          url: true,
          model: {
            select: {
              name: true,
              slug: true,
              make: {
                select: { name: true },
              },
            },
          },
          source: {
            select: { type: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  let valid = 0;
  let warning = 0;
  let skipped = 0;

  for (const vehicle of vehicles) {
    if (!isValidVin(vehicle.vin)) {
      skipped++;
      continue;
    }

    const displayableListing = vehicle.listings.find((listing) => {
      const price = listing.askingPrice ?? listing.price ?? null;
      if (listing.status !== "ACTIVE" || listing.validationStatus !== "VALID") return false;
      if (listing.priceStatus === "PRICE_INVALID" || !price || price < 10000) return false;
      if (listing.source?.type === "AUCTION") return false;
      if (listing.url && /bringatrailer\.com/i.test(listing.url)) return false;
      if (listing.model.make.name !== vehicle.model.make.name) return false;
      return isModelMatch(listing.model.name, listing.model.slug, vehicle.model.name);
    });

    if (!displayableListing) {
      skipped++;
      continue;
    }

    const hasValidImage = vehicle.images.length > 0;
    if (execute) {
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: {
          inventoryStatus: hasValidImage ? "VALID" : "WARNING",
          imageValidationStatus: hasValidImage ? "VALID_IMAGE" : "MISSING_IMAGE",
          vinIdentityStatus: "VALID",
          vinIdentityClassification: "VALID",
        },
      });
    }

    if (hasValidImage) valid++;
    else warning++;
  }

  console.log(JSON.stringify({ execute, targetMakes, inspected: vehicles.length, valid, warning, skipped }, null, 2));
}

main()
  .catch((error) => {
    console.error("Supported inventory validation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
