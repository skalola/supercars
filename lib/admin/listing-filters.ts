import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SUPPORTED_MAKES } from "@/lib/supported-makes";

export const inventoryDashboardListingWhere: Prisma.ListingWhereInput = {
  status: "ACTIVE",
  validationStatus: "VALID",
  vehicleId: { not: null },
  imageUrl: { not: null },
  vehicle: {
    is: {
      inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] },
      model: {
        make: {
          name: { in: [...SUPPORTED_MAKES] },
        },
      },
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
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return rawListings;
}

export async function getAdminInventoryListings() {
  return prisma.listing.findMany({
    where: {
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
