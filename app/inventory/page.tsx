import React from "react";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import InventoryExplorer from "@/components/market/InventoryExplorer";
import { getMakeModelCatalogOptions, type MakeOption, type ModelOption } from "@/lib/makes/catalog";
import { isNonVehicleImageUrl } from "@/lib/vehicle-images";

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
  const [{ makes: mappedMakes, models: mappedModels }, session] = await Promise.all([
    getMakeModelCatalogOptions(),
    auth(),
  ]);

  const isAdmin = session?.user?.role === "ADMIN";
  const selectedMakeId = resolveMakeId(mappedMakes, resolvedSearchParams.make);
  const selectedModelId = resolveModelId(mappedModels, resolvedSearchParams.model, selectedMakeId);
  const selectedYear = parseYear(resolvedSearchParams.year);
  const minPrice = parsePrice(resolvedSearchParams.minPrice);
  const maxPrice = parsePrice(resolvedSearchParams.maxPrice);
  const requestedPage = Math.max(1, Number.parseInt(resolvedSearchParams.page || "1", 10) || 1);

  const where = buildInventoryWhere({
    isAdmin,
    makeId: selectedMakeId,
    modelId: selectedModelId,
    year: selectedYear,
    minPrice,
    maxPrice,
  });

  const yearFilterWhere = buildInventoryWhere({
    isAdmin,
    makeId: selectedMakeId,
    modelId: selectedModelId,
    minPrice,
    maxPrice,
  });

  const [listings, totalListings, askingPriceTotal, fallbackPriceTotal, yearRows] = await Promise.all([
    prisma.listing.findMany({
      where,
      select: inventoryListingSelect,
      orderBy: { createdAt: "desc" },
      skip: (requestedPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.listing.count({ where }),
    prisma.listing.aggregate({
      where,
      _sum: {
        askingPrice: true,
      },
    }),
    prisma.listing.aggregate({
      where: {
        AND: [
          where,
          { askingPrice: null },
        ],
      },
      _sum: {
        price: true,
      },
    }),
    prisma.listing.groupBy({
      by: ["year"],
      where: yearFilterWhere,
      orderBy: { year: "desc" },
    }),
  ]);

  const totalValue = (askingPriceTotal._sum.askingPrice || 0) + (fallbackPriceTotal._sum.price || 0);
  const availableYears = yearRows.map((row) => row.year).filter(Boolean);

  const mappedListings = listings.filter(hasCleanDisplayImage).map((l) => ({
    id: l.id,
    modelId: l.vehicle?.modelId || l.modelId,
    imageUrl: l.imageUrl,
    year: l.vehicle?.year || l.year,
    price: l.price,
    mileage: l.mileage,
    color: l.color,
    askingPrice: l.askingPrice,
    url: l.url,
    vehicleId: l.vehicleId,
    vehicle: l.vehicle
      ? {
          vin: l.vehicle.vin,
          heroImageUrl: l.imageUrl,
        }
      : null,
    model: {
      id: l.vehicle?.model.id || l.model.id,
      name: l.vehicle?.model.name || l.model.name,
      slug: l.vehicle?.model.slug || l.model.slug,
      makeId: l.vehicle?.model.makeId || l.model.makeId,
      make: {
        id: l.vehicle?.model.make.id || l.model.make.id,
        name: l.vehicle?.model.make.name || l.model.make.name,
        slug: l.vehicle?.model.make.slug || l.model.make.slug,
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
  modelId: true,
  imageUrl: true,
  year: true,
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
} satisfies Prisma.ListingSelect;

function buildInventoryWhere({
  isAdmin,
  makeId,
  modelId,
  year,
  minPrice,
  maxPrice,
}: {
  isAdmin: boolean;
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
          ...(isAdmin
            ? [
                {
                  validationStatus: "ADMIN_TEST",
                  vehicle: {
                    is: {
                      inventoryStatus: "ADMIN_TEST",
                      model: modelFilter,
                    },
                  },
                },
              ]
            : []),
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

function hasCleanDisplayImage(listing: { imageUrl: string | null }) {
  return Boolean(listing.imageUrl && !isNonVehicleImageUrl(listing.imageUrl));
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
