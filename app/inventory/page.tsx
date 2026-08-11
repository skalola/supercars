/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import InventoryExplorer from "@/components/market/InventoryExplorer";
import { getMakeModelCatalogOptions } from "@/lib/makes/catalog";
import { getVehicleHeroImage, isNonVehicleImageUrl } from "@/lib/vehicle-images";

type InventoryPageProps = {
  searchParams?: Promise<{ make?: string; model?: string }>;
};

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  // ── Diagnostic logging ──────────────────────────────────────────────────
  // Runs server-side on every page load so we can see filtering impact in logs.
  const [totalVehicles, totalListings, statusBreakdown] = await Promise.all([
    prisma.vehicle.count(),
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.vehicle.groupBy({ by: ["inventoryStatus"], _count: { id: true } }),
  ]);
  console.log("[Inventory Page] Vehicles found:", totalVehicles);
  console.log("[Inventory Page] Active Listings found:", totalListings);
  console.log("[Inventory Page] Filtered by inventoryStatus:");
  statusBreakdown.forEach((s) =>
    console.log(`  ${s.inventoryStatus ?? "null"}: ${s._count.id}`)
  );

  // Public inventory is listing-first: every row must have VIN, price, and listing image.
  // VIN decode owns the displayed make/model, so crawler text mismatches stay backend quality signals.
  const listings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      vehicleId: { not: null },
      AND: [
        {
          OR: [
            {
              validationStatus: "VALID",
              vehicle: {
                is: {
                  inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] },
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
                      },
                    },
                  },
                ]
              : []),
          ],
        }
      ],
      priceStatus: { not: "PRICE_INVALID" },
      OR: [
        { askingPrice: { gte: 10000 } },
        { price: { gte: 10000 } }
      ],
      NOT: [
        { source: { is: { type: "AUCTION" } } },
        { url: { contains: "bringatrailer.com", mode: "insensitive" } },
      ],
    },
    include: {
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
      model: {
        include: {
          make: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const visibleListings = listings.filter(hasCleanDisplayImage);

  console.log(
    `[Inventory Page] ${isAdmin ? "Admin-visible" : "Public"} VIN/price/image listings to display:`,
    visibleListings.length
  );

  // Map database listings to matched explorer format
  const mappedListings = visibleListings.map((l: any) => ({
    id: l.id,
    modelId: l.vehicle.modelId,
    imageUrl: l.imageUrl,
    year: l.vehicle.year,
    price: l.price,
    mileage: l.mileage,
    color: l.color,
    askingPrice: l.askingPrice,
    url: l.url,
    vehicleId: l.vehicleId,
    vehicle: l.vehicle
      ? {
          vin: l.vehicle.vin,
          photos: l.vehicle.photos,
          images: l.vehicle.images,
          model: l.vehicle.model,
        }
      : null,
    model: {
      id: l.vehicle.model.id,
      name: l.vehicle.model.name,
      slug: l.vehicle.model.slug,
      makeId: l.vehicle.model.makeId,
      make: {
        id: l.vehicle.model.make.id,
        name: l.vehicle.model.make.name,
        slug: l.vehicle.model.make.slug,
      },
    },
  }));

  const { makes: mappedMakes, models: mappedModels } = await getMakeModelCatalogOptions();

  return (
    <InventoryExplorer
      listings={mappedListings}
      makes={mappedMakes}
      models={mappedModels}
      initialMake={resolvedSearchParams.make}
      initialModel={resolvedSearchParams.model}
    />
  );
}

function hasCleanDisplayImage(listing: any) {
  const vehicleHero = getVehicleHeroImage(listing.vehicle);
  if (vehicleHero && vehicleHero !== "/images/placeholder.jpg" && !isNonVehicleImageUrl(vehicleHero)) return true;
  return Boolean(listing.imageUrl && !isNonVehicleImageUrl(listing.imageUrl));
}
