export type VariantIdentity = {
  name: string;
  slug: string;
};

export type VariantCoverage = {
  sourceVariantCount: number;
  catalogVariantCount: number;
  matchedCount: number;
  missing: VariantIdentity[];
  catalogOnly: VariantIdentity[];
  status: "COMPLETE" | "PARTIAL" | "NO_SOURCE_VARIANTS";
};

export function analyzeVariantCoverage(
  sourceVariants: VariantIdentity[],
  catalogVariants: VariantIdentity[],
): VariantCoverage {
  const source = uniqueByIdentity(sourceVariants);
  const catalog = uniqueByIdentity(catalogVariants);
  const sourceKeys = new Set(source.map(identityKey));
  const catalogKeys = new Set(catalog.map(identityKey));
  const missing = source.filter((variant) => !catalogKeys.has(identityKey(variant)));
  const catalogOnly = catalog.filter((variant) => !sourceKeys.has(identityKey(variant)));

  return {
    sourceVariantCount: source.length,
    catalogVariantCount: catalog.length,
    matchedCount: source.length - missing.length,
    missing,
    catalogOnly,
    status: source.length === 0 ? "NO_SOURCE_VARIANTS" : missing.length === 0 ? "COMPLETE" : "PARTIAL",
  };
}

export function normalizeVariantIdentity(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function identityKey(variant: VariantIdentity) {
  return normalizeVariantIdentity(variant.slug || variant.name);
}

function uniqueByIdentity(variants: VariantIdentity[]) {
  return [...new Map(variants.map((variant) => [identityKey(variant), variant])).values()]
    .filter((variant) => Boolean(identityKey(variant)));
}
