import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
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
  if (user?.id) {
    const signedInSummary = await getSignedInHomepageSummary(user.id);
    if (signedInSummary) return signedInSummary;
  }

  return getPublicHomepageSummary();
}

async function getSignedInHomepageSummary(userId: string): Promise<HomepageSummary | null> {
  const [user, ownedRows, dreamRows, inventoryVehicles, inventoryStats, highestHorsepowerCar, featuredGarages] = await Promise.all([
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
    getLiveInventoryVehicles(12),
    getLiveInventoryValueStats(),
    getHighestHorsepowerInventoryCar(),
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
    fastestCarHref: highestHorsepowerCar.href,
    fastestCarValue: highestHorsepowerCar.value,
    ownedVehicles,
    dreamVehicles,
    previousVehicles: [],
    featuredVehicles,
    featuredGarages,
    activityItems: buildActivityItems(ownedRows, dreamVehicles),
  };
}

async function getPublicHomepageSummary(): Promise<HomepageSummary> {
  const [featuredVehicles, valueStats, activityItems, featuredGarages] = await Promise.all([
    getLiveInventoryVehicles(12),
    getLiveInventoryValueStats(),
    getPublicLatestUserActivity(),
    getPublicFeaturedGarages(),
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
    fastestCarHref: highestHorsepowerCar.href,
    fastestCarValue: highestHorsepowerCar.value,
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
              marketSummary: {
                select: {
                  averageAskingPrice: true,
                },
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
        meta: vehicle.listings[0] ? formatCurrency(vehicle.listings[0].askingPrice ?? vehicle.listings[0].price) : "Claimed",
      }));

      const ownedModelIds = new Set(user.vehicles.map((vehicle) => vehicle.modelId));
      const savedVehicles: HomepageGarageVehicle[] = user.garageItems
        .filter((item) => !ownedModelIds.has(item.modelId))
        .map((item) => {
          const averageAskingPrice = item.model.marketSummary?.averageAskingPrice ?? null;
          return {
            id: item.id,
            label: `${item.model.make.name} ${item.model.name}`,
            eyebrow: "Dream Garage",
            href: `/make/${item.model.make.slug}/${item.model.slug}`,
            imageUrl: cleanImage(item.model.images[0]?.url || null),
            status: "DREAM" as const,
            meta: averageAskingPrice ? formatCurrency(averageAskingPrice) : item.model.years || "Saved",
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
  { revalidate: 3_600, tags: ["garage-summary", "inventory-summary"] },
);

const getLiveInventoryValueStats = unstable_cache(
  async () => {
  const [totalCars, askingPriceTotal, fallbackPriceTotal, topAskingListings, topFallbackListings] = await Promise.all([
    prisma.listing.count({ where: liveInventoryWhere }),
    prisma.listing.aggregate({
      where: liveInventoryWhere,
      _sum: { askingPrice: true },
    }),
    prisma.listing.aggregate({
      where: {
        AND: [
          liveInventoryWhere,
          { askingPrice: null },
        ],
      },
      _sum: { price: true },
    }),
    getTopPricedInventoryCandidates("askingPrice"),
    getTopPricedInventoryCandidates("price"),
  ]);

  const pricedListings = [...topAskingListings, ...topFallbackListings]
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
    totalCars,
    totalValue: (askingPriceTotal._sum.askingPrice || 0) + (fallbackPriceTotal._sum.price || 0),
    mostExpensive: pricedListings.sort((a, b) => b.value - a.value)[0] ?? null,
  };
  },
  ["homepage-live-inventory-value-stats-v2"],
  { revalidate: 900, tags: ["inventory-summary"] }
);

function isPlausibleHeadlinePrice(
  listing: Awaited<ReturnType<typeof getTopPricedInventoryCandidates>>[number],
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
  const listings = await getVisibleInventoryCardListings(take);

  return listings
    .map((listing) => {
      const vehicle = listing.vehicle!;
      return {
        id: listing.id,
        label: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
        eyebrow: listing.dealerName || vehicle.model.make.name,
        href: `/vehicle/${vehicle.vin}`,
        imageUrl: cleanImage(listing.imageUrl) || cleanImage(vehicle.model.images[0]?.url),
        status: "DREAM" as const,
        meta: formatCurrency(listing.askingPrice ?? listing.price),
      };
    })
    .filter((vehicle) => vehicle.imageUrl)
    .slice(0, take);
}

const getVisibleInventoryCardListings = unstable_cache(
  async (take: number) => {
  return prisma.listing.findMany({
    where: {
      ...liveInventoryWhere,
      imageUrl: { not: null },
    },
    select: {
      id: true,
      dealerName: true,
      imageUrl: true,
      askingPrice: true,
      price: true,
      vehicle: {
        select: {
          vin: true,
          year: true,
          model: {
            select: {
              name: true,
              slug: true,
              make: { select: { name: true, slug: true } },
              images: {
                select: { url: true, type: true },
                orderBy: [{ type: "asc" }, { createdAt: "asc" }],
                take: 1,
              },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take,
  });
  },
  ["homepage-visible-inventory-cards-v1"],
  { revalidate: 600, tags: ["inventory-summary"] }
);

async function getTopPricedInventoryCandidates(priceField: "askingPrice" | "price") {
  return prisma.listing.findMany({
    where: {
      AND: [
        liveInventoryWhere,
        priceField === "price" ? { askingPrice: null } : {},
      ],
    },
    select: {
      id: true,
      url: true,
      askingPrice: true,
      price: true,
      vehicle: {
        select: {
          vin: true,
          year: true,
          model: {
            select: {
              name: true,
              make: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { [priceField]: "desc" },
    take: 40,
  });
}

const getHighestHorsepowerInventoryCar = unstable_cache(
  async () => {
  const rows = await prisma.$queryRaw<Array<{
    vin: string;
    year: number;
    makeName: string;
    modelName: string;
    horsepower: Prisma.Decimal | number | null;
  }>>`
    SELECT
      v."vin",
      v."year",
      make."name" AS "makeName",
      model."name" AS "modelName",
      NULLIF(regexp_replace(spec."horsepower", '[^0-9.]', '', 'g'), '')::numeric AS "horsepower"
    FROM "Listing" listing
    LEFT JOIN "MarketSource" source ON source."id" = listing."sourceId"
    INNER JOIN "Vehicle" v ON v."id" = listing."vehicleId"
    INNER JOIN "Model" model ON model."id" = v."modelId"
    INNER JOIN "Make" make ON make."id" = model."makeId"
    INNER JOIN "ModelSpec" spec ON spec."modelId" = model."id"
    WHERE listing."status" = 'ACTIVE'
      AND listing."validationStatus" = 'VALID'
      AND listing."priceStatus" IS DISTINCT FROM 'PRICE_INVALID'
      AND v."inventoryStatus" IN ('ACTIVE', 'VALID', 'WARNING')
      AND make."name" IN (${Prisma.join(SUPPORTED_MAKES)})
      AND COALESCE(listing."askingPrice", listing."price", 0) >= 10000
      AND (source."type" IS NULL OR source."type" <> 'AUCTION')
      AND (listing."url" IS NULL OR listing."url" NOT ILIKE '%bringatrailer.com%')
    ORDER BY "horsepower" DESC NULLS LAST
    LIMIT 1
  `;
  const strongest = rows[0];
  const horsepower =
    typeof strongest?.horsepower === "number" ? strongest.horsepower : strongest?.horsepower?.toNumber() ?? null;
  if (!strongest || horsepower === null) return { label: "Horsepower stats pending", href: null, value: "Pending" };
  return {
    label: `${strongest.year} ${strongest.makeName} ${strongest.modelName}`,
    href: `/vehicle/${strongest.vin}`,
    value: `${Math.round(horsepower).toLocaleString()} hp`,
  };
  },
  ["homepage-highest-horsepower-inventory-v2"],
  { revalidate: 3_600, tags: ["inventory-summary"] }
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
    { label: "Save a dream model", detail: "Track listings and prices from your garage.", href: "/inventory" },
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

function formatCurrency(value: number | null | undefined) {
  if (!value) return "Value pending";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
