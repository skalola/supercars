import { Prisma } from "@prisma/client";
import type {
  PartsBrandRow,
  PartsCategoryRow,
  PartsStorePartRow,
} from "@/components/parts/PartsStoreExplorer";
import { getPartDetailPath } from "@/lib/parts/routes";
import { getCatalogNodePlaceholderUrl } from "@/lib/parts/visual-placeholders";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

export const PARTS_STORE_PAGE_SIZE = 24;

export type PartsStoreFilters = {
  categoryId?: string;
  brandId?: string;
  makeId?: string;
  modelId?: string;
  search?: string;
  page?: number;
};

export type PartsStorePage = {
  parts: PartsStorePartRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  categoryCounts: Record<string, number>;
  brandCounts: Record<string, number>;
};

export const publicPartsWhere = {
  status: "ACTIVE",
  sourceUrl: { not: null },
  sourceConfidence: "SOURCE_VERIFIED",
  imageUrl: { not: null },
  compatibility: {
    some: {
      OR: [{ makeId: { not: null } }, { modelId: { not: null } }],
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
  category: { select: { name: true } },
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

type StoreFitmentOption = {
  makeId: string | null;
  makeName: string | null;
  modelId: string | null;
  modelName: string | null;
  modelMakeId: string | null;
};

type StoreCompatibilityRow = {
  partId: string;
  makeId: string | null;
  modelId: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  makeName: string | null;
  modelName: string | null;
};

export async function getPublicPartsStoreShell() {
  const [categories, brands, fitments, catalogNodeCount] = await Promise.all([
    prisma.partCategory.findMany({
      where: { active: true },
      select: { id: true, name: true, slug: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
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
    getPublicFitmentOptions(),
    prisma.partCatalogNode.count({
      where: { active: true, placeholderOnly: true, categoryId: { not: null } },
    }),
  ]);

  const categoryRows: PartsCategoryRow[] = categories.map((category) => ({
    ...category,
    iconUrl: getCatalogNodePlaceholderUrl(category.slug, category.slug),
    partCount: 0,
  }));
  const brandRows: PartsBrandRow[] = brands.map((brand) => ({ ...brand, partCount: 0 }));
  const makeMap = new Map<string, { id: string; name: string }>();
  const modelMap = new Map<string, { id: string; name: string; makeId: string }>();

  for (const fitment of fitments) {
    const effectiveMakeId = fitment.makeId ?? fitment.modelMakeId;
    if (effectiveMakeId && fitment.makeName) {
      makeMap.set(effectiveMakeId, { id: effectiveMakeId, name: fitment.makeName });
    }
    if (fitment.modelId && fitment.modelName && fitment.modelMakeId) {
      modelMap.set(fitment.modelId, {
        id: fitment.modelId,
        name: fitment.modelName,
        makeId: fitment.modelMakeId,
      });
    }
  }

  return {
    categoryRows,
    brandRows,
    fitmentMakes: [...makeMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    fitmentModels: [...modelMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    catalogNodeCount,
  };
}

export async function queryPublicPartsStore(filters: PartsStoreFilters): Promise<PartsStorePage> {
  const normalized = normalizePartsStoreFilters(filters);
  if (!normalized.search && isCacheablePartsFilter(normalized)) {
    return queryPublicPartsStoreCached(
      normalized.categoryId || "",
      normalized.brandId || "",
      normalized.makeId || "",
      normalized.modelId || "",
      normalized.page || 1,
    );
  }

  return queryPublicPartsStoreUncached(normalized);
}

const queryPublicPartsStoreCached = unstable_cache(
  (
    categoryId: string,
    brandId: string,
    makeId: string,
    modelId: string,
    page: number,
  ) => queryPublicPartsStoreUncached({
    categoryId: categoryId || undefined,
    brandId: brandId || undefined,
    makeId: makeId || undefined,
    modelId: modelId || undefined,
    page,
  }),
  ["public-parts-store-page-v1"],
  { revalidate: 60 * 60, tags: ["parts-catalog"] },
);

async function queryPublicPartsStoreUncached(filters: PartsStoreFilters): Promise<PartsStorePage> {
  const page = Math.max(1, Math.floor(filters.page || 1));
  const facetWhere = buildPartsWhere({ ...filters, categoryId: undefined, brandId: undefined });
  const categoryWhere = buildPartsWhere({ ...filters, brandId: undefined });
  const resultWhere = buildPartsWhere(filters);

  const [parts, total, categoryCounts, brandCounts] = await Promise.all([
    prisma.performancePart.findMany({
      where: resultWhere,
      select: storePartSelect,
      orderBy: [
        { category: { displayOrder: "asc" } },
        { brand: { name: "asc" } },
        { name: "asc" },
      ],
      skip: (page - 1) * PARTS_STORE_PAGE_SIZE,
      take: PARTS_STORE_PAGE_SIZE,
    }),
    prisma.performancePart.count({ where: resultWhere }),
    prisma.performancePart.groupBy({
      by: ["categoryId"],
      where: facetWhere,
      _count: { id: true },
    }),
    prisma.performancePart.groupBy({
      by: ["brandId"],
      where: categoryWhere,
      _count: { id: true },
    }),
  ]);

  const compatibility = await getCompatibility(parts.map((part) => part.id));
  const compatibilityByPartId = new Map<string, StorePartCompatibility[]>();
  for (const row of compatibility) {
    const rows = compatibilityByPartId.get(row.partId) ?? [];
    rows.push(row);
    compatibilityByPartId.set(row.partId, rows);
  }

  const totalPages = Math.max(1, Math.ceil(total / PARTS_STORE_PAGE_SIZE));
  return {
    parts: parts.map((part) => mapStorePartRow(part, compatibilityByPartId.get(part.id) ?? [])),
    total,
    page: Math.min(page, totalPages),
    pageSize: PARTS_STORE_PAGE_SIZE,
    totalPages,
    categoryCounts: Object.fromEntries(categoryCounts.map((row) => [row.categoryId, row._count.id])),
    brandCounts: Object.fromEntries(brandCounts.map((row) => [row.brandId, row._count.id])),
  };
}

function normalizePartsStoreFilters(filters: PartsStoreFilters): PartsStoreFilters {
  return {
    categoryId: filters.categoryId?.trim() || undefined,
    brandId: filters.brandId?.trim() || undefined,
    makeId: filters.makeId?.trim() || undefined,
    modelId: filters.modelId?.trim() || undefined,
    search: filters.search?.trim().slice(0, 80) || undefined,
    page: Math.min(100, Math.max(1, Math.floor(filters.page || 1))),
  };
}

function isCacheablePartsFilter(filters: PartsStoreFilters) {
  return [filters.categoryId, filters.brandId, filters.makeId, filters.modelId]
    .filter((value): value is string => Boolean(value))
    .every((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function buildPartsWhere(filters: PartsStoreFilters): Prisma.PerformancePartWhereInput {
  const search = filters.search?.trim().slice(0, 80);
  const fitment = filters.modelId
    ? {
        some: {
          OR: [
            { modelId: filters.modelId },
            ...(filters.makeId ? [{ modelId: null, makeId: filters.makeId }] : []),
          ],
        },
      }
    : filters.makeId
      ? { some: { makeId: filters.makeId } }
      : undefined;

  return {
    AND: [
      publicPartsWhere,
      filters.categoryId ? { categoryId: filters.categoryId } : {},
      filters.brandId ? { brandId: filters.brandId } : {},
      fitment ? { compatibility: fitment } : {},
      search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { partNumber: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              { brand: { name: { contains: search, mode: "insensitive" } } },
              { category: { name: { contains: search, mode: "insensitive" } } },
              { compatibility: { some: { make: { name: { contains: search, mode: "insensitive" } } } } },
              { compatibility: { some: { model: { name: { contains: search, mode: "insensitive" } } } } },
            ],
          }
        : {},
    ],
  };
}

async function getCompatibility(partIds: string[]) {
  if (partIds.length === 0) return [];
  const rows = await prisma.$queryRaw<StoreCompatibilityRow[]>(Prisma.sql`
    SELECT
      compatibility."partId" AS "partId",
      compatibility."makeId" AS "makeId",
      compatibility."modelId" AS "modelId",
      compatibility."yearStart" AS "yearStart",
      compatibility."yearEnd" AS "yearEnd",
      make.name AS "makeName",
      model.name AS "modelName"
    FROM "public"."PartCompatibility" compatibility
    LEFT JOIN "public"."Make" make ON make.id = compatibility."makeId"
    LEFT JOIN "public"."Model" model ON model.id = compatibility."modelId"
    WHERE compatibility."partId" IN (${Prisma.join(partIds)})
    ORDER BY compatibility."createdAt" ASC
  `);

  return rows.map((row) => ({
    partId: row.partId,
    makeId: row.makeId,
    modelId: row.modelId,
    yearStart: row.yearStart,
    yearEnd: row.yearEnd,
    make: row.makeName ? { name: row.makeName } : null,
    model: row.modelName ? { name: row.modelName } : null,
  }));
}

async function getPublicFitmentOptions() {
  return prisma.$queryRaw<StoreFitmentOption[]>(Prisma.sql`
    SELECT DISTINCT
      compatibility."makeId" AS "makeId",
      make.name AS "makeName",
      compatibility."modelId" AS "modelId",
      model.name AS "modelName",
      model."makeId" AS "modelMakeId"
    FROM "public"."PartCompatibility" compatibility
    INNER JOIN "public"."PerformancePart" part ON part.id = compatibility."partId"
    LEFT JOIN "public"."Model" model ON model.id = compatibility."modelId"
    LEFT JOIN "public"."Make" make ON make.id = COALESCE(compatibility."makeId", model."makeId")
    WHERE part.status = 'ACTIVE'
      AND part."sourceUrl" IS NOT NULL
      AND part."sourceConfidence" = 'SOURCE_VERIFIED'
      AND part."imageUrl" IS NOT NULL
      AND (compatibility."makeId" IS NOT NULL OR compatibility."modelId" IS NOT NULL)
    ORDER BY "makeName" ASC NULLS LAST, "modelName" ASC NULLS LAST
  `);
}

function mapStorePartRow(part: StorePart, compatibility: StorePartCompatibility[]): PartsStorePartRow {
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
    compatibility: compatibility.map(formatCompatibility),
    fitments: compatibility.map((fitment) => ({
      makeId: fitment.makeId,
      makeName: fitment.make?.name ?? null,
      modelId: fitment.modelId,
      modelName: fitment.model?.name ?? null,
    })),
  };
}

function formatCents(value: number | null) {
  if (value === null) return "Price pending";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function formatCompatibility(fitment: StorePartCompatibility) {
  const makeModel = [fitment.make?.name, fitment.model?.name].filter(Boolean).join(" ");
  const years = fitment.yearStart && fitment.yearEnd
    ? fitment.yearStart === fitment.yearEnd ? String(fitment.yearStart) : `${fitment.yearStart}-${fitment.yearEnd}`
    : fitment.yearStart ? `${fitment.yearStart}+` : fitment.yearEnd ? `Through ${fitment.yearEnd}` : null;
  return [makeModel || "Universal", years].filter(Boolean).join(" · ");
}
