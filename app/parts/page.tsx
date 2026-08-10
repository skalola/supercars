import { PartsStoreExplorer, type PartsBrandRow, type PartsCategoryRow, type PartsStorePartRow } from "@/components/parts/PartsStoreExplorer";
import { isAffiliateTrackingReady } from "@/lib/parts/affiliate-tracking";
import { getPartDetailPath } from "@/lib/parts/routes";
import { prisma } from "@/lib/prisma";

export default async function PartsPage() {
  const [categories, brands, parts] = await Promise.all([
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
  ]);

  const categoryRows: PartsCategoryRow[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    partCount: category._count.parts,
  }));

  const brandRows: PartsBrandRow[] = brands.map((brand) => ({
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    logoUrl: brand.logoUrl,
    websiteUrl: brand.websiteUrl,
    country: brand.country,
    partCount: brand._count.parts,
  }));

  const partRows: PartsStorePartRow[] = parts.map((part) => ({
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

  return <PartsStoreExplorer categories={categoryRows} brands={brandRows} parts={partRows} />;
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
