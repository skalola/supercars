import React from "react";
import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import InventoryExplorer from "@/components/market/InventoryExplorer";
import {
  getCatalogMakeOptions,
  getCatalogMakeWithModels,
  type MakeOption,
  type ModelOption,
} from "@/lib/makes/catalog";
import {
  NON_VEHICLE_IMAGE_URL_PATTERN,
  NON_VEHICLE_IMAGE_URL_TERMS,
} from "@/lib/vehicle-images";

type InventoryPageProps = {
  searchParams?: Promise<{
    make?: string;
    model?: string;
    year?: string;
    minPrice?: string;
    maxPrice?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 48;
const SUPPORTED_INVENTORY_MAKES = ["Ferrari", "Lamborghini", "McLaren"];

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const mappedMakes = await getCatalogMakeOptions();
  const selectedMakeId = resolveMakeId(mappedMakes, resolvedSearchParams.make);
  const selectedMake = mappedMakes.find((make) => make.id === selectedMakeId);
  const selectedMakeCatalog = selectedMake
    ? await getCatalogMakeWithModels(selectedMake.slug)
    : null;
  const mappedModels: ModelOption[] = selectedMakeCatalog?.models.map((model) => ({
    ...model,
    make: selectedMake!,
  })) ?? [];
  const selectedModelId = resolveModelId(mappedModels, resolvedSearchParams.model, selectedMakeId);
  const selectedYear = parseYear(resolvedSearchParams.year);
  const minPrice = parsePrice(resolvedSearchParams.minPrice);
  const maxPrice = parsePrice(resolvedSearchParams.maxPrice);
  const requestedPage = Math.max(1, Number.parseInt(resolvedSearchParams.page || "1", 10) || 1);

  const where = buildInventoryWhere({
    makeId: selectedMakeId,
    modelId: selectedModelId,
    year: selectedYear,
    minPrice,
    maxPrice,
  });

  const [listings, summary] = await Promise.all([
    getCachedInventoryListings(where, requestedPage),
    getCachedInventorySummary({
      makeId: selectedMakeId,
      modelId: selectedModelId,
      year: selectedYear,
      minPrice,
      maxPrice,
    }),
  ]);

  const totalListings = summary.totalListings;
  const totalValue = summary.totalValue;
  const availableYears = summary.availableYears;

  const mappedListings = listings.map((l) => ({
    id: l.id,
    modelId: l.vehicle!.modelId,
    imageUrl: l.imageUrl,
    year: l.vehicle!.year,
    price: l.price,
    mileage: l.mileage,
    color: l.color,
    askingPrice: l.askingPrice,
    url: l.url,
    vehicleId: l.vehicleId,
    vehicle: {
      vin: l.vehicle!.vin,
      heroImageUrl: l.imageUrl,
    },
    model: {
      id: l.vehicle!.model.id,
      name: l.vehicle!.model.name,
      slug: l.vehicle!.model.slug,
      makeId: l.vehicle!.model.makeId,
      make: {
        id: l.vehicle!.model.make.id,
        name: l.vehicle!.model.make.name,
        slug: l.vehicle!.model.make.slug,
      },
    },
  }));

  return (
    <InventoryExplorer
      listings={mappedListings}
      makes={mappedMakes}
      models={mappedModels}
      availableYears={availableYears}
      totalListings={totalListings}
      totalValue={totalValue}
      page={requestedPage}
      pageSize={PAGE_SIZE}
      initialMake={resolvedSearchParams.make}
      initialModel={resolvedSearchParams.model}
      initialYear={resolvedSearchParams.year}
      initialMinPrice={resolvedSearchParams.minPrice}
      initialMaxPrice={resolvedSearchParams.maxPrice}
    />
  );
}

const inventoryListingSelect = {
  id: true,
  imageUrl: true,
  price: true,
  mileage: true,
  color: true,
  askingPrice: true,
  url: true,
  vehicleId: true,
  vehicle: {
    select: {
      modelId: true,
      year: true,
      vin: true,
      model: {
        select: {
          id: true,
          name: true,
          slug: true,
          makeId: true,
          make: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ListingSelect;

const getCachedInventoryListings = unstable_cache(
  async (where: Prisma.ListingWhereInput, page: number) => prisma.listing.findMany({
    where,
    select: inventoryListingSelect,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  }),
  ["public-inventory-listings-v1"],
  { revalidate: 300, tags: ["public-inventory"] },
);

const getCachedInventorySummary = unstable_cache(
  getInventorySummary,
  ["public-inventory-summary-v1"],
  { revalidate: 300, tags: ["public-inventory"] },
);

async function getInventorySummary({
  makeId,
  modelId,
  year,
  minPrice,
  maxPrice,
}: {
  makeId?: string;
  modelId?: string;
  year?: number;
  minPrice?: number;
  maxPrice?: number;
}) {
  type InventorySummaryRow = {
    totalListings: number;
    totalValue: number;
    availableYears: number[];
  };

  const minimumPrice = minPrice || 10_000;
  const maximumPriceClause = maxPrice
    ? Prisma.sql`AND COALESCE(listing."askingPrice", listing."price") <= ${maxPrice}`
    : Prisma.empty;
  const makeClause = makeId ? Prisma.sql`AND make."id" = ${makeId}` : Prisma.empty;
  const modelClause = modelId ? Prisma.sql`AND model."id" = ${modelId}` : Prisma.empty;
  const visibilityClause = Prisma.sql`AND listing."validationStatus" = 'VALID'
      AND vehicle."inventoryStatus" IN ('ACTIVE', 'VALID', 'WARNING')`;
  const selectedYearClause = year ? Prisma.sql`WHERE year = ${year}` : Prisma.empty;

  const [summary] = await prisma.$queryRaw<InventorySummaryRow[]>(Prisma.sql`
    WITH eligible AS (
      SELECT
        listing."year" AS year,
        COALESCE(listing."askingPrice", listing."price")::double precision AS value
      FROM "Listing" listing
      INNER JOIN "Vehicle" vehicle ON vehicle."id" = listing."vehicleId"
      INNER JOIN "Model" model ON model."id" = vehicle."modelId"
      INNER JOIN "Make" make ON make."id" = model."makeId"
      LEFT JOIN "MarketSource" source ON source."id" = listing."sourceId"
      WHERE listing."status" = 'ACTIVE'
        AND listing."priceStatus" IS DISTINCT FROM 'PRICE_INVALID'
        AND listing."imageUrl" IS NOT NULL
        AND listing."imageUrl" !~* ${NON_VEHICLE_IMAGE_URL_PATTERN}
        AND (source."type" IS NULL OR source."type" <> 'AUCTION')
        AND (listing."url" IS NULL OR listing."url" NOT ILIKE '%bringatrailer.com%')
        AND make."name" IN (${Prisma.join(SUPPORTED_INVENTORY_MAKES)})
        AND COALESCE(listing."askingPrice", listing."price") >= ${minimumPrice}
        ${maximumPriceClause}
        ${makeClause}
        ${modelClause}
        ${visibilityClause}
    ),
    filtered AS (
      SELECT * FROM eligible ${selectedYearClause}
    )
    SELECT
      (SELECT COUNT(*)::int FROM filtered) AS "totalListings",
      (SELECT COALESCE(SUM(value), 0)::double precision FROM filtered) AS "totalValue",
      COALESCE(
        (SELECT ARRAY_AGG(DISTINCT year ORDER BY year DESC) FROM eligible),
        ARRAY[]::integer[]
      ) AS "availableYears"
  `);

  return {
    totalListings: summary?.totalListings ?? 0,
    totalValue: summary?.totalValue ?? 0,
    availableYears: summary?.availableYears ?? [],
  };
}

function buildInventoryWhere({
  makeId,
  modelId,
  year,
  minPrice,
  maxPrice,
}: {
  makeId?: string;
  modelId?: string;
  year?: number;
  minPrice?: number;
  maxPrice?: number;
}): Prisma.ListingWhereInput {
  const modelFilter: Prisma.ModelWhereInput = {
    ...(modelId ? { id: modelId } : {}),
    ...(makeId ? { makeId } : {}),
    make: { name: { in: SUPPORTED_INVENTORY_MAKES } },
  };

  const priceBounds = {
    gte: minPrice || 10_000,
    ...(maxPrice ? { lte: maxPrice } : {}),
  };

  return {
    status: "ACTIVE",
    vehicleId: { not: null },
    priceStatus: { not: "PRICE_INVALID" },
    NOT: [
      { source: { is: { type: "AUCTION" } } },
      { url: { contains: "bringatrailer.com", mode: "insensitive" } },
      ...NON_VEHICLE_IMAGE_URL_TERMS.map((term) => ({
        imageUrl: { contains: term, mode: "insensitive" as const },
      })),
    ],
    AND: [
      {
        OR: [
          {
            validationStatus: "VALID",
            vehicle: {
              is: {
                inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] },
                model: modelFilter,
              },
            },
          },
        ],
      },
      ...(year ? [{ year }] : []),
      {
        OR: [
          { askingPrice: priceBounds },
          {
            AND: [
              { askingPrice: null },
              { price: priceBounds },
            ],
          },
        ],
      },
      { imageUrl: { not: null } },
    ],
  };
}

function resolveMakeId(makes: MakeOption[], value?: string) {
  const normalized = normalizeFilterValue(value);
  if (!normalized) return "";

  return (
    makes.find((make) =>
      [make.id, make.slug, make.name].some((candidate) => normalizeFilterValue(candidate) === normalized)
    )?.id || ""
  );
}

function resolveModelId(models: ModelOption[], value?: string, makeId?: string) {
  const normalized = normalizeFilterValue(value);
  if (!normalized) return "";

  return (
    models.find((model) => {
      if (makeId && model.makeId !== makeId) return false;
      return [model.id, model.slug, model.name].some((candidate) => normalizeFilterValue(candidate) === normalized);
    })?.id || ""
  );
}

function parseYear(value?: string) {
  const year = Number.parseInt(value || "", 10);
  if (!Number.isFinite(year) || year < 1900 || year > new Date().getFullYear() + 2) return undefined;
  return year;
}

function parsePrice(value?: string) {
  const price = Number.parseInt(value || "", 10);
  if (!Number.isFinite(price) || price <= 0) return undefined;
  return price;
}

function normalizeFilterValue(value?: string) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "";
}
