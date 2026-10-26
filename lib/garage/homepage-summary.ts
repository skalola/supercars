import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SUPPORTED_MAKES } from "@/lib/supported-makes";
import {
  getVehicleHeroImage,
  isNonVehicleImageUrl,
} from "@/lib/vehicle-images";

export type HomepageGarageVehicle = {
  id: string;
  label: string;
  eyebrow: string;
  href: string;
  imageUrl: string | null;
  status: "OWNED" | "DREAM" | "PREVIOUS";
  meta: string;
};

export type HomepageFeaturedGarage = {
  id: string;
  username: string;
  displayName: string;
  href: string;
  topCar: HomepageGarageVehicle;
  carouselVehicles: HomepageGarageVehicle[];
  totalCars: number;
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
  fastestCarHref: string | null;
  fastestCarValue: string;
  ownedVehicles: HomepageGarageVehicle[];
  dreamVehicles: HomepageGarageVehicle[];
  previousVehicles: HomepageGarageVehicle[];
  featuredVehicles: HomepageGarageVehicle[];
  featuredGarages: HomepageFeaturedGarage[];
  activityItems: Array<{ label: string; detail: string; href: string }>;
};

type SessionUser = {
  id?: string | null;
};

export async function getHomepageSummary(user: SessionUser | undefined | null): Promise<HomepageSummary> {
  try {
    if (user?.id) {
      const signedInSummary = await getSignedInHomepageSummary(user.id);
      if (signedInSummary) return signedInSummary;
    }

    return await getPublicHomepageSummary();
  } catch (error) {
    console.error("[homepage] Database summary unavailable; rendering ownership fallback.", error);
    return getHomepageFallback();
  }
}

function getHomepageFallback(): HomepageSummary {
  return {
    username: null,
    heroImageUrl: null,
    heroVehicleLabel: "Your verified collection starts here",
    heroVehicleMeta: "Claim a VIN-backed car or save a dream model.",
    garageValue: null,
    garageValueLabel: "Collection Value",
    totalCars: 0,
    mostExpensiveLabel: "Build your garage",
    mostExpensiveHref: "/garage",
    mostExpensiveValue: null,
    fastestCarLabel: "Claim a car to compare performance",
    fastestCarHref: "/garage",
    fastestCarValue: "Pending",
    ownedVehicles: [],
    dreamVehicles: [],
    previousVehicles: [],
    featuredVehicles: [],
    featuredGarages: [],
    activityItems: [
      { label: "Claim a vehicle", detail: "Add a VIN-backed car to your public garage.", href: "/garage" },
      { label: "Explore models", detail: "Find cars to add to your dream garage.", href: "/makes" },
      { label: "Host a meet", detail: "Bring the ownership community together.", href: "/meets" },
    ],
  };
}

