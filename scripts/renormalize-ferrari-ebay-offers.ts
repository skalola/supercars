import { PrismaClient } from "@prisma/client";
import { persistFerrariDiscoveredOffer } from "../lib/parts/ferrari-product-normalizer";
import { ensureEbayOfferProvider } from "../lib/parts/ebay-partner";

const prisma = new PrismaClient();

async function main() {
  const identifiersOnly = process.argv.includes("--identifiers-only");
  const partner = await ensureEbayOfferProvider(prisma);
  const offers = identifiersOnly ? [] : await prisma.partOffer.findMany({
    where: {
      provider: "EBAY",
      active: true,
      affiliateUrl: { not: null },
      contexts: { some: { active: true, modelPartComponent: { model: { make: { slug: "ferrari" } } } } },
    },
    select: {
      id: true,
      externalItemId: true,
      title: true,
      subtitle: true,
      priceCents: true,
      currency: true,
      condition: true,
      sellerName: true,
      sellerFeedbackPercentage: true,
      sellerQualityScore: true,
      imageUrl: true,
      additionalImageUrls: true,
      affiliateUrl: true,
      sourceUrl: true,
      affiliateReferenceId: true,
      itemEndDate: true,
      fitmentConfidence: true,
      confidenceScore: true,
      oemMatchType: true,
      genuineOemStatus: true,
      compatibilityStatus: true,
      shippingCostCents: true,
      shippingCurrency: true,
      itemLocation: true,
      marketplaceCategoryId: true,
      compatibilityData: true,
      quantityAvailable: true,
      expiresAt: true,
      contexts: {
        where: { active: true, modelPartComponent: { model: { make: { slug: "ferrari" } } } },
        select: {
          searchQuery: true,
          matchReasons: true,
          modelPartComponent: {
            select: {
              id: true,
              model: { select: { id: true, makeId: true, productionStartYear: true, productionEndYear: true } },
              componentType: {
                select: {
                  id: true,
                  name: true,
                  performanceRelated: true,
                  categoryId: true,
                  category: { select: { slug: true } },
                },
              },
            },
          },
        },
        orderBy: { confidenceScore: "desc" },
        take: 1,
      },
    },
    orderBy: { id: "asc" },
  });
  let processed = 0;
  for (const offer of offers) {
    const context = offer.contexts[0];
    if (!context || !offer.affiliateUrl) continue;
    const mapping = context.modelPartComponent;
    await persistFerrariDiscoveredOffer(prisma, {
      offer: {
        provider: "EBAY",
        externalItemId: offer.externalItemId,
        title: offer.title,
        subtitle: offer.subtitle,
        priceCents: offer.priceCents,
        currency: offer.currency,
        condition: offer.condition,
        sellerName: offer.sellerName,
        sellerFeedbackPercentage: offer.sellerFeedbackPercentage,
        sellerQualityScore: offer.sellerQualityScore,
        imageUrl: offer.imageUrl,
        additionalImageUrls: asStringArray(offer.additionalImageUrls),
        affiliateUrl: offer.affiliateUrl,
        sourceUrl: offer.sourceUrl,
        affiliateReferenceId: offer.affiliateReferenceId || "ferrari_catalog_rebuild",
        itemEndDate: offer.itemEndDate,
        confidence: ["EXACT_MATCH", "HIGH_CONFIDENCE", "HIGH"].includes(offer.fitmentConfidence)
          ? "HIGH_CONFIDENCE"
          : offer.fitmentConfidence === "LIKELY_COMPATIBLE"
            ? "LIKELY_COMPATIBLE"
            : "POSSIBLE_MATCH",
        confidenceScore: offer.confidenceScore,
        oemMatchType: offer.oemMatchType === "EXACT" ? "EXACT" : "NONE",
        genuineOemStatus: offer.genuineOemStatus === "CLAIMED" ? "CLAIMED" : "NOT_STATED",
        compatibilityStatus: offer.compatibilityStatus === "MARKETPLACE_MATCH"
          ? "MARKETPLACE_MATCH"
          : offer.compatibilityStatus === "MODEL_NAMED" ? "MODEL_NAMED" : "UNKNOWN",
        shippingCostCents: offer.shippingCostCents,
        shippingCurrency: offer.shippingCurrency,
        itemLocation: offer.itemLocation,
        marketplaceCategoryId: offer.marketplaceCategoryId,
        structuredBrand: null,
        structuredManufacturerPartNumber: null,
        structuredOemPartNumber: null,
        compatibilityData: asRecord(offer.compatibilityData),
        quantityAvailable: offer.quantityAvailable,
        searchQuery: context.searchQuery,
        matchReasons: asStringArray(context.matchReasons),
      },
      partnerId: partner.affiliatePartnerId,
      providerId: partner.id,
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
      now: new Date(),
      expiresAt: offer.expiresAt ?? new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
    });
    processed += 1;
  }
  const clearedOemLabels = await prisma.$executeRaw`
    UPDATE "PartOffer" AS offer
    SET "oemPartNumber" = NULL
    WHERE offer."provider" = 'EBAY'
      AND offer."oemPartNumber" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "PartIdentifier" AS identifier
        WHERE identifier."partId" = offer."partId"
          AND identifier."type" = 'OEM'
          AND identifier."confidence" = 'HIGH'
          AND identifier."normalizedValue" = offer."oemPartNumber"
      )
  `;
  const clearedMpnLabels = await prisma.$executeRaw`
    UPDATE "PartOffer" AS offer
    SET "manufacturerPartNumber" = NULL
    WHERE offer."provider" = 'EBAY'
      AND offer."manufacturerPartNumber" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "PartIdentifier" AS identifier
        WHERE identifier."partId" = offer."partId"
          AND identifier."type" = 'MPN'
          AND identifier."confidence" = 'HIGH'
          AND identifier."normalizedValue" = offer."manufacturerPartNumber"
      )
  `;
  const retired = identifiersOnly ? { count: 0 } : await prisma.performancePart.updateMany({
    where: {
      sourceCatalog: "EBAY_PRODUCT_FAMILY",
      status: "ACTIVE",
      offers: { none: {} },
      installedParts: { none: {} },
      clicks: { none: {} },
      maintenanceLinks: { none: {} },
    },
    data: { status: "RETIRED" },
  });
  console.log(JSON.stringify({
    processedOffers: processed,
    retiredOrphanFamilies: retired.count,
    clearedUnverifiedOemLabels: clearedOemLabels,
    clearedUnverifiedMpnLabels: clearedMpnLabels,
  }, null, 2));
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
