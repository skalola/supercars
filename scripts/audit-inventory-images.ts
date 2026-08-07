import { prisma } from "@/lib/prisma";
import { validateVehicleImageContentFromUrl } from "@/lib/data-quality/vehicle-image-content-validator";
import { isKnownInactiveListingUrl } from "@/lib/inventory/listing-url-quality";
import { normalizeSupportedMake, SUPPORTED_MAKES } from "@/lib/supported-makes";

const makeArg = process.argv.find((arg) => arg.startsWith("--make="))?.split("=")[1];
const vinArg = process.argv.find((arg) => arg.startsWith("--vin="))?.split("=")[1]?.toUpperCase();
const limitArg = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 100);
const skipArg = Number(process.argv.find((arg) => arg.startsWith("--skip="))?.split("=")[1] ?? 0);
const execute = process.argv.includes("--execute");
const targetMakes = makeArg
  ? [normalizeSupportedMake(makeArg)].filter((make): make is (typeof SUPPORTED_MAKES)[number] => Boolean(make))
  : [...SUPPORTED_MAKES];
const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.round(limitArg) : 100;
const skip = Number.isFinite(skipArg) && skipArg > 0 ? Math.round(skipArg) : 0;

async function main() {
  if (targetMakes.length === 0) throw new Error(`Unsupported make: ${makeArg}`);

  const vehicleFilter: Record<string, unknown> = {
    inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] },
    model: {
      make: {
        name: { in: targetMakes },
      },
    },
  };
  if (vinArg) vehicleFilter.vin = vinArg;

  const listings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      vehicleId: { not: null },
      vehicle: { is: vehicleFilter },
    },
    select: {
      id: true,
      url: true,
      imageUrl: true,
      vehicleId: true,
      vehicle: {
        select: {
          vin: true,
          year: true,
          images: {
            select: {
              id: true,
              url: true,
              isPrimary: true,
              validationStatus: true,
            },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
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
    orderBy: { updatedAt: "desc" },
    skip,
    take: limit,
  });

  let inspected = 0;
  let invalidImages = 0;
  let listingHeroesUpdated = 0;
  let listingsDeactivated = 0;

  for (const listing of listings) {
    if (!listing.vehicleId || !listing.vehicle) continue;
    inspected++;

    if (isKnownInactiveListingUrl(listing.url) || isKnownInactiveListingUrl(listing.imageUrl)) {
      listingsDeactivated++;
      console.log(`STALE ${listing.vehicle.vin} | sold/archive source | ${listing.url || listing.imageUrl}`);

      if (execute) {
        await prisma.listing.update({
          where: { id: listing.id },
          data: {
            imageUrl: null,
            status: "INACTIVE",
            freshnessStatus: "INACTIVE",
            validationStatus: "STALE_SOURCE",
          },
        });
        await prisma.vehicleImage.updateMany({
          where: {
            vehicleId: listing.vehicleId,
            OR: [
              { url: { contains: "/sold-images" } },
              { url: { contains: "/pre-owned-inventory-sold" } },
              { url: { contains: "/used-inventory-sold" } },
              { url: { contains: "/inventory-sold" } },
              { url: { contains: "/sold-inventory" } },
            ],
          },
          data: {
            isPrimary: false,
            validationStatus: "IMAGE_UNVERIFIED",
          },
        });
      }

      continue;
    }

    const images = uniqueImages([
      ...(listing.imageUrl ? [{ id: null, url: listing.imageUrl, isPrimary: true }] : []),
      ...listing.vehicle.images.filter((image) => !isRejectedImageStatus(image.validationStatus)),
    ]);
    const validUrls: string[] = [];
    const invalidUrls: string[] = [];

    for (const image of images) {
      const validation = await validateVehicleImageContentFromUrl(image.url);
      if (validation.status === "VALID_CAR_IMAGE") {
        validUrls.push(image.url);
        continue;
      }

      invalidUrls.push(image.url);
      invalidImages++;
      console.log(`REJECT ${listing.vehicle.vin} | ${validation.status} | ${image.url}`);
    }

    const nextHero = validUrls[0] || null;
    const currentHeroInvalid = Boolean(listing.imageUrl && invalidUrls.includes(listing.imageUrl));
    const heroShouldChange = Boolean(nextHero && (!listing.imageUrl || currentHeroInvalid || nextHero !== listing.imageUrl));

    if (!execute) {
      if (heroShouldChange) listingHeroesUpdated++;
      if (!nextHero) listingsDeactivated++;
      continue;
    }

    if (invalidUrls.length > 0) {
      await prisma.vehicleImage.updateMany({
        where: {
          vehicleId: listing.vehicleId,
          url: { in: invalidUrls },
        },
        data: {
          isPrimary: false,
          validationStatus: "IMAGE_UNVERIFIED",
        },
      });
    }

    if (nextHero) {
      if (heroShouldChange) {
        await prisma.listing.update({
          where: { id: listing.id },
          data: { imageUrl: nextHero, freshnessStatus: "ACTIVE" },
        });
        listingHeroesUpdated++;
      }

      await prisma.vehicleImage.updateMany({
        where: {
          vehicleId: listing.vehicleId,
          validationStatus: "VALID",
        },
        data: { isPrimary: false },
      });
      await prisma.vehicleImage.updateMany({
        where: {
          vehicleId: listing.vehicleId,
          url: nextHero,
          validationStatus: "VALID",
        },
        data: { isPrimary: true },
      });
      continue;
    }

    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        imageUrl: null,
        status: "INACTIVE",
        freshnessStatus: "INACTIVE",
        validationStatus: "IMAGE_UNVERIFIED",
      },
    });
    listingsDeactivated++;
  }

  console.log(
    JSON.stringify(
      {
        execute,
        targetMakes,
        vin: vinArg ?? null,
        skip,
        inspected,
        invalidImages,
        listingHeroesUpdated,
        listingsDeactivated,
      },
      null,
      2
    )
  );
}

function uniqueImages<T extends { url: string }>(images: T[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (!image.url || seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

function isRejectedImageStatus(status: string | null) {
  return status === "IMAGE_UNVERIFIED" || status === "IMAGE_MISMATCH";
}

main()
  .catch((error) => {
    console.error("Inventory image audit failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
