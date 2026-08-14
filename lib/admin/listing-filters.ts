import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  NON_VEHICLE_IMAGE_URL_PATTERN,
  NON_VEHICLE_IMAGE_URL_TERMS,
} from "@/lib/vehicle-images";

const SUPPORTED_INVENTORY_MAKES = ["Ferrari", "Lamborghini", "McLaren"];
const ADMIN_LISTING_LIMIT = 1000;
export const ADMIN_LISTINGS_PAGE_SIZE = 50;

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

const liveInventoryWhere: Prisma.ListingWhereInput = {
  ...inventoryDashboardListingWhere,
  imageUrl: { not: null },
  AND: NON_VEHICLE_IMAGE_URL_TERMS.map((term) => ({
    NOT: { imageUrl: { contains: term, mode: "insensitive" } },
  })),
  vehicle: {
    is: {
      inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] },
      model: {
        make: { name: { in: SUPPORTED_INVENTORY_MAKES } },
      },
    },
  },
};

const adminInventoryListingSelect = {
  id: true,
  imageUrl: true,
  status: true,
  validationStatus: true,
  priceStatus: true,
  freshnessStatus: true,
  askingPrice: true,
  price: true,
  mileage: true,
  dealerName: true,
  location: true,
  externalListingId: true,
  url: true,
  updatedAt: true,
  source: {
    select: {
      name: true,
      website: true,
      type: true,
    },
  },
  vehicle: {
    select: {
      trim: true,
      year: true,
      vin: true,
      model: {
        select: {
          name: true,
          make: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ListingSelect;

export async function getInventoryDashboardListings() {
  return prisma.listing.findMany({
    where: liveInventoryWhere,
    select: {
      id: true,
      modelId: true,
      imageUrl: true,
      askingPrice: true,
      price: true,
      dealerName: true,
      vehicle: {
        select: {
          model: {
            select: {
              make: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
      model: {
        select: {
          make: {
            select: {
              name: true,
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
    take: ADMIN_LISTING_LIMIT,
  });
}

export async function getAdminInventoryListings(page = 1) {
  return prisma.listing.findMany({
    where: {
      vehicleId: { not: null },
      NOT: [
        { source: { is: { type: "AUCTION" } } },
        { url: { contains: "bringatrailer.com", mode: "insensitive" } },
      ],
    },
    select: adminInventoryListingSelect,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    skip: (page - 1) * ADMIN_LISTINGS_PAGE_SIZE,
    take: ADMIN_LISTINGS_PAGE_SIZE,
  });
}

export async function getAdminInventoryListingCount() {
  return prisma.listing.count({
    where: {
      vehicleId: { not: null },
      NOT: [
        { source: { is: { type: "AUCTION" } } },
        { url: { contains: "bringatrailer.com", mode: "insensitive" } },
      ],
    },
  });
}

export async function getInventoryDashboardListingCount() {
  return prisma.listing.count({
    where: liveInventoryWhere,
  });
}

export async function getLiveInventoryListingStats() {
  type InventoryStatsRow = {
    liveListingCount: number;
    pricedListingCount: number;
    totalLiveListingValue: number;
    averageLiveListingPrice: number;
    listingsByMake: Array<{ label: string; value: number }>;
    topSources: Array<{ label: string; value: number }>;
  };

  const [stats] = await prisma.$queryRaw<InventoryStatsRow[]>`
    WITH clean_listings AS (
      SELECT
        COALESCE(listing."askingPrice", listing."price", 0)::double precision AS value,
        make."name" AS make_name,
        COALESCE(source."name", listing."dealerName", 'Unknown') AS source_name
      FROM "Listing" listing
      INNER JOIN "Vehicle" vehicle ON vehicle."id" = listing."vehicleId"
      INNER JOIN "Model" model ON model."id" = vehicle."modelId"
      INNER JOIN "Make" make ON make."id" = model."makeId"
      LEFT JOIN "MarketSource" source ON source."id" = listing."sourceId"
      WHERE listing."status" = 'ACTIVE'
        AND listing."validationStatus" = 'VALID'
        AND vehicle."inventoryStatus" IN ('ACTIVE', 'VALID', 'WARNING')
        AND listing."priceStatus" IS DISTINCT FROM 'PRICE_INVALID'
        AND (listing."askingPrice" >= 10000 OR listing."price" >= 10000)
        AND listing."imageUrl" IS NOT NULL
        AND listing."imageUrl" !~* ${NON_VEHICLE_IMAGE_URL_PATTERN}
        AND make."name" IN ('Ferrari', 'Lamborghini', 'McLaren')
        AND (source."type" IS NULL OR source."type" <> 'AUCTION')
        AND (listing."url" IS NULL OR listing."url" NOT ILIKE '%bringatrailer.com%')
    ),
    make_counts AS (
      SELECT make_name AS label, COUNT(*)::int AS value
      FROM clean_listings
      GROUP BY make_name
      ORDER BY value DESC, label ASC
    ),
    source_counts AS (
      SELECT source_name AS label, COUNT(*)::int AS value
      FROM clean_listings
      GROUP BY source_name
      ORDER BY value DESC, label ASC
      LIMIT 5
    )
    SELECT
      COUNT(*)::int AS "liveListingCount",
      COUNT(*) FILTER (WHERE value > 0)::int AS "pricedListingCount",
      COALESCE(SUM(value), 0)::double precision AS "totalLiveListingValue",
      COALESCE(AVG(value) FILTER (WHERE value > 0), 0)::double precision AS "averageLiveListingPrice",
      COALESCE((SELECT json_agg(make_counts) FROM make_counts), '[]'::json) AS "listingsByMake",
      COALESCE((SELECT json_agg(source_counts) FROM source_counts), '[]'::json) AS "topSources"
    FROM clean_listings
  `;

  return {
    listings: [],
    listingsByMake: stats?.listingsByMake ?? [],
    topSources: stats?.topSources ?? [],
    liveListingCount: stats?.liveListingCount ?? 0,
    pricedListingCount: stats?.pricedListingCount ?? 0,
    totalLiveListingValue: stats?.totalLiveListingValue ?? 0,
    averageLiveListingPrice: stats?.averageLiveListingPrice ?? 0,
  };
}
