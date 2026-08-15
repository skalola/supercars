import type { PrismaClient } from "@prisma/client";

export type PreferredBrandView = {
  id: string;
  partBrandId: string;
  name: string;
  slug: string;
  brandType: string;
  qualityWeight: number;
  relationshipType: string;
  priority: number;
  affiliateEnabled: boolean;
  affiliateStatus: string;
  badge: string;
  provider: { code: string; providerType: string; active: boolean } | null;
};

export async function getPreferredPartBrandsForComponent(
  prisma: PrismaClient,
  input: { makeId: string; modelId?: string | null; categoryId: string; componentTypeId?: string | null },
): Promise<PreferredBrandView[]> {
  const mappings = await prisma.preferredPartBrand.findMany({
    where: {
      vehicleMakeId: input.makeId,
      active: true,
      partBrand: { active: true },
      AND: [
        {
          OR: [
            { vehicleModelId: null },
            ...(input.modelId ? [{ vehicleModelId: input.modelId }] : []),
          ],
        },
        {
          OR: [
            { componentTypeId: input.componentTypeId || "__none__" },
            { componentTypeId: null, componentCategoryId: input.categoryId },
            { componentTypeId: null, componentCategoryId: null },
          ],
        },
      ],
    },
    select: {
      id: true,
      partBrandId: true,
      relationshipType: true,
      priority: true,
      affiliateEnabled: true,
      affiliateStatus: true,
      componentCategoryId: true,
      componentTypeId: true,
      vehicleModelId: true,
      partBrand: { select: { name: true, slug: true, brandType: true, qualityWeight: true } },
      offerProvider: { select: { code: true, providerType: true, active: true } },
    },
    orderBy: [{ priority: "asc" }, { partBrand: { name: "asc" } }],
  });

  const mostSpecific = new Map<string, typeof mappings[number]>();
  for (const mapping of mappings) {
    const current = mostSpecific.get(mapping.partBrandId);
    if (!current || specificity(mapping) > specificity(current)) mostSpecific.set(mapping.partBrandId, mapping);
  }
  return [...mostSpecific.values()]
    .sort((left, right) => left.priority - right.priority || left.partBrand.name.localeCompare(right.partBrand.name))
    .map((mapping) => ({
      id: mapping.id,
      partBrandId: mapping.partBrandId,
      name: mapping.partBrand.name,
      slug: mapping.partBrand.slug,
      brandType: mapping.partBrand.brandType,
      qualityWeight: mapping.partBrand.qualityWeight,
      relationshipType: mapping.relationshipType,
      priority: mapping.priority,
      affiliateEnabled: mapping.affiliateEnabled,
      affiliateStatus: mapping.affiliateStatus,
      badge: getPreferredBrandBadge(mapping.relationshipType),
      provider: mapping.offerProvider,
    }));
}

export function getPreferredBrandBadge(relationshipType: string) {
  const badges: Record<string, string> = {
    FACTORY: "Factory",
    FACTORY_PERFORMANCE: "Factory Performance",
    OEM_APPROVED: "OEM",
    PERFORMANCE_PREFERRED: "Preferred Performance",
    AFTERMARKET: "Aftermarket",
    SPECIALIST: "Specialist",
  };
  return badges[relationshipType] ?? "Marketplace";
}

export function buildPreferredBrandSearchTemplates(baseTemplates: string[], brandNames: string[]) {
  const enhanced = brandNames.map((brand) => `{make} {model} ${brand} {component}`);
  return [...new Set([...baseTemplates, ...enhanced])].slice(0, 16);
}

function specificity(mapping: { vehicleModelId?: string | null; componentCategoryId: string | null; componentTypeId: string | null }) {
  return (mapping.vehicleModelId ? 4 : 0) + (mapping.componentTypeId ? 2 : mapping.componentCategoryId ? 1 : 0);
}
