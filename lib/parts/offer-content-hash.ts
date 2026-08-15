import { createHash } from "node:crypto";

export type PartOfferHashInput = {
  provider: string;
  externalItemId: string;
  title: string;
  priceCents: number | null;
  currency: string;
  condition: string | null;
  sellerName: string | null;
  sellerFeedbackPercentage: number | null;
  sellerQualityScore: number | null;
  imageUrl: string | null;
  affiliateUrl: string | null;
  sourceUrl: string | null;
  availability?: string | null;
  oemMatchType: string;
  genuineOemStatus: string;
  compatibilityStatus: string;
  fitmentConfidence: string;
  confidenceScore: number;
  shippingCostCents: number | null;
  shippingCurrency: string | null;
  affiliateReferenceId: string | null;
  itemEndDate: Date | null;
};

export function buildPartOfferContentHash(offer: PartOfferHashInput) {
  return createHash("sha256").update(JSON.stringify({
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
    availability: offer.availability ?? "AVAILABLE",
    oemMatchType: offer.oemMatchType,
    genuineOemStatus: offer.genuineOemStatus,
    compatibilityStatus: offer.compatibilityStatus,
    fitmentConfidence: offer.fitmentConfidence,
    confidenceScore: offer.confidenceScore,
    shippingCostCents: offer.shippingCostCents,
    shippingCurrency: offer.shippingCurrency,
    affiliateReferenceId: offer.affiliateReferenceId,
    itemEndDate: offer.itemEndDate?.toISOString() ?? null,
  })).digest("hex");
}
