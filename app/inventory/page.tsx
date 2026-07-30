/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React from "react";
import { prisma } from "@/lib/prisma";
import InventoryExplorer from "@/components/market/InventoryExplorer";
import { isModelMatch } from "@/lib/data-quality/inventory-validator";
import { SUPPORTED_MAKES } from "@/lib/supported-makes";

export default async function InventoryPage() {
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

  // Fetch active listings — only vehicles with VALID or WARNING status are shown.
  // WARNING = minor issues (trim variation, missing mileage, missing image) — safe to display.
  // NEEDS_REVIEW = confirmed identity conflict — hidden from public inventory.
  // REMOVED = duplicate or invalid VIN — permanently hidden.
  const rawListings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      vehicle: {
        is: {
          inventoryStatus: { in: ["VALID", "WARNING"] },
          model: {
            make: {
              name: { in: [...SUPPORTED_MAKES] },
            },
          },
        }
      },
      validationStatus: "VALID",
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

  console.log("[Inventory Page] Raw listings after status filter:", rawListings.length);

  // Group active listings by vehicle VIN and choose the newest + lowest price
  const groups = new Map<string, any[]>();
  for (const l of rawListings) {
    if (!l.vehicle || !l.vehicle.model || !l.vehicle.model.make) continue;
    const makeMatch = l.vehicle.model.make.name.toLowerCase().trim() === l.model.make.name.toLowerCase().trim();
    const modelMatch = isModelMatch(l.model.name, l.model.slug, l.vehicle.model.name);
    if (!makeMatch || !modelMatch) continue;

    const vin = l.vehicle?.vin;
    if (!vin) continue;
    if (!groups.has(vin)) {
      groups.set(vin, []);
    }
    groups.get(vin)!.push(l);
  }

  const dedupedListings: any[] = [];
  for (const [vin, list] of groups.entries()) {
    list.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      if (dateB !== dateA) return dateB - dateA;
      const priceA = a.askingPrice || a.price || Infinity;
      const priceB = b.askingPrice || b.price || Infinity;
      return priceA - priceB;
    });
    dedupedListings.push(list[0]);
  }

  const listings = dedupedListings.sort((a, b) => {
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  console.log("[Inventory Page] Deduplicated listings to display:", listings.length);

  // Fetch makes and models for filters selection options
  const [makes, models] = await Promise.all([
    prisma.make.findMany({
      where: { name: { in: [...SUPPORTED_MAKES] } },
      orderBy: { name: "asc" },
    }),
    prisma.model.findMany({
      where: {
        make: {
          name: { in: [...SUPPORTED_MAKES] },
        },
      },
      include: {
        make: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Map database listings to matched explorer format
  const mappedListings = listings.map((l: any) => ({
    id: l.id,
    modelId: l.vehicle.modelId,
    imageUrl: l.imageUrl,
    year: l.vehicle.year,
    price: l.price,
    mileage: l.mileage,
    color: l.color,
    askingPrice: l.askingPrice,
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

  const mappedMakes = makes.map((m) => ({
    id: m.id,
    name: m.name,
    slug: m.slug,
  }));

  const mappedModels = models.map((m) => ({
    id: m.id,
    name: m.name,
    slug: m.slug,
    makeId: m.makeId,
    make: {
      id: m.make.id,
      name: m.make.name,
      slug: m.make.slug,
    },
  }));

  return <InventoryExplorer listings={mappedListings} makes={mappedMakes} models={mappedModels} />;
}
