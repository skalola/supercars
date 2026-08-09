import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SUPPORTED_MAKES } from "@/lib/supported-makes";
import { getVehicleHeroImage, isNonVehicleImageUrl } from "@/lib/vehicle-images";

export type HomepageGarageVehicle = {
  id: string;
  label: string;
  eyebrow: string;
  href: string;
  imageUrl: string | null;
  status: "OWNED" | "DREAM" | "PREVIOUS";
  meta: string;
};

export type HomepageSummary = {
  username: string | null;
  heroImageUrl: string | null;
  heroVehicleLabel: string;
  heroVehicleMeta: string;
  garageValue: number | null;
  garageValueLabel: string;
  totalCars: number;
  mostExpensiveLabel: string;
  mostExpensiveValue: number | null;
  fastestCarLabel: string;
  fastestCarValue: string;
  ownedVehicles: HomepageGarageVehicle[];
  dreamVehicles: HomepageGarageVehicle[];
  previousVehicles: HomepageGarageVehicle[];
  featuredVehicles: HomepageGarageVehicle[];
  activityItems: Array<{ label: string; detail: string; href: string }>;
};

type SessionUser = {
  id?: string | null;
};

export async function getHomepageSummary(user: SessionUser | undefined | null): Promise<HomepageSummary> {
  if (user?.id) {
    const signedInSummary = await getSignedInHomepageSummary(user.id);
    if (signedInSummary) return signedInSummary;
  }

  return getPublicHomepageSummary();
}

