import type { Prisma } from "@prisma/client";
import { isModelMatch } from "@/lib/data-quality/inventory-validator";
import { prisma } from "@/lib/prisma";

export const inventoryDashboardListingWhere: Prisma.ListingWhereInput = {
  status: "ACTIVE",
  vehicle: {
    is: {
      inventoryStatus: { in: ["VALID", "WARNING"] },
    },
  },
  validationStatus: "VALID",
  priceStatus: { not: "PRICE_INVALID" },
  OR: [{ price: null }, { price: { gte: 10000 } }],
  AND: [
    {
      OR: [{ askingPrice: null }, { askingPrice: { gte: 10000 } }],
    },
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

  const groups = new Map<string, typeof rawListings>();
  for (const listing of rawListings) {
    if (!listing.vehicle || !listing.vehicle.vin) continue;

    const makeMatch =
      listing.vehicle.model.make.name.toLowerCase().trim() ===
      listing.model.make.name.toLowerCase().trim();
    const modelMatch = isModelMatch(
      listing.model.name,
      listing.model.slug,
      listing.vehicle.model.name
    );

    if (!makeMatch || !modelMatch) continue;

    const existing = groups.get(listing.vehicle.vin) || [];
    existing.push(listing);
    groups.set(listing.vehicle.vin, existing);
  }

  return Array.from(groups.values())
    .map((list) =>
      list.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        const priceA = a.askingPrice || a.price || Infinity;
        const priceB = b.askingPrice || b.price || Infinity;
        return priceA - priceB;
      })[0]
    )
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

export async function getInventoryDashboardListingCount() {
  const listings = await getInventoryDashboardListings();
  return listings.length;
}
