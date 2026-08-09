import { getNextMaintenanceRecommendation } from "@/lib/maintenance/recommendations";
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
  nextServiceLabel: string;
  nextServiceDetail: string;
  upcomingMeetLabel: string;
  upcomingMeetDetail: string;
  passportLabel: string;
  passportDetail: string;
  ownedVehicles: HomepageGarageVehicle[];
  dreamVehicles: HomepageGarageVehicle[];
  previousVehicles: HomepageGarageVehicle[];
  featuredVehicles: HomepageGarageVehicle[];
  activityItems: Array<{ label: string; detail: string; href: string }>;
};

type SessionUser = {
  id?: string | null;
};

type MaintenanceVehicleInput = {
  mileage: number | null;
  model: {
    maintenanceRules: Array<{
      id: string;
      serviceName: string;
      description: string | null;
      intervalMiles: number | null;
      intervalMonths: number | null;
      priority: string;
    }>;
  };
  serviceRecords: Array<{
    mileage: number | null;
    serviceDate: Date;
    description: string | null;
  }>;
};

export async function getHomepageSummary(user: SessionUser | undefined | null): Promise<HomepageSummary> {
  if (user?.id) {
    const signedInSummary = await getSignedInHomepageSummary(user.id);
    if (signedInSummary) return signedInSummary;
  }

  return getPublicHomepageSummary();
}

async function getSignedInHomepageSummary(userId: string): Promise<HomepageSummary | null> {
  const [user, ownedRows, dreamRows] = await Promise.all([
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
        model: { include: { make: true, images: true, maintenanceRules: true } },
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

  const dreamVehicles = dreamRows
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

  const heroVehicle = ownedVehicles[0] || dreamVehicles[0] || null;
  const garageValue = calculateOwnedValue(ownedRows);
  const nextService = getNextServiceCopy(ownedRows[0] ?? null);
  const featuredVehicles = [...ownedVehicles, ...dreamVehicles].slice(0, 6);

  return {
    username: user.username,
    heroImageUrl: heroVehicle?.imageUrl || null,
    heroVehicleLabel: heroVehicle?.label || "Build your verified garage",
    heroVehicleMeta: heroVehicle?.meta || "Claim a VIN or save a dream car to begin.",
    garageValue,
    garageValueLabel: ownedVehicles.length > 0 ? "Garage Value" : "Dream Value",
    nextServiceLabel: nextService.label,
    nextServiceDetail: nextService.detail,
    upcomingMeetLabel: "Meets",
    upcomingMeetDetail: "Meet system coming next",
    passportLabel: ownedVehicles.length > 0 ? "Verified" : "Ready",
    passportDetail: ownedVehicles.length > 0 ? `${ownedVehicles.length} passport${ownedVehicles.length === 1 ? "" : "s"}` : "VIN-first profiles",
    ownedVehicles,
    dreamVehicles,
    previousVehicles: [],
    featuredVehicles,
    activityItems: buildActivityItems(ownedRows, dreamVehicles),
  };
}

async function getPublicHomepageSummary(): Promise<HomepageSummary> {
  const listings = await prisma.listing.findMany({
    where: {
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
    },
    include: {
      vehicle: {
        include: {
          photos: true,
          images: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
          model: { include: { make: true, images: true } },
        },
      },
      model: { include: { make: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 12,
  });

  const featuredVehicles = listings
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
    .filter((vehicle) => vehicle.imageUrl)
    .slice(0, 6);

  const totalValue = listings.reduce((sum, listing) => sum + (listing.askingPrice ?? listing.price ?? 0), 0);
  const heroVehicle = featuredVehicles[0] || null;

  return {
    username: null,
    heroImageUrl: heroVehicle?.imageUrl || null,
    heroVehicleLabel: heroVehicle?.label || "Your verified collection starts here",
    heroVehicleMeta: heroVehicle?.meta || "Claim a VIN-backed passport or save a dream model.",
    garageValue: totalValue || null,
    garageValueLabel: "Live Collection Value",
    nextServiceLabel: "Next Service",
    nextServiceDetail: "Track by VIN",
    upcomingMeetLabel: "Meets",
    upcomingMeetDetail: "Coming soon",
    passportLabel: "VIN-first",
    passportDetail: "Persistent car identity",
    ownedVehicles: [],
    dreamVehicles: featuredVehicles,
    previousVehicles: [],
    featuredVehicles,
    activityItems: [
      { label: "Claim a vehicle passport", detail: "Turn a VIN into a persistent ownership profile.", href: "/garage" },
      { label: "Save a dream model", detail: "Track listings and prices from your garage.", href: "/make/ferrari" },
      { label: "Use ownership services", detail: "Service, transport, insurance, and sale tools stay attached to the car.", href: "/inventory" },
    ],
  };
}

function getNextServiceCopy(vehicle: MaintenanceVehicleInput | null) {
  if (!vehicle) {
    return { label: "Next Service", detail: "Add a car to track" };
  }

  const next = getNextMaintenanceRecommendation({
    currentMileage: vehicle.mileage,
    rules: vehicle.model.maintenanceRules,
    serviceRecords: vehicle.serviceRecords,
  });

  if (!next) return { label: "Next Service", detail: "Mileage pending" };
  return {
    label: next.serviceName,
    detail: next.remainingMiles !== null ? `${Math.max(0, next.remainingMiles).toLocaleString()} mi remaining` : next.dueText,
  };
}

function calculateOwnedValue(
  vehicles: Array<{ listings: Array<{ askingPrice: number | null; price: number | null }> }>
) {
  const values = vehicles
    .map((vehicle) => vehicle.listings[0]?.askingPrice ?? vehicle.listings[0]?.price ?? null)
    .filter((value): value is number => Boolean(value && value >= 10000));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
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