async function getSignedInHomepageSummary(userId: string): Promise<HomepageSummary | null> {
  const [user, ownedRows, dreamRows, featuredGarages] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    }),
    prisma.vehicle.findMany({
      where: {
        ownerId: userId,
        status: "CLAIMED",
      },
      select: {
        id: true,
        vin: true,
        year: true,
        trim: true,
        mileage: true,
        modelId: true,
        model: {
          select: {
            name: true,
            make: { select: { name: true } },
            images: {
              select: { url: true, type: true },
              orderBy: [{ type: "asc" }, { createdAt: "asc" }],
              take: 1,
            },
          },
        },
        photos: {
          select: { filePath: true, isHero: true },
          orderBy: [{ isHero: "desc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
          take: 1,
        },
        images: {
          select: { url: true, isPrimary: true, validationStatus: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 2,
        },
        _count: {
          select: {
            serviceRecords: true,
            modifications: true,
            awards: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.garageItem.findMany({
      where: { userId },
      select: {
        id: true,
        modelId: true,
        model: {
          select: {
            name: true,
            slug: true,
            years: true,
            make: { select: { name: true, slug: true } },
            images: {
              select: { url: true, type: true },
              orderBy: [{ type: "asc" }, { createdAt: "asc" }],
              take: 1,
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    getPublicFeaturedGarages(),
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
  const dreamVehicles = savedDreamVehicles.slice(0, 12);

  const heroVehicle = ownedVehicles[0] || dreamVehicles[0] || null;
  const featuredVehicles = [...ownedVehicles, ...dreamVehicles].slice(0, 6);

  return {
    username: user.username,
    heroImageUrl: heroVehicle?.imageUrl || null,
    heroVehicleLabel: heroVehicle?.label || "Build your verified garage",
    heroVehicleMeta: heroVehicle?.meta || "Claim a VIN or save a dream car to begin.",
    garageValue: null,
    garageValueLabel: "Collection Value",
    totalCars: ownedVehicles.length,
    mostExpensiveLabel: "Add vehicle values in your passport",
    mostExpensiveHref: "/garage",
    mostExpensiveValue: null,
    fastestCarLabel: "Vehicle performance data",
    fastestCarHref: ownedVehicles[0]?.href ?? null,
    fastestCarValue: "In garage",
    ownedVehicles,
    dreamVehicles,
    previousVehicles: [],
    featuredVehicles,
    featuredGarages,
    activityItems: buildActivityItems(ownedRows, dreamVehicles),
  };
}

async function getPublicHomepageSummary(): Promise<HomepageSummary> {
  const [activityItems, featuredGarages] = await Promise.all([
    getPublicLatestUserActivity(),
    getPublicFeaturedGarages(),
  ]);
  const featuredVehicles: HomepageGarageVehicle[] = [];

  return {
    username: null,
    heroImageUrl: null,
    heroVehicleLabel: "Your verified collection starts here",
    heroVehicleMeta: "Claim a VIN-backed car or save a dream model.",
    garageValue: null,
    garageValueLabel: "Collection Value",
    totalCars: 0,
    mostExpensiveLabel: "Build your garage",
    mostExpensiveHref: "/garage",
    mostExpensiveValue: null,
    fastestCarLabel: "Claim a car to compare performance",
    fastestCarHref: "/garage",
    fastestCarValue: "Pending",
    ownedVehicles: [],
    dreamVehicles: featuredVehicles,
    previousVehicles: [],
    featuredVehicles,
    featuredGarages,
    activityItems,
  };
}

async function getFeaturedGarages(take: number): Promise<HomepageFeaturedGarage[]> {
  const users = await prisma.user.findMany({
    where: {
      username: { not: null },
      OR: [
        {
          vehicles: {
            some: {
              status: "CLAIMED",
            },
          },
        },
        {
          garageItems: {
            some: {},
          },
        },
      ],
    },
    select: {
      id: true,
      username: true,
      name: true,
      vehicles: {
        where: {
          status: "CLAIMED",
        },
        select: {
          id: true,
          vin: true,
          year: true,
          modelId: true,
          model: {
            select: {
              name: true,
              make: { select: { name: true } },
              images: {
                select: { url: true, type: true },
                orderBy: [{ type: "asc" }, { createdAt: "asc" }],
                take: 1,
              },
            },
          },
          photos: {
            select: { filePath: true, isHero: true },
            orderBy: [{ isHero: "desc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
            take: 1,
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 6,
      },
      garageItems: {
        select: {
          id: true,
          modelId: true,
          model: {
            select: {
              name: true,
              slug: true,
              years: true,
              make: { select: { name: true, slug: true } },
              images: {
                select: { url: true, type: true },
                orderBy: [{ type: "asc" }, { createdAt: "asc" }],
                take: 1,
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 6,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: take * 3,
  });

  return users
    .map((user) => {
      const ownedVehicles: HomepageGarageVehicle[] = user.vehicles.map((vehicle) => ({
        id: vehicle.id,
        label: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
        eyebrow: vehicle.model.make.name,
        href: `/vehicle/${vehicle.vin}`,
        imageUrl: cleanImage(vehicle.photos[0]?.filePath || vehicle.model.images[0]?.url || null),
        status: "OWNED" as const,
        meta: "Claimed",
      }));

      const ownedModelIds = new Set(user.vehicles.map((vehicle) => vehicle.modelId));
      const savedVehicles: HomepageGarageVehicle[] = user.garageItems
        .filter((item) => !ownedModelIds.has(item.modelId))
        .map((item) => {
          return {
            id: item.id,
            label: `${item.model.make.name} ${item.model.name}`,
            eyebrow: "Dream Garage",
            href: `/make/${item.model.make.slug}/${item.model.slug}`,
            imageUrl: cleanImage(item.model.images[0]?.url || null),
            status: "DREAM" as const,
            meta: item.model.years || "Saved",
          };
        });

      const carouselVehicles = [...ownedVehicles, ...savedVehicles].filter((vehicle) => vehicle.imageUrl);
      const topCar = carouselVehicles[0];
      if (!user.username || !topCar) return null;

      return {
        id: user.id,
        username: user.username,
        displayName: user.name || `@${user.username}`,
        href: `/garage/${user.username}`,
        topCar,
        carouselVehicles,
        totalCars: ownedVehicles.length + savedVehicles.length,
      };
    })
    .filter((garage): garage is HomepageFeaturedGarage => Boolean(garage))
    .slice(0, take);
}

const getPublicFeaturedGarages = unstable_cache(
  () => getFeaturedGarages(3),
  ["homepage-featured-garages-v1"],
  { revalidate: 3_600, tags: ["garage-summary"] },
);

async function getLatestUserActivity() {
  const rows = await prisma.vehicle.findMany({
    where: {
      status: "CLAIMED",
      owner: { is: { username: { not: null } } },
      model: { make: { name: { in: [...SUPPORTED_MAKES] } } },
    },
    select: {
      vin: true,
      year: true,
      owner: { select: { username: true, name: true } },
      model: { select: { name: true, make: { select: { name: true } } } },
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
    { label: "Save a dream model", detail: "Build a collection around the cars you love.", href: "/makes" },
    { label: "Host a meet", detail: "Bring the collection layer into real life.", href: "/meets" },
  ];
}

const getPublicLatestUserActivity = unstable_cache(
  getLatestUserActivity,
  ["homepage-latest-user-activity-v1"],
  { revalidate: 900, tags: ["garage-summary"] },
);

function buildActivityItems(
  vehicles: Array<{
    vin: string;
    year: number;
    model: { name: string; make: { name: string } };
    _count: {
      modifications: number;
      serviceRecords: number;
      awards: number;
    };
  }>,
  dreamVehicles: HomepageGarageVehicle[]
) {
  const items: Array<{ label: string; detail: string; href: string }> = [];
  for (const vehicle of vehicles.slice(0, 3)) {
    items.push({
      label: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
      detail: `${vehicle._count.modifications} mods · ${vehicle._count.serviceRecords} services · ${vehicle._count.awards} awards`,
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
