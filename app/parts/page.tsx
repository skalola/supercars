import { auth } from "@/auth";
import { PartsStoreExplorer, type PartsBrandRow, type PartsCategoryRow, type PartsStorePartRow } from "@/components/parts/PartsStoreExplorer";
import { getPartDetailPath } from "@/lib/parts/routes";
import { getCatalogNodePlaceholderUrl } from "@/lib/parts/visual-placeholders";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";

type PartsPageProps = {
  searchParams?: Promise<{ make?: string; model?: string }>;
};

const PARTS_STORE_PAGE_SIZE = 240;

const publicPartsWhere = {
  status: "ACTIVE",
  sourceUrl: { not: null },
  sourceConfidence: "SOURCE_VERIFIED",
  imageUrl: { not: null },
  compatibility: {
    some: {
      OR: [
        { makeId: { not: null } },
        { modelId: { not: null } },
      ],
    },
  },
} satisfies Prisma.PerformancePartWhereInput;

const storePartSelect = {
  id: true,
  name: true,
  slug: true,
  partNumber: true,
  description: true,
  imageUrl: true,
  retailPriceCents: true,
  estimatedHpGain: true,
  estimatedTorqueGain: true,
  categoryId: true,
  brandId: true,
  category: {
    select: { name: true },
  },
  brand: {
    select: {
      name: true,
      slug: true,
      logoUrl: true,
      logoBackground: true,
      logoNeedsReview: true,
    },
  },
} satisfies Prisma.PerformancePartSelect;

type StorePart = Prisma.PerformancePartGetPayload<{ select: typeof storePartSelect }>;
type StorePartCompatibility = {
  makeId: string | null;
  modelId: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  make: { name: string } | null;
  model: { name: string } | null;
};
type StorePartWithCompatibility = StorePart & {
  compatibility: StorePartCompatibility[];
};

export default async function PartsPage({ searchParams }: PartsPageProps) {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;
  const resolvedSearchParams = (await searchParams) || {};

  const [publicCatalog, garageCars, initialFilter] = await Promise.all([
    getPublicPartsStoreCatalog(),
    getGarageCars(userId),
    getInitialPartsFilter(resolvedSearchParams.make, resolvedSearchParams.model),
  ]);

  return (
    <PartsStoreExplorer
      categories={publicCatalog.categoryRows}
      brands={publicCatalog.brandRows}
      parts={publicCatalog.partRows}
      catalogNodeCount={publicCatalog.catalogNodeCount}
      garageCars={garageCars}
      initialMakeId={initialFilter.makeId}
      initialModelId={initialFilter.modelId}
    />
  );
}

const getPublicPartsStoreCatalog = unstable_cache(
  async () => {
    const [categories, brands, parts, catalogNodeCount] = await Promise.all([
      prisma.partCategory.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          slug: true,
        },
        orderBy: [
          { displayOrder: "asc" },
          { name: "asc" },
        ],
      }),
      prisma.partBrand.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          logoBackground: true,
          logoNeedsReview: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.performancePart.findMany({
        where: publicPartsWhere,
        select: storePartSelect,
        orderBy: [
          { category: { displayOrder: "asc" } },
          { brand: { name: "asc" } },
          { name: "asc" },
        ],
        take: PARTS_STORE_PAGE_SIZE,
      }),
      prisma.partCatalogNode.count({
        where: {
          active: true,
          placeholderOnly: true,
          categoryId: { not: null },
        },
      }),
    ]);

    const partIds = parts.map((part) => part.id);
    const compatibility = partIds.length
      ? await prisma.partCompatibility.findMany({
          where: { partId: { in: partIds } },
          select: {
            partId: true,
            makeId: true,
            modelId: true,
            yearStart: true,
            yearEnd: true,
            make: {
              select: { name: true },
            },
            model: {
              select: { name: true },
            },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const compatibilityByPartId = compatibility.reduce((map, row) => {
      const rows = map.get(row.partId) ?? [];
      rows.push({
        makeId: row.makeId,
        modelId: row.modelId,
        yearStart: row.yearStart,
        yearEnd: row.yearEnd,
        make: row.make,
        model: row.model,
      });
      map.set(row.partId, rows);
      return map;
    }, new Map<string, StorePartCompatibility[]>());
    const partsWithCompatibility: StorePartWithCompatibility[] = parts.map((part) => ({
      ...part,
      compatibility: compatibilityByPartId.get(part.id) ?? [],
    }));
    const [categoryCounts, brandCounts] = await Promise.all([
      prisma.performancePart.groupBy({
        by: ["categoryId"],
        where: publicPartsWhere,
        _count: { id: true },
      }),
      prisma.performancePart.groupBy({
        by: ["brandId"],
        where: publicPartsWhere,
        _count: { id: true },
      }),
    ]);
    const categoryPartCounts = new Map(categoryCounts.map((row) => [row.categoryId, row._count.id]));
    const brandPartCounts = new Map(brandCounts.map((row) => [row.brandId, row._count.id]));

    const categoryRows: PartsCategoryRow[] = categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      iconUrl: getCatalogNodePlaceholderUrl(category.slug, category.slug),
      partCount: categoryPartCounts.get(category.id) ?? 0,
    }));

    const brandRows: PartsBrandRow[] = brands.map((brand) => ({
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      logoUrl: brand.logoUrl,
      logoBackground: brand.logoBackground,
      logoNeedsReview: brand.logoNeedsReview,
      partCount: brandPartCounts.get(brand.id) ?? 0,
    }));

    const partRows: PartsStorePartRow[] = partsWithCompatibility.map(mapStorePartRow);

    return {
      categoryRows,
      brandRows,
      partRows,
      catalogNodeCount,
    };
  },
  ["public-parts-store-catalog-v2"],
  {
    revalidate: 60 * 60,
    tags: ["parts-catalog"],
  },
);

