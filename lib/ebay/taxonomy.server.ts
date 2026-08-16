import { getEbayApplicationToken } from "@/lib/ebay/oauth.server";
import { prisma } from "@/lib/prisma";

const TAXONOMY_BASE_URL = "https://api.ebay.com/commerce/taxonomy/v1";
const EBAY_MOTORS_TREE_ID = "100";
const CATEGORY_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const VEHICLE_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

export type EbayFitmentCategory = {
  mappingId: string;
  categoryId: string;
  categoryName: string | null;
  compatibilitySupported: boolean;
};

export type EbayVehicleFitment = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  engine?: string | null;
};

export async function resolveEbayFitmentCategories(input: {
  providerId: string;
  componentTypeId: string;
  componentName: string;
  aliases?: string[];
}) {
  const now = new Date();
  const cached = await prisma.partProviderCategoryMapping.findMany({
    where: {
      providerId: input.providerId,
      componentTypeId: input.componentTypeId,
      active: true,
      compatibilitySupported: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, externalCategoryId: true, externalCategoryName: true, compatibilitySupported: true },
    orderBy: [{ confidence: "asc" }, { externalCategoryName: "asc" }],
    take: 3,
  });
  return cached.map(toCategory);
}

export async function verifyAndCacheEbayFitmentCategories(input: {
  providerId: string;
  componentTypeId: string;
  categories: Array<{ categoryId: string; categoryName: string | null }>;
}) {
  const unique = [...new Map(input.categories.map((category) => [category.categoryId, category])).values()]
    .filter((category) => !["6000", "6028", "6030"].includes(category.categoryId))
    .slice(0, 8);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CATEGORY_CACHE_MS);
  const supported: EbayFitmentCategory[] = [];
  for (const category of unique) {
    const metadata = await taxonomyGet<{ compatibilityProperties?: Array<{ name?: string }> }>(
      `/category_tree/${EBAY_MOTORS_TREE_ID}/get_compatibility_properties`,
      { category_id: category.categoryId },
    ).catch(() => null);
    const names = new Set((metadata?.compatibilityProperties ?? []).map((property) => property.name));
    if (!["Year", "Make", "Model"].every((name) => names.has(name))) continue;
    const mapping = await prisma.partProviderCategoryMapping.upsert({
      where: {
        providerId_componentTypeId_externalCategoryId: {
          providerId: input.providerId,
          componentTypeId: input.componentTypeId,
          externalCategoryId: category.categoryId,
        },
      },
      update: {
        externalCategoryName: category.categoryName,
        taxonomyTreeId: EBAY_MOTORS_TREE_ID,
        compatibilitySupported: true,
        confidence: "BROWSE_TAXONOMY_VERIFIED",
        verifiedAt: now,
        expiresAt,
        active: true,
      },
      create: {
        providerId: input.providerId,
        componentTypeId: input.componentTypeId,
        externalCategoryId: category.categoryId,
        externalCategoryName: category.categoryName,
        taxonomyTreeId: EBAY_MOTORS_TREE_ID,
        compatibilitySupported: true,
        confidence: "BROWSE_TAXONOMY_VERIFIED",
        verifiedAt: now,
        expiresAt,
      },
      select: { id: true, externalCategoryId: true, externalCategoryName: true, compatibilitySupported: true },
    });
    supported.push(toCategory(mapping));
    if (supported.length >= 3) break;
  }
  return supported;
}

export async function resolveEbayVehicleFitment(input: {
  providerId: string;
  category: EbayFitmentCategory;
  modelId: string;
  year: number;
  makeName: string;
  modelName: string;
}) {
  const now = new Date();
  const cached = await prisma.partProviderVehicleMapping.findUnique({
    where: {
      providerId_modelId_categoryMappingId_year: {
        providerId: input.providerId,
        modelId: input.modelId,
        categoryMappingId: input.category.mappingId,
        year: input.year,
      },
    },
    select: { makeValue: true, modelValue: true, trimValue: true, engineValue: true, active: true, expiresAt: true },
  });
  if (cached?.active && (!cached.expiresAt || cached.expiresAt > now)) {
    return { year: input.year, make: cached.makeValue, model: cached.modelValue, trim: cached.trimValue, engine: cached.engineValue };
  }

  const models = await taxonomyGet<{ compatibilityPropertyValues?: Array<{ value?: string }> }>(
    `/category_tree/${EBAY_MOTORS_TREE_ID}/get_compatibility_property_values`,
    {
      category_id: input.category.categoryId,
      compatibility_property: "Model",
      filter: `Year:${input.year},Make:${escapeFilterValue(input.makeName)}`,
    },
  );
  const modelValue = selectCanonicalValue(
    (models.compatibilityPropertyValues ?? []).map((item) => item.value).filter(isPresent),
    input.modelName,
  );
  if (!modelValue) return null;

  const expiresAt = new Date(now.getTime() + VEHICLE_CACHE_MS);
  await prisma.partProviderVehicleMapping.upsert({
    where: {
      providerId_modelId_categoryMappingId_year: {
        providerId: input.providerId,
        modelId: input.modelId,
        categoryMappingId: input.category.mappingId,
        year: input.year,
      },
    },
    update: { makeValue: input.makeName, modelValue, confidence: "TAXONOMY_VERIFIED", verifiedAt: now, expiresAt, active: true },
    create: {
      providerId: input.providerId,
      modelId: input.modelId,
      categoryMappingId: input.category.mappingId,
      year: input.year,
      makeValue: input.makeName,
      modelValue,
      confidence: "TAXONOMY_VERIFIED",
      verifiedAt: now,
      expiresAt,
    },
  });
  return { year: input.year, make: input.makeName, model: modelValue } satisfies EbayVehicleFitment;
}

function toCategory(row: { id: string; externalCategoryId: string; externalCategoryName: string | null; compatibilitySupported: boolean }): EbayFitmentCategory {
  return { mappingId: row.id, categoryId: row.externalCategoryId, categoryName: row.externalCategoryName, compatibilitySupported: row.compatibilitySupported };
}

async function taxonomyGet<T>(path: string, params: Record<string, string>) {
  const token = await getEbayApplicationToken();
  const url = new URL(`${TAXONOMY_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`eBay Taxonomy request failed with HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

function selectCanonicalValue(values: string[], requested: string) {
  const normalizedRequested = normalize(requested);
  return values.find((value) => normalize(value) === normalizedRequested)
    ?? values.find((value) => normalize(value).includes(normalizedRequested) || normalizedRequested.includes(normalize(value)))
    ?? null;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeFilterValue(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll(",", "\\,");
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}
