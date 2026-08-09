import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getVehicleHeroImage, isNonVehicleImageUrl } from "@/lib/vehicle-images";

export const inventoryDashboardListingWhere: Prisma.ListingWhereInput = {
  status: "ACTIVE",
  validationStatus: "VALID",
  vehicleId: { not: null },
  vehicle: {
    is: {
      inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] },
    },
  },
  priceStatus: { not: "PRICE_INVALID" },
  OR: [{ askingPrice: { gte: 10000 } }, { price: { gte: 10000 } }],
  NOT: [
    { source: { is: { type: "AUCTION" } } },
    { url: { contains: "bringatrailer.com", mode: "insensitive" } },
  ],
};

export async function getInventoryDashboardListings() {
  const rawListings = await prisma.listing.findMany({
    where: inventoryDashboardListingWhere,
    include: {
      model: {
        include: {
          make: true,
        },
      },
      vehicle: {
        include: {
          photos: {
            orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
          },
          images: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          },
          model: {
            include: {
              images: true,
              make: true,
            },
          },
        },
      },
      source: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return rawListings.filter(hasCleanInventoryDisplayImage);
}

export async function getAdminInventoryListings() {
  return prisma.listing.findMany({
    where: {
      vehicleId: { not: null },
      NOT: [
        { source: { is: { type: "AUCTION" } } },
        { url: { contains: "bringatrailer.com", mode: "insensitive" } },
      ],
    },
    include: {
      model: {
        include: {
          make: true,
        },
      },
      vehicle: {
        include: {
          model: {
            include: {
              make: true,
            },
          },
        },
      },
      source: {
        select: {
          name: true,
          website: true,
          type: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
}

function hasCleanInventoryDisplayImage(listing: {
  imageUrl?: string | null;
  vehicle?: unknown;
}) {
  const vehicleHero = getVehicleHeroImage(listing.vehicle as Parameters<typeof getVehicleHeroImage>[0]);
  if (vehicleHero && vehicleHero !== "/images/placeholder.jpg" && !isNonVehicleImageUrl(vehicleHero)) return true;
  return Boolean(listing.imageUrl && !isNonVehicleImageUrl(listing.imageUrl));
}

export async function getInventoryDashboardListingCount() {
  const listings = await getInventoryDashboardListings();
  return listings.length;
}

export async function getLiveInventoryListingStats() {
  const listings = await getInventoryDashboardListings();
  const prices = listings
    .map((listing) => listing.askingPrice ?? listing.price ?? 0)
    .filter((price) => price > 0);

  return {
    listings,
    liveListingCount: listings.length,
    pricedListingCount: prices.length,
    totalLiveListingValue: prices.reduce((sum, price) => sum + price, 0),
    averageLiveListingPrice:
      prices.length > 0 ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0,
  };
}