function mapStorePartRow(part: StorePartWithCompatibility): PartsStorePartRow {
  return {
    id: part.id,
    name: part.name,
    partNumber: part.partNumber,
    detailPath: getPartDetailPath(part),
    description: part.description,
    imageUrl: part.imageUrl,
    priceLabel: formatCents(part.retailPriceCents),
    hpGainLabel: part.estimatedHpGain === null ? null : `+${part.estimatedHpGain.toLocaleString()} hp`,
    torqueGainLabel: part.estimatedTorqueGain === null ? null : `+${part.estimatedTorqueGain.toLocaleString()} lb-ft`,
    categoryId: part.categoryId,
    categoryName: part.category.name,
    brandId: part.brandId,
    brandName: part.brand.name,
    brandLogoUrl: part.brand.logoUrl,
    brandLogoBackground: part.brand.logoBackground,
    brandLogoNeedsReview: part.brand.logoNeedsReview,
    compatibility: part.compatibility.map(formatCompatibility),
    fitments: part.compatibility.map((fitment) => ({
      makeId: fitment.makeId,
      makeName: fitment.make?.name ?? null,
      modelId: fitment.modelId,
      modelName: fitment.model?.name ?? null,
    })),
  };
}

async function getInitialPartsFilter(makeSlug?: string, modelSlug?: string) {
  const normalizedMakeSlug = makeSlug?.trim();
  const normalizedModelSlug = modelSlug?.trim();

  if (normalizedModelSlug) {
    const model = await prisma.model.findFirst({
      where: {
        slug: normalizedModelSlug,
        ...(normalizedMakeSlug ? { make: { slug: normalizedMakeSlug } } : {}),
      },
      select: {
        id: true,
        makeId: true,
      },
    });

    if (model) {
      return {
        makeId: model.makeId,
        modelId: model.id,
      };
    }
  }

  if (normalizedMakeSlug) {
    const make = await prisma.make.findUnique({
      where: { slug: normalizedMakeSlug },
      select: { id: true },
    });

    if (make) {
      return {
        makeId: make.id,
        modelId: "",
      };
    }
  }

  return {
    makeId: "",
    modelId: "",
  };
}

async function getGarageCars(userId: string | undefined) {
  if (!userId) return [];

  const [claimedVehicles, savedVehicles] = await Promise.all([
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
        modelId: true,
        photos: {
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
          select: { filePath: true },
          take: 1,
        },
        images: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: { url: true },
          take: 1,
        },
        model: {
          select: {
            name: true,
            makeId: true,
            make: {
              select: { name: true },
            },
            images: {
              orderBy: [{ type: "asc" }, { createdAt: "asc" }],
              select: { url: true },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ year: "desc" }, { createdAt: "desc" }],
      take: 25,
    }),
    prisma.garageItem.findMany({
      where: { userId },
      select: {
        id: true,
        modelId: true,
        model: {
          select: {
            name: true,
            makeId: true,
            make: {
              select: { name: true },
            },
            images: {
              orderBy: [{ type: "asc" }, { createdAt: "asc" }],
              select: { url: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  const claimedModelIds = new Set(claimedVehicles.map((vehicle) => vehicle.modelId));
  const claimedRows = claimedVehicles.map((vehicle) => ({
    id: `claimed:${vehicle.id}`,
    label: [
      vehicle.year,
      vehicle.model.make.name,
      vehicle.model.name,
      vehicle.trim,
    ].filter(Boolean).join(" "),
    detail: vehicle.vin ? `VIN ${vehicle.vin.slice(-6)}` : "Claimed",
    makeId: vehicle.model.makeId,
    modelId: vehicle.modelId,
    imageUrl: vehicle.photos[0]?.filePath || vehicle.images[0]?.url || vehicle.model.images[0]?.url || null,
  }));
  const savedRows = savedVehicles
    .filter((item) => !claimedModelIds.has(item.modelId))
    .map((item) => ({
      id: `saved:${item.id}`,
      label: `${item.model.make.name} ${item.model.name}`,
      detail: "Dream Garage",
      makeId: item.model.makeId,
      modelId: item.modelId,
      imageUrl: item.model.images[0]?.url || null,
    }));

  return [...claimedRows, ...savedRows].sort((a, b) => a.label.localeCompare(b.label));
}

function formatCents(value: number | null) {
  if (value === null) return "Price pending";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function formatCompatibility(partCompatibility: {
  make: { name: string } | null;
  model: { name: string } | null;
  yearStart: number | null;
  yearEnd: number | null;
}) {
  const makeModel = [partCompatibility.make?.name, partCompatibility.model?.name].filter(Boolean).join(" ");
  const years = formatYearRange(partCompatibility.yearStart, partCompatibility.yearEnd);
  const details = [makeModel || "Universal", years].filter(Boolean);
  return details.join(" · ");
}

function formatYearRange(start: number | null, end: number | null) {
  if (start && end) return start === end ? String(start) : `${start}-${end}`;
  if (start) return `${start}+`;
  if (end) return `Through ${end}`;
  return null;
}
