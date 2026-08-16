import type { EbayComponentOffer } from "@/lib/ebay/browse.server";
import type { Prisma } from "@prisma/client";
import {
  loadExistingOffers,
  persistDiscoveredOffer,
} from "@/lib/parts/ferrari-product-normalizer";
import { ensureEbayOfferProvider } from "@/lib/parts/ebay-partner";
import { getPartOfferProviderAdapter } from "@/lib/parts/offers/registry";
import { rankPartOffers } from "@/lib/parts/offer-ranking";
import {
  buildPreferredBrandSearchTemplates,
  getPreferredPartBrandsForComponent,
} from "@/lib/parts/preferred-brands";
import { prisma } from "@/lib/prisma";
import { getUniversalPartComponentGroup } from "@/lib/parts/part-type-hierarchy";
import { getPartTypeTitleConflict } from "@/lib/parts/offer-quality";
import { selectModelHeroImage } from "@/lib/model-catalog/model-display";
import { unstable_cache } from "next/cache";

const COMPONENT_OFFER_TTL_MS = 12 * 60 * 60 * 1000;
const FAILED_RETRY_TTL_MS = 5 * 60 * 1000;
const RUNNING_LOCK_TTL_MS = 2 * 60 * 1000;
const COMPONENT_OFFER_PAGE_SIZE = 5;

