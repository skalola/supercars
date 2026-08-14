import { prisma } from "@/lib/prisma";
import { SUPPORTED_MAKES } from "@/lib/supported-makes";
import type { Prisma } from "@prisma/client";
import { getBatchLimit, getBatchOffset, getRotatingBatchOffset } from "./lib/script-guards";

const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
const execute = process.argv.includes("--execute");
const limit = getBatchLimit({ defaultLimit: 500, maxLimit: 1000 });
const requestedOffset = getBatchOffset();

const LISTING_WHERE: Prisma.ListingWhereInput = {
  status: "ACTIVE",
  vehicleId: { not: null },
  vehicle: {
    is: {
      model: {
        make: {
          name: { in: [...SUPPORTED_MAKES] },
        },
      },
    },
  },
};

type ListingRow = Awaited<ReturnType<typeof getListings>>[number];

async function main() {
  const [eligibleListings, modelNames] = await Promise.all([
    prisma.listing.count({ where: LISTING_WHERE }),
    prisma.model.findMany({
      where: { make: { name: { in: [...SUPPORTED_MAKES] } } },
      select: { name: true },
    }),
  ]);
  const offset = getRotatingBatchOffset(eligibleListings, limit, requestedOffset);
  const listings = await getListings(offset);
  const knownModelFamilies = Array.from(new Set(modelNames.map((model) => toModelFamily(model.name)).filter(Boolean)));

  const summary = {
    execute,
    eligibleListings,
    offset,
    limit,
    inspected: listings.length,
    kept: 0,
    imageRestored: 0,
    wouldRestoreImage: 0,
    markedInactive: 0,
    wouldMarkInactive: 0,
    reasons: {} as Record<string, number>,
  };

  for (const listing of listings) {
    const result = classifyListing(listing, knownModelFamilies);
    if (result.reasons.length === 0 && !result.replacementImageUrl) {
      summary.kept++;
      continue;
    }

    for (const reason of result.reasons) {
      summary.reasons[reason] = (summary.reasons[reason] || 0) + 1;
    }

    if (result.replacementImageUrl) {
      if (execute) {
        await prisma.listing.update({
          where: { id: listing.id },
          data: { imageUrl: result.replacementImageUrl },
        });
        summary.imageRestored++;
      } else {
        summary.wouldRestoreImage++;
      }
    }

    if (result.reasons.length > 0) {
      if (execute) {
        await prisma.listing.update({
          where: { id: listing.id },
          data: {
            status: "INACTIVE",
            freshnessStatus: "INACTIVE",
            validationStatus: result.reasons[0],
            ...(result.priceInvalid ? { priceStatus: "PRICE_INVALID" } : {}),
          },
        });
        summary.markedInactive++;
      } else {
        summary.wouldMarkInactive++;
      }
    }

    console.log(
      `${execute ? "POLISHED" : "WOULD_POLISH"} ${listing.vehicle?.vin || "NO_VIN"} ${result.reasons.join(",") || "image_restore"} ${listing.url || ""}`,
    );
  }

  console.log(JSON.stringify(summary, null, 2));
}

