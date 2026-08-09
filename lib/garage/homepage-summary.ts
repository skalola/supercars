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
  mostExpensiveHref: string | null;
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
  const [user, ownedRows, dreamRows, inventoryVehicles, inventoryStats, highestHorsepowerCar] = await Promise.all([
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
    getLiveInventoryValueStats(),
    getHighestHorsepowerInventoryCar(),
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
  const featuredVehicles = [...ownedVehicles, ...dreamVehicles].slice(0, 6);

  return {
    username: user.username,
    heroImageUrl: heroVehicle?.imageUrl || null,
    heroVehicleLabel: heroVehicle?.label || "Build your verified garage",
    heroVehicleMeta: heroVehicle?.meta || "Claim a VIN or save a dream car to begin.",
    garageValue: inventoryStats.totalValue || null,
    garageValueLabel: "Live Collection Value",
    totalCars: inventoryStats.totalCars,
    mostExpensiveLabel: inventoryStats.mostExpensive?.label ?? "Most expensive",
    mostExpensiveHref: inventoryStats.mostExpensive?.href ?? null,
    mostExpensiveValue: inventoryStats.mostExpensive?.value ?? null,
    fastestCarLabel: highestHorsepowerCar.label,
    fastestCarValue: highestHorsepowerCar.value,
    ownedVehicles,
    dreamVehicles,
    previousVehicles: [],
    featuredVehicles,
    activityItems: buildActivityItems(ownedRows, dreamVehicles),
  };
}

async function getPublicHomepageSummary(): Promise<HomepageSummary> {
  const [featuredVehicles, valueStats, activityItems] = await Promise.all([
    getLiveInventoryVehicles(12),
    getLiveInventoryValueStats(),
    getLatestUserActivity(),
  ]);

  const highestHorsepowerCar = await getHighestHorsepowerInventoryCar();
  const heroVehicle = featuredVehicles[0] || null;

  return {
    username: null,
    heroImageUrl: heroVehicle?.imageUrl || null,
    heroVehicleLabel: heroVehicle?.label || "Your verified collection starts here",
    heroVehicleMeta: heroVehicle?.meta || "Claim a VIN-backed car or save a dream model.",
    garageValue: valueStats.totalValue || null,
    garageValueLabel: "Live Collection Value",
    totalCars: valueStats.totalCars,
    mostExpensiveLabel: valueStats.mostExpensive?.label ?? "Most expensive",
    mostExpensiveHref: valueStats.mostExpensive?.href ?? null,
    mostExpensiveValue: valueStats.mostExpensive?.value ?? null,
    fastestCarLabel: highestHorsepowerCar.label,
    fastestCarValue: highestHorsepowerCar.value,
    ownedVehicles: [],
    dreamVehicles: featuredVehicles,
    previousVehicles: [],
    featuredVehicles,
    activityItems,
  };
}

async function getLiveInventoryValueStats() {
  const listings = await getVisibleLiveInventoryListings(2000);
  const pricedListings = listings
    .map((listing) => ({
      label: listing.vehicle
        ? `${listing.vehicle.year} ${listing.vehicle.model.make.name} ${listing.vehicle.model.name}`
        : "Most expensive",
      href: listing.vehicle ? `/vehicle/${listing.vehicle.vin}` : null,
      value: listing.askingPrice ?? listing.price ?? 0,
      listing,
    }))
    .filter((listing) => listing.value >= 10000)
    .filter((listing) => isPlausibleHeadlinePrice(listing.listing, listing.value));
  return {
    totalCars: listings.length,
    totalValue: pricedListings.reduce((sum, listing) => sum + listing.value, 0),
    mostExpensive: pricedListings.sort((a, b) => b.value - a.value)[0] ?? null,
  };
}

function isPlausibleHeadlinePrice(
  listing: Awaited<ReturnType<typeof getVisibleLiveInventoryListings>>[number],
  value: number,
) {
  const modelName = listing.vehicle?.model.name ?? "";
  const url = listing.url ?? "";
  const context = `${modelName} ${url}`;
  if (/laferrari|enzo|f40|f50|monza|daytona|sp[0-9]|p1|senna|speedtail|mclaren f1|countach|miura|reventon|sian|centenario/i.test(context)) {
    return true;
  }

  const normalized = context.toLowerCase();
  const familyCaps: Array<[RegExp, number]> = [
    [/f430|360|355|348|328|308/, 550000],
    [/458|california|roma|portofino/, 850000],
    [/488|f8|296/, 950000],
    [/812|sf90|aventador|revuelto/, 1350000],
    [/huracan|gallardo|urus|mp4-12c|570|600lt|650s|720s|750s|artura|gt\b/, 750000],
  ];
  const cap = familyCaps.find(([pattern]) => pattern.test(normalized))?.[1] ?? 1500000;
  return value <= cap;
}

const liveInventoryWhere = {
  status: "ACTIVE",
  validationStatus: "VALID",
  priceStatus: { not: "PRICE_INVALID" },
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
  const listings = await getVisibleLiveInventoryListings(take);

  return listings
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
    .filter((vehicle) => vehicle.imageUrl)
    .slice(0, take);
}

async function getVisibleLiveInventoryListings(take: number) {
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
    .filter((listing) => cleanImage(getVehicleHeroImage(listing.vehicle)) || cleanImage(listing.imageUrl));
}

async function getHighestHorsepowerInventoryCar() {
  const rows = await getVisibleLiveInventoryListings(2000);
  const strongest = rows
    .filter((listing) => listing.vehicle)
    .map((listing) => ({ listing, horsepower: parseHorsepower(listing.vehicle?.model.spec?.horsepower) }))
    .filter((item): item is { listing: (typeof rows)[number]; horsepower: number } => item.horsepower !== null)
    .sort((a, b) => b.horsepower - a.horsepower)[0];
  if (!strongest?.listing.vehicle) return { label: "Horsepower stats pending", value: "Pending" };
  return {
    label: `${strongest.listing.vehicle.year} ${strongest.listing.vehicle.model.make.name} ${strongest.listing.vehicle.model.name}`,
    value: `${strongest.horsepower.toLocaleString()} hp`,
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

function parseHorsepower(value: string | null | undefined) {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
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