async function getSignedInHomepageSummary(userId: string): Promise<HomepageSummary | null> {
  const [user, ownedRows, dreamRows, inventoryVehicles] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, name: true },
    }),
    prisma.vehicle.findMany({
      where: {
        ownerId: userId,
        status: "CLAIMED",
      },
      include: {
        model: { include: { make: true, images: true, maintenanceRules: true, spec: true } },
        photos: { orderBy: [{ isHero: "desc" }, { displayOrder: "asc" }, { createdAt: "asc" }] },
        images: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        serviceRecords: { orderBy: { serviceDate: "desc" } },
        modifications: true,
        awards: true,
        listings: {
          where: {
            status: "ACTIVE",
            OR: [{ askingPrice: { gte: 10000 } }, { price: { gte: 10000 } }],
          },
          select: { askingPrice: true, price: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.garageItem.findMany({
      where: { userId },
      include: {
        model: {
          include: {
            make: true,
            images: { orderBy: [{ type: "asc" }, { createdAt: "asc" }] },
            listings: {
              where: {
                status: "ACTIVE",
                validationStatus: "VALID",
                priceStatus: { not: "PRICE_INVALID" },
                OR: [{ askingPrice: { gte: 10000 } }, { price: { gte: 10000 } }],
              },
              select: { askingPrice: true, price: true },
              take: 8,
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    getLiveInventoryVehicles(12),
  ]);

  if (!user) return null;

  const ownedModelIds = new Set(ownedRows.map((vehicle) => vehicle.modelId));
  const ownedVehicles = ownedRows.map((vehicle) => ({
    id: vehicle.id,
    label: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
    eyebrow: vehicle.trim || vehicle.model.make.name,
    href: `/vehicle/${vehicle.vin}`,
    imageUrl: cleanImage(getVehicleHeroImage(vehicle)),
    status: "OWNED" as const,
    meta: vehicle.mileage !== null ? `${vehicle.mileage.toLocaleString()} mi` : "Mileage pending",
  }));

  const savedDreamVehicles = dreamRows
    .filter((item) => !ownedModelIds.has(item.modelId))
    .map((item) => ({
      id: item.id,
      label: `${item.model.make.name} ${item.model.name}`,
      eyebrow: "Dream Garage",
      href: `/make/${item.model.make.slug}/${item.model.slug}`,
      imageUrl: cleanImage(item.model.images[0]?.url || null),
      status: "DREAM" as const,
      meta: item.model.years || "Tracked model",
    }));
  const dreamKeys = new Set(savedDreamVehicles.map((vehicle) => vehicle.href));
  const dreamVehicles = [
    ...savedDreamVehicles,
    ...inventoryVehicles.filter((vehicle) => !dreamKeys.has(vehicle.href)),
  ].slice(0, 12);

  const heroVehicle = ownedVehicles[0] || dreamVehicles[0] || null;
  const ownedValues = getOwnedValues(ownedRows);
  const garageValue = ownedValues.reduce((sum, item) => sum + item.value, 0) || calculateVehicleListValue(inventoryVehicles);
  const mostExpensive = getMostExpensiveFromOwned(ownedRows) ?? getMostExpensiveFromCards(inventoryVehicles);
  const fastestCar = getFastestOwnedVehicle(ownedRows) ?? { label: "Performance stats pending", value: "Pending" };
  const featuredVehicles = [...ownedVehicles, ...dreamVehicles].slice(0, 6);

  return {
    username: user.username,
    heroImageUrl: heroVehicle?.imageUrl || null,
    heroVehicleLabel: heroVehicle?.label || "Build your verified garage",
    heroVehicleMeta: heroVehicle?.meta || "Claim a VIN or save a dream car to begin.",
    garageValue,
    garageValueLabel: ownedVehicles.length > 0 ? "Garage Value" : "Dream Value",
    totalCars: ownedVehicles.length || inventoryVehicles.length,
    mostExpensiveLabel: mostExpensive?.label ?? "Most expensive",
    mostExpensiveValue: mostExpensive?.value ?? null,
    fastestCarLabel: fastestCar.label,
    fastestCarValue: fastestCar.value,
    ownedVehicles,
    dreamVehicles,
    previousVehicles: [],
    featuredVehicles,
    activityItems: buildActivityItems(ownedRows, dreamVehicles),
  };
}

async function getPublicHomepageSummary(): Promise<HomepageSummary> {
  const [featuredVehicles, totalCars, valueStats, activityItems] = await Promise.all([
    getLiveInventoryVehicles(12),
    prisma.listing.count({
      where: liveInventoryWhere,
    }),
    getLiveInventoryValueStats(),
    getLatestUserActivity(),
  ]);

  const fastestCar = await getFastestInventoryCar();
  const heroVehicle = featuredVehicles[0] || null;

  return {
    username: null,
    heroImageUrl: heroVehicle?.imageUrl || null,
    heroVehicleLabel: heroVehicle?.label || "Your verified collection starts here",
    heroVehicleMeta: heroVehicle?.meta || "Claim a VIN-backed car or save a dream model.",
    garageValue: valueStats.totalValue || null,
    garageValueLabel: "Live Collection Value",
    totalCars,
    mostExpensiveLabel: valueStats.mostExpensive?.label ?? "Most expensive",
    mostExpensiveValue: valueStats.mostExpensive?.value ?? null,
    fastestCarLabel: fastestCar.label,
    fastestCarValue: fastestCar.value,
    ownedVehicles: [],
    dreamVehicles: featuredVehicles,
    previousVehicles: [],
    featuredVehicles,
    activityItems,
  };
}

async function getLiveInventoryValueStats() {
  const listings = await prisma.listing.findMany({
    where: liveInventoryWhere,
    select: {
      askingPrice: true,
      price: true,
      vehicle: {
        select: {
          year: true,
          model: { select: { name: true, make: { select: { name: true } } } },
        },
      },
    },
    take: 1500,
  });
  const pricedListings = listings
    .map((listing) => ({
      label: listing.vehicle
        ? `${listing.vehicle.year} ${listing.vehicle.model.make.name} ${listing.vehicle.model.name}`
        : "Most expensive",
      value: listing.askingPrice ?? listing.price ?? 0,
    }))
    .filter((listing) => listing.value >= 10000);
  return {
    totalValue: pricedListings.reduce((sum, listing) => sum + listing.value, 0),
    mostExpensive: pricedListings.sort((a, b) => b.value - a.value)[0] ?? null,
  };
}

const liveInventoryWhere = {
  status: "ACTIVE",
  validationStatus: "VALID",
  priceStatus: { not: "PRICE_INVALID" },
  imageUrl: { not: null },
  vehicle: {
    is: {
      inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] },
      model: { make: { name: { in: [...SUPPORTED_MAKES] } } },
    },
  },
  OR: [{ askingPrice: { gte: 10000 } }, { price: { gte: 10000 } }],
  NOT: [
    { source: { is: { type: "AUCTION" } } },
    { url: { contains: "bringatrailer.com", mode: "insensitive" } },
  ],
} satisfies Prisma.ListingWhereInput;

async function getLiveInventoryVehicles(take: number): Promise<HomepageGarageVehicle[]> {
  const listings = await prisma.listing.findMany({
    where: {
      ...liveInventoryWhere,
    },
    include: {
      vehicle: {
        include: {
          photos: true,
          images: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
          model: { include: { make: true, images: true, spec: true } },
        },
      },
      model: { include: { make: true } },
    },
    orderBy: { updatedAt: "desc" },
    take,
  });

  return listings
    .filter((listing) => listing.vehicle)
    .map((listing) => {
      const vehicle = listing.vehicle!;
      return {
        id: listing.id,
        label: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
        eyebrow: listing.dealerName || vehicle.model.make.name,
        href: `/vehicle/${vehicle.vin}`,
        imageUrl: cleanImage(getVehicleHeroImage(vehicle)) || cleanImage(listing.imageUrl),
        status: "DREAM" as const,
        meta: formatCurrency(listing.askingPrice ?? listing.price),
      };
    })
    .filter((vehicle) => vehicle.imageUrl);
}

function getOwnedValues(
  vehicles: Array<{ year?: number; model?: { name: string; make: { name: string } }; listings: Array<{ askingPrice: number | null; price: number | null }> }>
) {
  return vehicles
    .map((vehicle) => vehicle.listings[0]?.askingPrice ?? vehicle.listings[0]?.price ?? null)
    .map((value, index) => ({ value, vehicle: vehicles[index] }))
    .filter((item): item is { value: number; vehicle: (typeof vehicles)[number] } => Boolean(item.value && item.value >= 10000));
}

function calculateVehicleListValue(vehicles: HomepageGarageVehicle[]) {
  return vehicles.reduce((sum, vehicle) => sum + parseCurrency(vehicle.meta), 0) || null;
}

function getMostExpensiveFromCards(vehicles: HomepageGarageVehicle[]) {
  return vehicles
    .map((vehicle) => ({ label: vehicle.label, value: parseCurrency(vehicle.meta) }))
    .filter((item) => item.value >= 10000)
    .sort((a, b) => b.value - a.value)[0] ?? null;
}

function getMostExpensiveFromOwned(
  vehicles: Array<{ year: number; model: { name: string; make: { name: string } }; listings: Array<{ askingPrice: number | null; price: number | null }> }>
) {
  const highest = getOwnedValues(vehicles).sort((a, b) => b.value - a.value)[0];
  if (!highest?.vehicle.model) return null;
  return {
    label: `${highest.vehicle.year} ${highest.vehicle.model.make.name} ${highest.vehicle.model.name}`,
    value: highest.value,
  };
}

function getFastestOwnedVehicle(
  vehicles: Array<{ year: number; model: { name: string; make: { name: string }; spec: { topSpeed: string | null } | null } }>
) {
  const fastest = vehicles
    .map((vehicle) => ({ vehicle, mph: parseMph(vehicle.model.spec?.topSpeed) }))
    .filter((item): item is { vehicle: (typeof vehicles)[number]; mph: number } => item.mph !== null)
    .sort((a, b) => b.mph - a.mph)[0];
  if (!fastest) return null;
  return {
    label: `${fastest.vehicle.year} ${fastest.vehicle.model.make.name} ${fastest.vehicle.model.name}`,
    value: `${fastest.mph} mph`,
  };
}

async function getFastestInventoryCar() {
  const rows = await prisma.listing.findMany({
    where: liveInventoryWhere,
    include: {
      vehicle: {
        include: {
          model: { include: { make: true, spec: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });
  const fastest = rows
    .filter((listing) => listing.vehicle)
    .map((listing) => ({ listing, mph: parseMph(listing.vehicle?.model.spec?.topSpeed) }))
    .filter((item): item is { listing: (typeof rows)[number]; mph: number } => item.mph !== null)
    .sort((a, b) => b.mph - a.mph)[0];
  if (!fastest?.listing.vehicle) return { label: "Performance stats pending", value: "Pending" };
  return {
    label: `${fastest.listing.vehicle.year} ${fastest.listing.vehicle.model.make.name} ${fastest.listing.vehicle.model.name}`,
    value: `${fastest.mph} mph`,
  };
}

async function getLatestUserActivity() {
  const rows = await prisma.vehicle.findMany({
    where: {
      status: "CLAIMED",
      owner: { is: { username: { not: null } } },
      model: { make: { name: { in: [...SUPPORTED_MAKES] } } },
    },
    include: {
      owner: { select: { username: true, name: true } },
      model: { include: { make: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 3,
  });
  const items = rows
    .filter((vehicle) => vehicle.owner?.username)
    .map((vehicle) => ({
      label: vehicle.owner?.name || vehicle.owner?.username || "Member garage",
      detail: `Added ${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
      href: `/garage/${vehicle.owner!.username}`,
    }));
  if (items.length > 0) return items;
  return [
    { label: "Claim a vehicle", detail: "Add a VIN-backed car to your public garage.", href: "/garage" },
    { label: "Save a dream model", detail: "Track listings and prices from your garage.", href: "/inventory" },
    { label: "Host a meet", detail: "Bring the collection layer into real life.", href: "/meets" },
  ];
}

function parseMph(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/(\d{2,3})/);
  return match ? Number(match[1]) : null;
}

function parseCurrency(value: string | null | undefined) {
  if (!value) return 0;
  const compactMatch = value.match(/\$?([\d.]+)\s*([MK])/i);
  if (compactMatch) {
    const base = Number(compactMatch[1]);
    return base * (compactMatch[2].toUpperCase() === "M" ? 1000000 : 1000);
  }
  return Number(value.replace(/[^0-9.]/g, "")) || 0;
}

function buildActivityItems(
  vehicles: Array<{
    vin: string;
    year: number;
    model: { name: string; make: { name: string } };
    modifications: unknown[];
    serviceRecords: unknown[];
    awards: unknown[];
  }>,
  dreamVehicles: HomepageGarageVehicle[]
) {
  const items: Array<{ label: string; detail: string; href: string }> = [];
  for (const vehicle of vehicles.slice(0, 3)) {
    items.push({
      label: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
      detail: `${vehicle.modifications.length} mods · ${vehicle.serviceRecords.length} services · ${vehicle.awards.length} awards`,
      href: `/vehicle/${vehicle.vin}`,
    });
  }
  for (const dream of dreamVehicles.slice(0, Math.max(0, 3 - items.length))) {
    items.push({
      label: dream.label,
      detail: "Saved to Dream Garage",
      href: dream.href,
    });
  }
  return items;
}

function cleanImage(value: string | null | undefined) {
  if (!value || value === "/images/placeholder.jpg" || isNonVehicleImageUrl(value)) return null;
  if (
    /slider-cache|shared\.webp|photos?-coming|coming-soon|ferrari_approved|view_carfax|dealership|our-dealership/i.test(value) ||
    /pictures\.dealer\.com\/[^/]+\/[^/]+\/1234\//i.test(value)
  ) {
    return null;
  }
  return value;
}

function formatCurrency(value: number | null | undefined) {
  if (!value) return "Value pending";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