async function getListings(offset: number) {
  return prisma.listing.findMany({
    where: LISTING_WHERE,
    select: {
      id: true,
      url: true,
      imageUrl: true,
      price: true,
      askingPrice: true,
      validationStatus: true,
      priceStatus: true,
      vehicle: {
        select: {
          vin: true,
          year: true,
          inventoryStatus: true,
          images: {
            where: { validationStatus: "VALID" },
            select: { url: true, validationStatus: true, isPrimary: true, createdAt: true },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 12,
          },
          model: {
            select: {
              name: true,
              make: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
    skip: offset,
    take: limit,
  });
}

function classifyListing(listing: ListingRow, knownModelFamilies: string[]) {
  const reasons: string[] = [];
  const vin = listing.vehicle?.vin || null;
  const url = listing.url || "";
  const imageUrl = listing.imageUrl || "";
  const modelName = listing.vehicle?.model.name || "";
  const makeName = listing.vehicle?.model.make.name || "";
  const vehicleInventoryStatus = listing.vehicle?.inventoryStatus || "";
  const modelFamily = toModelFamily(modelName);
  const urlVins = extractVins(url);
  const imageVins = extractVins(imageUrl);
  const replacementImageUrl = pickReplacementImage(listing, vin);
  const price = listing.askingPrice ?? listing.price ?? null;

  if (listing.validationStatus !== "VALID") reasons.push(listing.validationStatus || "NEEDS_REVIEW");
  if (!["ACTIVE", "VALID", "WARNING"].includes(vehicleInventoryStatus)) {
    reasons.push(vehicleInventoryStatus ? `VEHICLE_${vehicleInventoryStatus}` : "VEHICLE_STATUS_MISSING");
  }
  if (!vin) reasons.push("VIN_MISSING");
  if (vin && isPlaceholderVin(vin)) reasons.push("VIN_PLACEHOLDER");
  if (!url) reasons.push("SOURCE_URL_MISSING");
  if (url && isInvalidSourceHost(url)) reasons.push("SOURCE_HOST_INVALID");
  if (url && isGenericInventoryUrl(url)) reasons.push("GENERIC_SOURCE_URL");
  if (vin && urlVins.length > 0 && !urlVins.includes(vin)) reasons.push("SOURCE_VIN_MISMATCH");
  if (url && modelFamily && hasConflictingModelSignal(url, modelFamily, knownModelFamilies)) {
    reasons.push("SOURCE_MODEL_MISMATCH");
  }
  if (!price || price < 10000) reasons.push("PRICE_MISSING");
  if (!imageUrl || isNonVehicleImage(imageUrl)) reasons.push("IMAGE_MISSING");
  if (vin && imageVins.length > 0 && !imageVins.includes(vin)) reasons.push("IMAGE_VIN_MISMATCH");

  const uniqueReasons = Array.from(new Set(reasons));

  return {
    reasons: uniqueReasons,
    replacementImageUrl:
      replacementImageUrl && replacementImageUrl !== imageUrl ? replacementImageUrl : null,
    priceInvalid: uniqueReasons.some((reason) => reason === "PRICE_MISSING" || reason.endsWith("_MISMATCH")),
    label: `${makeName} ${modelName}`.trim(),
  };
}

function pickReplacementImage(listing: ListingRow, vin: string | null) {
  if (!vin) return null;

  const images = listing.vehicle?.images || [];
  const exactVinImage = images.find((image) => {
    if (image.validationStatus && image.validationStatus !== "VALID") return false;
    if (isNonVehicleImage(image.url)) return false;
    return extractVins(image.url).includes(vin);
  });
  if (exactVinImage) return exactVinImage.url;

  const noVinImage = images.find((image) => {
    if (image.validationStatus && image.validationStatus !== "VALID") return false;
    if (isNonVehicleImage(image.url)) return false;
    return extractVins(image.url).length === 0;
  });
  return noVinImage?.url || null;
}

function extractVins(value: string | null | undefined) {
  return Array.from(new Set((value?.toUpperCase().match(VIN_RE) || [])));
}

function isGenericInventoryUrl(value: string) {
  try {
    const { pathname } = new URL(value);
    const path = pathname.toLowerCase();
    return (
      /\/(?:new|used|certified)-inventory\/(?:index\.htm)?$/i.test(path) ||
      /\/(?:new|used|certified)-inventory\/[a-z0-9-]+\.htm$/i.test(path)
    );
  } catch {
    return true;
  }
}

function isInvalidSourceHost(value: string) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    return ["google.com"].includes(host);
  } catch {
    return true;
  }
}

function isPlaceholderVin(value: string) {
  return /0{6,}/.test(value);
}

function hasConflictingModelSignal(url: string, currentModelFamily: string, knownModelFamilies: string[]) {
  const normalizedUrl = toSignal(url);
  if (normalizedUrl.includes(currentModelFamily)) return false;

  const matchedSignals = knownModelFamilies.filter((signal) => {
    if (!signal || signal === currentModelFamily || signal.length < 3) return false;
    return normalizedUrl.includes(signal);
  });
  return matchedSignals.length > 0;
}

function isNonVehicleImage(value: string) {
  return /placeholder|logo|icon|favicon|spinner|loading|avatar|profile|badge|sprite|transparent|blank|autocheck/i.test(value);
}

function toSignal(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function toModelFamily(value: string) {
  const normalized = value.toLowerCase().replace(/&/g, "and");
  return normalized.match(/[a-z0-9]+/)?.[0] || "";
}

main()
  .catch((error) => {
    console.error("Inventory polish failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