const getPartTaxonomySystemsCached = unstable_cache(
  async () => prisma.partCategory.findMany({
    where: { active: true, componentTypes: { some: { active: true } } },
    select: {
      id: true,
      name: true,
      slug: true,
      displayOrder: true,
      _count: { select: { componentTypes: { where: { active: true } } } },
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  }),
  ["parts-static-system-taxonomy-v1"],
  { revalidate: 86_400, tags: ["parts-catalog"] },
);

const getPartTaxonomyTypesCached = unstable_cache(
  async (systemSlug: string) => prisma.partComponentType.findMany({
    where: { active: true, category: { active: true, slug: systemSlug } },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      displayOrder: true,
      performanceRelated: true,
      systemGroup: true,
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  }),
  ["parts-static-component-taxonomy-v1"],
  { revalidate: 86_400, tags: ["parts-catalog"] },
);

export async function getPartModels(makeSlug: string) {
  return prisma.model.findMany({
    where: {
      make: { slug: makeSlug, partsMarqueConfig: { is: { partsEnabled: true } } },
      partComponents: { some: { active: true } },
    },
    select: {
      name: true,
      slug: true,
      productionStartYear: true,
      productionEndYear: true,
      _count: { select: { partComponents: { where: { active: true } } } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getPartVehicleSummary(input: { makeSlug: string; modelSlug: string }) {
  const model = await prisma.model.findFirst({
    where: {
      slug: input.modelSlug,
      make: { slug: input.makeSlug },
    },
    select: {
      name: true,
      slug: true,
      productionStartYear: true,
      productionEndYear: true,
      spec: {
        select: {
          engine: true,
          horsepower: true,
          torque: true,
          transmission: true,
          drivetrain: true,
          weight: true,
        },
      },
      images: {
        orderBy: [{ type: "asc" }, { createdAt: "asc" }],
        select: { url: true, type: true, reviewStatus: true },
        take: 12,
      },
      make: { select: { name: true, slug: true, logoUrl: true } },
    },
  });
  if (!model) return null;
  const heroImage = selectModelHeroImage(model.images);

  return {
    year: model.productionEndYear ?? model.productionStartYear,
    makeName: model.make.name,
    makeSlug: model.make.slug,
    makeLogoUrl: model.make.logoUrl,
    modelName: model.name,
    modelSlug: model.slug,
    variant: null,
    imageUrl: heroImage?.url ?? null,
    engine: model.spec?.engine ?? null,
    horsepower: model.spec?.horsepower ?? null,
    torque: model.spec?.torque ?? null,
    weight: model.spec?.weight ?? null,
    drivetrain: model.spec?.drivetrain ?? null,
    transmission: model.spec?.transmission ?? null,
    aspiration: inferAspiration(model.spec?.engine),
    buildStage: "Stock specification",
    detailPath: `/make/${model.make.slug}/${model.slug}`,
    exactOwnedVehicle: false,
  };
}

export async function getApplicablePartSystems(input: { makeSlug: string; modelSlug: string }) {
  void input;
  const systems = await getPartTaxonomySystemsCached();
  return systems.map((system) => ({
    id: system.id,
    name: system.name,
    slug: system.slug,
    displayOrder: system.displayOrder,
    componentCount: system._count.componentTypes,
  }));
}

function inferAspiration(engine?: string | null) {
  if (!engine) return null;
  if (/turbo|supercharg|forced induction/i.test(engine)) return "Forced Induction";
  if (/naturally aspirated|\bN\/?A\b/i.test(engine)) return "Naturally Aspirated";
  return null;
}

export async function getApplicablePartTypes(input: { makeSlug: string; modelSlug: string; systemSlug: string }) {
  const [componentTypes, modelMappings] = await Promise.all([
    getPartTaxonomyTypesCached(input.systemSlug),
    prisma.modelPartComponent.findMany({
      where: {
        active: true,
        model: { slug: input.modelSlug, make: { slug: input.makeSlug, partsMarqueConfig: { is: { partsEnabled: true } } } },
        componentType: { active: true, category: { slug: input.systemSlug } },
      },
      select: {
        id: true,
        applicability: true,
        lastOfferSearchAt: true,
        lastOfferSearchStatus: true,
        componentType: {
          select: { id: true, name: true, slug: true, description: true, displayOrder: true, performanceRelated: true, systemGroup: true },
        },
        _count: { select: { offerContexts: { where: { active: true, offer: { active: true, affiliateUrl: { not: null } } } } } },
      },
      orderBy: [{ componentType: { displayOrder: "asc" } }, { componentType: { name: "asc" } }],
    }),
  ]);
  const mappingByComponentId = new Map(modelMappings.map((mapping) => [mapping.componentType.id, mapping]));

  return componentTypes.map((componentType) => {
    const mapping = mappingByComponentId.get(componentType.id);
    return {
      id: mapping?.id ?? componentType.id,
      applicability: mapping?.applicability ?? "TAXONOMY_ONLY",
      lastOfferSearchAt: mapping?.lastOfferSearchAt ?? null,
      lastOfferSearchStatus: mapping?.lastOfferSearchStatus ?? "UNMAPPED",
      componentType,
      _count: { offerContexts: mapping?._count.offerContexts ?? 0 },
      mapped: Boolean(mapping),
      componentGroup: getUniversalPartComponentGroup(input.systemSlug, componentType.name, componentType.systemGroup),
    };
  });
}

export async function getAvailableOffers(input: {
  makeSlug: string;
  modelSlug: string;
  componentSlug: string;
  categorySlug?: string;
  year?: number | null;
  page?: number;
  forceRefresh?: boolean;
  cacheOnly?: boolean;
}) {
  const mapping = await prisma.modelPartComponent.findFirst({
    where: {
      active: true,
      model: { slug: input.modelSlug, make: { slug: input.makeSlug, partsMarqueConfig: { is: { partsEnabled: true } } } },
      componentType: {
        active: true,
        slug: input.componentSlug,
        ...(input.categorySlug ? { category: { slug: input.categorySlug } } : {}),
      },
    },
    select: {
      id: true,
      lastOfferSearchAt: true,
      lastOfferSearchStatus: true,
      lastOfferRejectedCount: true,
      model: {
        select: {
          id: true,
          makeId: true,
          name: true,
          slug: true,
          productionStartYear: true,
          productionEndYear: true,
          make: { select: { name: true, slug: true } },
        },
      },
      componentType: {
        select: {
          id: true,
          name: true,
          slug: true,
          performanceRelated: true,
          categoryId: true,
          category: { select: { name: true, slug: true } },
          aliases: true,
          fitmentRisk: true,
        },
      },
    },
  });
  if (!mapping) return null;

  const now = new Date();
  const page = Math.max(1, Math.floor(input.page || 1));
  if (input.cacheOnly) return buildComponentOfferResponse(mapping, false, page);
  const retryMs = mapping.lastOfferSearchStatus === "RUNNING"
    ? RUNNING_LOCK_TTL_MS
    : ["FAILED", "API_ERROR", "ZERO_OFFERS", "SEARCH_EXHAUSTED", "LOW_CONFIDENCE_ONLY"].includes(mapping.lastOfferSearchStatus)
      ? FAILED_RETRY_TTL_MS
      : COMPONENT_OFFER_TTL_MS;
  const cacheFresh = !input.forceRefresh && mapping.lastOfferSearchAt && mapping.lastOfferSearchAt > new Date(now.getTime() - retryMs);
  if (cacheFresh || mapping.lastOfferSearchStatus === "RUNNING") {
    return buildComponentOfferResponse(mapping, false, page);
  }

  const claim = await prisma.modelPartComponent.updateMany({
    where: {
      id: mapping.id,
      ...(input.forceRefresh ? {} : {
        OR: [
          { lastOfferSearchAt: null },
          { lastOfferSearchAt: { lt: new Date(now.getTime() - retryMs) } },
        ],
      }),
    },
    data: { lastOfferSearchAt: now, lastOfferSearchStatus: "RUNNING" },
  });
  if (claim.count === 0) return buildComponentOfferResponse(mapping, false, page);

  try {
    const [knownModels, preferredBrands, refreshData] = await Promise.all([
      prisma.model.findMany({
        where: { make: { slug: input.makeSlug } },
        select: { name: true },
      }).then((models) => models.map((model) => model.name)),
      getPreferredPartBrandsForComponent(prisma, {
        makeId: mapping.model.makeId,
        modelId: mapping.model.id,
        categoryId: mapping.componentType.categoryId,
        componentTypeId: mapping.componentType.id,
      }),
      prisma.modelPartComponent.findUniqueOrThrow({
        where: { id: mapping.id },
        select: {
          componentType: {
            select: {
              searchTemplates: {
                where: { active: true },
                select: { template: true },
                orderBy: { priority: "asc" },
                take: 12,
              },
              canonicalParts: {
                where: { status: { in: ["PUBLISHED", "ACTIVE"] } },
                select: {
                  partNumber: true,
                  oemPartNumber: true,
                  identifiers: {
                    where: { confidence: "HIGH" },
                    select: { normalizedValue: true },
                    take: 5,
                  },
                },
                take: 8,
              },
            },
          },
        },
      }),
    ]);
    const templates = buildPreferredBrandSearchTemplates(
      refreshData.componentType.searchTemplates.map((template) => template.template),
      preferredBrands.map((brand) => brand.name),
    );
    const year = input.year ?? mapping.model.productionEndYear ?? mapping.model.productionStartYear;
    const referenceId = buildComponentAffiliateReference(mapping.model.make.slug, mapping.model.slug, mapping.componentType.category.slug, mapping.componentType.slug, year);
    const provider = await resolvePartTypeOfferProvider(mapping.model.makeId);
    const search = await provider.adapter.searchPartTypeOffers!({
      makeName: mapping.model.make.name,
      makeSlug: mapping.model.make.slug,
      modelName: mapping.model.name,
      modelSlug: mapping.model.slug,
      partTypeId: mapping.componentType.id,
      partTypeName: mapping.componentType.name,
      partTypeSlug: mapping.componentType.slug,
      systemSlug: mapping.componentType.category.slug,
      templates,
      knownModels,
      knownBrands: [...new Set(preferredBrands.map((brand) => brand.name))],
      aliases: readAliases(mapping.componentType.aliases),
      identifiers: [...new Set(refreshData.componentType.canonicalParts.flatMap((part) => [
        part.oemPartNumber,
        part.partNumber,
        ...part.identifiers.map((identifier) => identifier.normalizedValue),
      ]).filter((value): value is string => Boolean(value)))].slice(0, 8),
      fitmentRisk: normalizeFitmentRisk(mapping.componentType.fitmentRisk),
      year,
      referenceId,
      limit: 20,
    }) as {
      offers: EbayComponentOffer[];
      queries: string[];
      examinedCount: number;
      rejectedCount: number;
      missingAffiliateUrlCount: number;
      rejectionReasons: Record<string, number>;
    };
    if (search.missingAffiliateUrlCount > 0) {
      console.warn("Part offer provider results omitted affiliate URLs", {
        provider: provider.code,
        model: mapping.model.name,
        component: mapping.componentType.name,
        count: search.missingAffiliateUrlCount,
        campaignConfigured: provider.code !== "EBAY" || Boolean(process.env.EBAY_EPN_CAMPAIGN_ID?.trim()),
        affiliateReferenceId: referenceId,
      });
    }
    const existingOffers = await loadExistingOffers(prisma, {
      mappingId: mapping.id,
      provider: provider.code,
      externalItemIds: search.offers.map((offer) => offer.externalItemId),
    });
    const seenOfferIds: string[] = [];
    for (const offer of search.offers) {
      const expiresAt = offer.itemEndDate && offer.itemEndDate > now
        ? offer.itemEndDate
        : new Date(now.getTime() + COMPONENT_OFFER_TTL_MS);
      const stored = await persistDiscoveredOffer(prisma, {
        makeName: mapping.model.make.name,
        knownBrands: preferredBrands.map((brand) => brand.name),
        offer,
        partnerId: provider.affiliatePartnerId,
        providerId: provider.id,
        mappingId: mapping.id,
        modelId: mapping.model.id,
        makeId: mapping.model.makeId,
        modelYearStart: mapping.model.productionStartYear,
        modelYearEnd: mapping.model.productionEndYear,
        categoryId: mapping.componentType.categoryId,
        categorySlug: mapping.componentType.category.slug,
        componentTypeId: mapping.componentType.id,
        componentName: mapping.componentType.name,
        performanceRelated: mapping.componentType.performanceRelated,
        now,
        expiresAt,
        existingOffer: existingOffers.get(offer.externalItemId) ?? null,
      });
      seenOfferIds.push(stored.offerId);
    }
    await prisma.partOfferContext.updateMany({
      where: {
        modelPartComponentId: mapping.id,
        active: true,
        ...(seenOfferIds.length ? { offerId: { notIn: seenOfferIds } } : {}),
      },
      data: { active: false, lastCheckedAt: now },
    });
    const searchStatus = search.offers.length > 0
      ? "COMPLETED"
      : search.examinedCount === 0
        ? "SEARCH_EXHAUSTED"
        : search.rejectedCount > 0
          ? "LOW_CONFIDENCE_ONLY"
          : "ZERO_OFFERS";
    await prisma.modelPartComponent.update({
      where: { id: mapping.id },
      data: {
        lastOfferSearchAt: now,
        lastOfferSearchStatus: searchStatus,
        lastOfferRejectedCount: search.rejectedCount,
      },
    });
    const response = await buildComponentOfferResponse(
      { ...mapping, lastOfferSearchAt: now, lastOfferSearchStatus: searchStatus, lastOfferRejectedCount: search.rejectedCount },
      true,
      page,
    );
    return {
      ...response,
      discovery: {
        queries: search.queries,
        examinedResults: search.examinedCount,
        acceptedResults: search.offers.length,
        rejectedResults: search.rejectedCount,
        missingAffiliateUrls: search.missingAffiliateUrlCount,
        rejectionReasons: search.rejectionReasons,
      },
    };
  } catch (error) {
    await prisma.modelPartComponent.update({ where: { id: mapping.id }, data: { lastOfferSearchStatus: "API_ERROR" } });
    throw error;
  }
}

async function resolvePartTypeOfferProvider(makeId: string) {
  const marqueConfig = await prisma.partsMarqueConfig.findUnique({
    where: { makeId },
    select: { partsEnabled: true, enabledProviders: true },
  });
  if (!marqueConfig?.partsEnabled) throw new Error("Parts discovery is not enabled for this marque.");
  const enabledProviderCodes = readProviderCodes(marqueConfig.enabledProviders);
  if (enabledProviderCodes.length === 0) throw new Error("No offer providers are enabled for this marque.");
  const configured = await prisma.partOfferProvider.findMany({
    where: { active: true, code: { in: enabledProviderCodes } },
    select: { id: true, code: true, providerType: true, affiliatePartnerId: true },
  });
  const priority: Record<string, number> = {
    DIRECT_MANUFACTURER: 0,
    DIRECT_AFFILIATE: 1,
    AUTHORIZED_RETAILER: 2,
    SCUDERIA: 3,
    EBAY: 10,
    OTHER_MARKETPLACE: 20,
  };
  for (const provider of configured.sort((left, right) => (priority[left.providerType] ?? 50) - (priority[right.providerType] ?? 50))) {
    const adapter = getPartOfferProviderAdapter(provider.code);
    if (adapter?.searchPartTypeOffers) return { ...provider, adapter };
  }

  if (!enabledProviderCodes.includes("EBAY")) throw new Error("No enabled part offer provider adapter is configured.");
  const ebay = await ensureEbayOfferProvider(prisma);
  const adapter = getPartOfferProviderAdapter("EBAY");
  if (!adapter?.searchPartTypeOffers) throw new Error("No active part offer provider adapter is configured.");
  return { ...ebay, code: "EBAY", providerType: "EBAY", adapter };
}

function readProviderCodes(value: unknown) {
  return Array.isArray(value)
    ? value.filter((code): code is string => typeof code === "string").map((code) => code.trim().toUpperCase()).filter(Boolean)
    : [];
}

function readAliases(value: unknown) {
  return Array.isArray(value) ? value.filter((alias): alias is string => typeof alias === "string") : [];
}

function normalizeFitmentRisk(value: string): "LOW" | "MEDIUM" | "HIGH" {
  return value === "LOW" || value === "HIGH" ? value : "MEDIUM";
}

async function buildComponentOfferResponse(
  mapping: {
    id: string;
    lastOfferSearchAt: Date | null;
    lastOfferSearchStatus: string;
    lastOfferRejectedCount: number;
    model: { id: string; name: string; slug: string; makeId: string; make?: { name: string; slug: string } };
    componentType: { id: string; name: string; slug: string; categoryId: string; fitmentRisk: string; category: { name: string; slug: string } };
  },
  refreshed: boolean,
  page: number,
) {
  const now = new Date();
  const activeContextWhere = {
    modelPartComponentId: mapping.id,
    active: true,
    offer: {
      active: true,
      affiliateUrl: { not: null },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  } satisfies Prisma.PartOfferContextWhereInput;
  const [candidateRows, preferredBrands] = await Promise.all([prisma.partOfferContext.findMany({
    where: activeContextWhere,
    select: {
      id: true,
      fitmentConfidence: true,
      offer: { select: { title: true } },
    },
    orderBy: [{ confidenceScore: "desc" }, { offer: { priceCents: "asc" } }],
    take: 100,
  }), getPreferredPartBrandsForComponent(prisma, {
    makeId: mapping.model.makeId,
    modelId: mapping.model.id,
    categoryId: mapping.componentType.categoryId,
    componentTypeId: mapping.componentType.id,
  })]);
  const eligibleCandidateIds = candidateRows.filter((context) => {
    if (getPartTypeTitleConflict(mapping.componentType.name, context.offer.title)) return false;
    if (["EXACT_MATCH", "HIGH_CONFIDENCE", "HIGH"].includes(context.fitmentConfidence)) return true;
    return mapping.componentType.fitmentRisk === "LOW" && ["LIKELY_COMPATIBLE", "POSSIBLE"].includes(context.fitmentConfidence);
  }).map((context) => context.id);
  const pageStart = (page - 1) * COMPONENT_OFFER_PAGE_SIZE;
  const selectedContextIds = eligibleCandidateIds.slice(pageStart, pageStart + COMPONENT_OFFER_PAGE_SIZE);
  const hasMore = eligibleCandidateIds.length > pageStart + COMPONENT_OFFER_PAGE_SIZE;
  const contextRows = selectedContextIds.length === 0 ? [] : await prisma.partOfferContext.findMany({
    where: {
      ...activeContextWhere,
      id: { in: selectedContextIds },
    },
    select: {
      id: true,
      fitmentConfidence: true,
      confidenceScore: true,
      matchReasons: true,
      offer: {
        select: {
          id: true,
          provider: true,
          externalItemId: true,
          title: true,
          priceCents: true,
          currency: true,
          condition: true,
          sellerName: true,
          sellerFeedbackPercentage: true,
          imageUrl: true,
          brandName: true,
          manufacturerPartNumber: true,
          oemPartNumber: true,
          classification: true,
          affiliateUrl: true,
          shippingCostCents: true,
          shippingCurrency: true,
          oemMatchType: true,
          genuineOemStatus: true,
          compatibilityStatus: true,
          fitmentConfidence: true,
          confidenceScore: true,
          offerProvider: { select: { code: true, providerType: true, active: true } },
          part: {
            select: {
              id: true,
              name: true,
              brandId: true,
              partNumber: true,
              oemPartNumber: true,
              brand: { select: { name: true, slug: true } },
            },
          },
        },
      },
    },
  });
  const contextById = new Map(contextRows.map((context) => [context.id, context]));
  const displayContexts = selectedContextIds.flatMap((id) => {
    const context = contextById.get(id);
    return context ? [context] : [];
  });
  const rankedOffers = rankPartOffers({
    offers: displayContexts.map((context) => ({
      id: context.offer.id,
      providerCode: context.offer.offerProvider?.code ?? context.offer.provider,
      providerType: context.offer.offerProvider?.providerType ?? context.offer.provider,
      providerActive: context.offer.offerProvider?.active ?? context.offer.provider === "EBAY",
      partBrandId: context.offer.part?.brandId,
      canonicalOemPartNumber: context.offer.part?.oemPartNumber,
      canonicalManufacturerPartNumber: context.offer.part?.partNumber,
      affiliateUrl: context.offer.affiliateUrl,
      confidenceScore: context.confidenceScore,
      fitmentConfidence: context.fitmentConfidence,
      oemMatchType: context.offer.oemMatchType,
      manufacturerPartNumber: context.offer.manufacturerPartNumber,
      oemPartNumber: context.offer.oemPartNumber,
      priceCents: context.offer.priceCents,
      brandName: context.offer.part?.brand.name ?? context.offer.brandName,
      genuineOemStatus: context.offer.genuineOemStatus,
      sellerFeedbackPercentage: context.offer.sellerFeedbackPercentage,
      condition: context.offer.condition,
      context,
    })),
    preferredBrands: preferredBrands.map((brand) => ({
      partBrandId: brand.partBrandId,
      name: brand.name,
      relationshipType: brand.relationshipType,
      priority: brand.priority,
      affiliateEnabled: brand.affiliateEnabled,
      affiliateStatus: brand.affiliateStatus,
      providerCode: brand.provider?.code,
      brandType: brand.brandType,
      qualityWeight: brand.qualityWeight,
    })),
  });
  const products = new Map<string, {
    id: string;
    name: string;
    brand: { name: string; slug: string };
    oemPartNumber: string | null;
    manufacturerPartNumber: string | null;
  }>();
  for (const context of displayContexts) {
    if (!context.offer.part) continue;
    products.set(context.offer.part.id, {
      id: context.offer.part.id,
      name: context.offer.part.name,
      brand: context.offer.part.brand,
      oemPartNumber: context.offer.part.oemPartNumber,
      manufacturerPartNumber: context.offer.part.partNumber,
    });
  }
  return {
    model: mapping.model,
    category: mapping.componentType.category,
    component: { name: mapping.componentType.name, slug: mapping.componentType.slug },
    preferredBrands,
    products: [...products.values()],
    cache: {
      refreshed,
      status: mapping.lastOfferSearchStatus,
      lastSearchedAt: mapping.lastOfferSearchAt,
      rejectedResults: mapping.lastOfferRejectedCount,
      ttlSeconds: COMPONENT_OFFER_TTL_MS / 1000,
    },
    pagination: {
      page,
      pageSize: COMPONENT_OFFER_PAGE_SIZE,
      hasPrevious: page > 1,
      hasMore,
    },
    discovery: null as null | {
      queries: string[];
      examinedResults: number;
      acceptedResults: number;
      rejectedResults: number;
      missingAffiliateUrls: number;
      rejectionReasons: Record<string, number>;
    },
    offers: rankedOffers.map(({ context, providerCode, providerType, rankScore, rankReason, rankExplanation, qualityTier }) => ({
      id: context.offer.id,
      provider: providerCode,
      providerType,
      externalItemId: context.offer.externalItemId,
      title: context.offer.title,
      priceCents: context.offer.priceCents,
      currency: context.offer.currency,
      condition: context.offer.condition,
      sellerName: context.offer.sellerName,
      sellerFeedbackPercentage: context.offer.sellerFeedbackPercentage,
      imageUrl: context.offer.imageUrl,
      manufacturer: context.offer.part?.brand.name ?? context.offer.brandName,
      manufacturerPartNumber: context.offer.manufacturerPartNumber,
      oemPartNumber: context.offer.oemPartNumber,
      classification: context.offer.classification,
      shippingCostCents: context.offer.shippingCostCents,
      shippingCurrency: context.offer.shippingCurrency,
      genuineOemStatus: context.offer.genuineOemStatus,
      compatibilityStatus: context.offer.compatibilityStatus,
      fitmentConfidence: context.fitmentConfidence,
      confidenceScore: context.confidenceScore,
      matchReasons: context.matchReasons,
      rankReason,
      rankExplanation,
      rankScore,
      qualityTier,
      itemAffiliateWebUrl: context.offer.affiliateUrl,
      buyUrl: `/out/parts/offers/${context.offer.id}?componentContext=${mapping.id}&source=/parts`,
    })),
  };
}

export function buildComponentAffiliateReference(makeSlug: string, modelSlug: string, categorySlug: string, componentSlug: string, year?: number | null) {
  return [makeSlug, modelSlug, categorySlug, componentSlug, year || null]
    .filter(Boolean)
    .join("_")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .toLowerCase()
    .slice(0, 64);
}

// Compatibility exports keep existing Ferrari scripts/routes working while all
// production behavior runs through the manufacturer-neutral service functions.
export const getFerrariComponentModels = () => getPartModels("ferrari");
export const getFerrariModelComponentCategories = (modelSlug: string) =>
  getApplicablePartSystems({ makeSlug: "ferrari", modelSlug });
export const getFerrariModelComponents = (modelSlug: string, categorySlug: string) =>
  getApplicablePartTypes({ makeSlug: "ferrari", modelSlug, systemSlug: categorySlug });
export const getFerrariComponentOffers = (input: Omit<Parameters<typeof getAvailableOffers>[0], "makeSlug">) =>
  getAvailableOffers({ ...input, makeSlug: "ferrari" });
