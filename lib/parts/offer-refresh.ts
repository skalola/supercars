import type { PrismaClient } from "@prisma/client";
import { EBAY_PART_OFFER_PROVIDER } from "@/lib/ebay/browse.server";
import { ensureEbayOfferProvider } from "@/lib/parts/ebay-partner";
import { buildPartOfferContentHash } from "@/lib/parts/offer-content-hash";

const DEFAULT_OFFER_TTL_MS = 24 * 60 * 60 * 1000;
const OFFER_HEARTBEAT_MS = 12 * 60 * 60 * 1000;

export type EbayRefreshReport = {
  partsChecked: number;
  offersActive: number;
  affiliateEnabledOffers: number;
  partsWithoutOffers: number;
  offersChecked: number;
  offersUnchanged: number;
  offerWritesAvoided: number;
  offersUpdated: number;
  offersInserted: number;
  offersExpired: number;
  failedParts: Array<{ partId: string; error: string }>;
};

export async function refreshEbayOffersForMake(
  prisma: PrismaClient,
  options: { makeSlug: string; limit?: number; staleBefore?: Date },
) {
  const make = await prisma.make.findUnique({ where: { slug: options.makeSlug }, select: { name: true } });
  if (!make) throw new Error(`Make not found: ${options.makeSlug}`);
  const report: EbayRefreshReport = {
    partsChecked: 0,
    offersActive: 0,
    affiliateEnabledOffers: 0,
    partsWithoutOffers: 0,
    offersChecked: 0,
    offersUnchanged: 0,
    offerWritesAvoided: 0,
    offersUpdated: 0,
    offersInserted: 0,
    offersExpired: 0,
    failedParts: [],
  };
  const run = await prisma.partSourceRun.create({
    data: { source: "EBAY_BROWSE_API", runType: "OFFER_REFRESH", makeSlug: options.makeSlug },
    select: { id: true },
  });
  const provider = await ensureEbayOfferProvider(prisma);

  try {
    const parts = await prisma.performancePart.findMany({
      where: {
        status: "ACTIVE",
        compatibility: { some: { model: { make: { slug: options.makeSlug } } } },
        NOT: { sourceName: { contains: "test", mode: "insensitive" } },
        ...(options.staleBefore ? { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: options.staleBefore } }] } : {}),
      },
      select: {
        id: true,
        name: true,
        oemPartNumber: true,
        category: { select: { slug: true } },
        brand: { select: { name: true } },
        compatibility: {
          where: { model: { make: { slug: options.makeSlug } } },
          select: { model: { select: { name: true } } },
          take: 25,
        },
      },
      orderBy: { updatedAt: "asc" },
      take: options.limit ?? 100,
    });

    for (const part of parts) {
      report.partsChecked += 1;
      try {
        const offers = await EBAY_PART_OFFER_PROVIDER.searchOffers({
          makeName: make.name,
          partId: part.id,
          partName: part.name,
          manufacturer: part.brand.name,
          oemPartNumber: part.oemPartNumber,
          categorySlug: part.category.slug,
          compatibleModels: [...new Set(part.compatibility.map((fitment) => fitment.model?.name).filter(isPresent))],
        });
        report.offersChecked += offers.length;
        const externalItemIds = offers.map((offer) => offer.externalItemId);
        const existingOffers = externalItemIds.length
          ? await prisma.partOffer.findMany({
            where: { provider: "EBAY", externalItemId: { in: externalItemIds } },
            select: { id: true, externalItemId: true, partId: true, contentHash: true, active: true, lastSeenAt: true },
          })
          : [];
        const existingByItemId = new Map(existingOffers.map((offer) => [offer.externalItemId, offer]));
        const seenIds: string[] = [];
        let persistedOfferCount = 0;
        let persistedAffiliateOfferCount = 0;
        for (const offer of offers) {
          const existingOffer = existingByItemId.get(offer.externalItemId);
          if (existingOffer && existingOffer.partId !== part.id) continue;
          seenIds.push(offer.externalItemId);
          const expiresAt = offer.itemEndDate && offer.itemEndDate > new Date()
            ? offer.itemEndDate
            : new Date(Date.now() + DEFAULT_OFFER_TTL_MS);
          const contentHash = buildPartOfferContentHash({
            ...offer,
            fitmentConfidence: offer.confidence,
          });
          if (existingOffer?.contentHash === contentHash) {
            report.offersUnchanged += 1;
            report.offerWritesAvoided += 1;
            if (!existingOffer.active || existingOffer.lastSeenAt < new Date(Date.now() - OFFER_HEARTBEAT_MS)) {
              await prisma.partOffer.update({
                where: { id: existingOffer.id },
                data: {
                  active: true,
                  availability: "AVAILABLE",
                  lastSeenAt: new Date(),
                  lastCheckedAt: new Date(),
                  expiresAt,
                },
              });
            }
          } else if (existingOffer) {
            await prisma.partOffer.update({
              where: { id: existingOffer.id },
              data: {
              affiliatePartnerId: provider.affiliatePartnerId,
              providerId: provider.id,
              title: offer.title,
              priceCents: offer.priceCents,
              currency: offer.currency,
              condition: offer.condition,
              sellerName: offer.sellerName,
              sellerFeedbackPercentage: offer.sellerFeedbackPercentage,
              sellerQualityScore: offer.sellerQualityScore,
              imageUrl: offer.imageUrl,
              affiliateUrl: offer.affiliateUrl,
              sourceUrl: offer.sourceUrl,
              availability: "AVAILABLE",
              oemMatchType: offer.oemMatchType,
              genuineOemStatus: offer.genuineOemStatus,
              compatibilityStatus: offer.compatibilityStatus,
              fitmentConfidence: offer.confidence,
              confidenceScore: offer.confidenceScore,
              contentHash,
              shippingCostCents: offer.shippingCostCents,
              shippingCurrency: offer.shippingCurrency,
              affiliateReferenceId: offer.affiliateReferenceId,
              itemEndDate: offer.itemEndDate,
              lastSeenAt: new Date(),
              lastCheckedAt: new Date(),
              expiresAt,
              active: true,
              },
            });
            report.offersUpdated += 1;
          } else {
            await prisma.partOffer.create({
              data: {
              partId: part.id,
              affiliatePartnerId: provider.affiliatePartnerId,
              providerId: provider.id,
              provider: offer.provider,
              externalItemId: offer.externalItemId,
              title: offer.title,
              priceCents: offer.priceCents,
              currency: offer.currency,
              condition: offer.condition,
              sellerName: offer.sellerName,
              sellerFeedbackPercentage: offer.sellerFeedbackPercentage,
              sellerQualityScore: offer.sellerQualityScore,
              imageUrl: offer.imageUrl,
              affiliateUrl: offer.affiliateUrl,
              sourceUrl: offer.sourceUrl,
              availability: "AVAILABLE",
              oemMatchType: offer.oemMatchType,
              genuineOemStatus: offer.genuineOemStatus,
              compatibilityStatus: offer.compatibilityStatus,
              fitmentConfidence: offer.confidence,
              confidenceScore: offer.confidenceScore,
              contentHash,
              shippingCostCents: offer.shippingCostCents,
              shippingCurrency: offer.shippingCurrency,
              affiliateReferenceId: offer.affiliateReferenceId,
              itemEndDate: offer.itemEndDate,
              expiresAt,
              },
            });
            report.offersInserted += 1;
          }
          persistedOfferCount += 1;
          if (offer.affiliateUrl) persistedAffiliateOfferCount += 1;
        }
        const expired = await prisma.partOffer.updateMany({
          where: {
            partId: part.id,
            provider: "EBAY",
            active: true,
            ...(seenIds.length ? { externalItemId: { notIn: seenIds } } : {}),
          },
          data: { active: false, availability: "STALE", lastCheckedAt: new Date() },
        });
        report.offersExpired += expired.count;
        await prisma.performancePart.update({ where: { id: part.id }, data: { lastCheckedAt: new Date() } });
        if (persistedOfferCount === 0) report.partsWithoutOffers += 1;
        report.offersActive += persistedOfferCount;
        report.affiliateEnabledOffers += persistedAffiliateOfferCount;
      } catch (error) {
        report.failedParts.push({ partId: part.id, error: getErrorMessage(error) });
      }
    }
    await prisma.partSourceRun.update({
      where: { id: run.id },
      data: {
        status: report.failedParts.length ? "PARTIAL" : "COMPLETED",
        stats: report,
        errorSummary: report.failedParts.length ? `${report.failedParts.length} part refreshes failed.` : null,
        completedAt: new Date(),
      },
    });
    return report;
  } catch (error) {
    await prisma.partSourceRun.update({
      where: { id: run.id },
      data: { status: "FAILED", errorSummary: getErrorMessage(error), stats: report, completedAt: new Date() },
    });
    throw error;
  }
}

export function refreshFerrariEbayOffers(
  prisma: PrismaClient,
  options: { limit?: number; staleBefore?: Date } = {},
) {
  return refreshEbayOffersForMake(prisma, { ...options, makeSlug: "ferrari" });
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown eBay refresh error";
}
