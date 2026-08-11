import { auth } from "@/auth";
import { PartsStoreExplorer, type PartsBrandRow, type PartsCatalogNodeRow, type PartsCategoryRow, type PartsStorePartRow } from "@/components/parts/PartsStoreExplorer";
import { isAffiliateTrackingReady } from "@/lib/parts/affiliate-tracking";
import { getPartDetailPath } from "@/lib/parts/routes";
import { auditPerformancePartTrust } from "@/lib/parts/trust";
import { getCatalogNodePlaceholderUrl } from "@/lib/parts/visual-placeholders";
import { prisma } from "@/lib/prisma";

type PartsPageProps = {
  searchParams?: Promise<{ make?: string; model?: string }>;
};

export default async function PartsPage({ searchParams }: PartsPageProps) {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;
  const resolvedSearchParams = (await searchParams) || {};

  const [categories, brands, parts, catalogNodes, garageCars, initialFilter] = await Promise.all([
    prisma.partCategory.findMany({
      where: { active: true },
      include: {
        _count: {
          select: {
            parts: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
      orderBy: [
        { displayOrder: "asc" },
        { name: "asc" },
      ],
    }),
    prisma.partBrand.findMany({
      where: { active: true },
      include: {
        _count: {
          select: {
            parts: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.performancePart.findMany({
      where: { status: "ACTIVE" },
      include: {
        category: true,
        brand: true,
        affiliatePartner: true,
        compatibility: {
          include: {
            make: true,
            model: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [
        { category: { displayOrder: "asc" } },
        { brand: { name: "asc" } },
        { name: "asc" },
      ],
      take: 500,
    }),
    prisma.partCatalogNode.findMany({
      where: {
        active: true,
        placeholderOnly: true,
        categoryId: { not: null },
      },
      orderBy: [
        { category: { displayOrder: "asc" } },
        { name: "asc" },
      ],
      take: 500,
    }),
    getGarageCars(userId),
    getInitialPartsFilter(resolvedSearchParams.make, resolvedSearchParams.model),
  ]);

  const publicParts = parts.filter((part) => auditPerformancePartTrust(part).publicEligible);
  const categoryPartCounts = countBy(publicParts.map((part) => part.categoryId));
  const brandPartCounts = countBy(publicParts.map((part) => part.brandId));

  const categoryRows: PartsCategoryRow[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
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
    websiteUrl: brand.websiteUrl,
    country: brand.country,
    partCount: brandPartCounts.get(brand.id) ?? 0,
  }));

  const partRows: PartsStorePartRow[] = publicParts.map((part) => ({
    id: part.id,
    name: part.name,
    partNumber: part.partNumber,
    detailPath: getPartDetailPath(part),
    description: part.description,
    imageUrl: part.imageUrl,
    sourceUrl: part.sourceUrl,
    status: part.status,
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
    fitmentMakeIds: unique(part.compatibility.map((fitment) => fitment.makeId).filter(Boolean)),
    fitmentModelIds: unique(part.compatibility.map((fitment) => fitment.modelId).filter(Boolean)),
    affiliatePartnerName: part.affiliatePartner?.name ?? null,
    trackingEnabled: isAffiliateTrackingReady(part),
  }));

  const catalogNodeRows: PartsCatalogNodeRow[] = catalogNodes.map((node) => ({
    id: node.id,
    name: node.name,
    slug: node.slug,
    iconUrl: node.iconUrl,
    categoryId: node.categoryId,
  }));

  return (
    <PartsStoreExplorer
      categories={categoryRows}
      brands={brandRows}
      parts={partRows}
      catalogNodes={catalogNodeRows}
      garageCars={garageCars}
      initialMakeId={initialFilter.makeId}
      initialModelId={initialFilter.modelId}
    />
  );
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
  trim: string | null;
  engine: string | null;
}) {
  const makeModel = [partCompatibility.make?.name, partCompatibility.model?.name].filter(Boolean).join(" ");
  const years = formatYearRange(partCompatibility.yearStart, partCompatibility.yearEnd);
  const details = [makeModel || "Universal", years, partCompatibility.trim, partCompatibility.engine].filter(Boolean);
  return details.join(" · ");
}

function formatYearRange(start: number | null, end: number | null) {
  if (start && end) return start === end ? String(start) : `${start}-${end}`;
  if (start) return `${start}+`;
  if (end) return `Through ${end}`;
  return null;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function countBy(values: string[]) {
  return values.reduce((map, value) => {
    map.set(value, (map.get(value) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
}
