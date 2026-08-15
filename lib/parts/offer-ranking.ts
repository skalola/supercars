export type OfferRankReason =
  | "DIRECT_PARTNER"
  | "FACTORY_PREFERRED"
  | "PREFERRED_AFFILIATE"
  | "AUTHORIZED_RETAILER"
  | "EXACT_OEM"
  | "EXACT_MPN"
  | "VERIFIED_FITMENT"
  | "HIGH_CONFIDENCE_MARKETPLACE"
  | "GENERIC_MARKETPLACE";

export type RankablePartOffer = {
  id: string;
  providerCode: string;
  providerType: string;
  providerActive: boolean;
  partBrandId?: string | null;
  canonicalOemPartNumber?: string | null;
  canonicalManufacturerPartNumber?: string | null;
  affiliateUrl?: string | null;
  confidenceScore: number;
  fitmentConfidence?: string | null;
  oemMatchType?: string | null;
  manufacturerPartNumber?: string | null;
  oemPartNumber?: string | null;
  priceCents?: number | null;
  brandName?: string | null;
  genuineOemStatus?: string | null;
  sellerFeedbackPercentage?: number | null;
  condition?: string | null;
};

export type PreferredBrandRankContext = {
  partBrandId: string;
  name?: string;
  relationshipType: string;
  priority: number;
  affiliateEnabled: boolean;
  affiliateStatus: string;
  providerCode?: string | null;
  brandType?: string | null;
  qualityWeight?: number | null;
};

export function rankPartOffers<T extends RankablePartOffer>(input: {
  offers: T[];
  preferredBrands?: PreferredBrandRankContext[];
  canonicalOemPartNumber?: string | null;
  canonicalManufacturerPartNumber?: string | null;
}) {
  const preferredByBrand = new Map((input.preferredBrands ?? []).map((brand) => [brand.partBrandId, brand]));
  const preferredByName = new Map((input.preferredBrands ?? []).filter((brand) => brand.name).map((brand) => [normalizeBrand(brand.name!), brand]));
  return input.offers
    .map((offer) => {
      const preferred = (offer.partBrandId ? preferredByBrand.get(offer.partBrandId) : undefined)
        ?? (offer.brandName ? preferredByName.get(normalizeBrand(offer.brandName)) : undefined);
      const ranked = scoreOffer(offer, preferred, input);
      return { ...offer, ...ranked, qualityTier: classifyQualityTier(offer, preferred, ranked.rankReason) };
    })
    .sort((left, right) =>
      right.rankScore - left.rankScore ||
      right.confidenceScore - left.confidenceScore ||
      (left.priceCents ?? Number.MAX_SAFE_INTEGER) - (right.priceCents ?? Number.MAX_SAFE_INTEGER),
    );
}

export type PartOfferQualityTier = "OEM" | "BEST" | "BETTER" | "GOOD" | "GENERIC";

function classifyQualityTier(
  offer: RankablePartOffer,
  preferred: PreferredBrandRankContext | undefined,
  rankReason: OfferRankReason,
): PartOfferQualityTier {
  const highFitment = Boolean(offer.fitmentConfidence && ["EXACT_MATCH", "HIGH_CONFIDENCE", "HIGH"].includes(offer.fitmentConfidence));
  const factoryRelationship = Boolean(preferred && ["FACTORY", "FACTORY_PERFORMANCE"].includes(preferred.relationshipType));
  const premiumBrand = Boolean(preferred && ["FACTORY_PERFORMANCE", "PREMIUM_PERFORMANCE"].includes(preferred.brandType ?? ""));
  if (
    offer.genuineOemStatus === "VERIFIED" ||
    (factoryRelationship && highFitment && offer.confidenceScore >= 70)
  ) return "OEM";
  if (
    (["DIRECT_PARTNER", "FACTORY_PREFERRED", "PREFERRED_AFFILIATE"].includes(rankReason) || premiumBrand)
    && highFitment
    && offer.confidenceScore >= 70
  ) return "BEST";
  if (["EXACT_OEM", "EXACT_MPN"].includes(rankReason) || preferred || (highFitment && offer.confidenceScore >= 75)) return "BETTER";
  if (
    offer.confidenceScore >= 60 &&
    (highFitment || (offer.sellerFeedbackPercentage ?? 0) >= 95)
  ) return "GOOD";
  return "GENERIC";
}

function scoreOffer(
  offer: RankablePartOffer,
  preferred: PreferredBrandRankContext | undefined,
  canonical: { canonicalOemPartNumber?: string | null; canonicalManufacturerPartNumber?: string | null },
): { rankScore: number; rankReason: OfferRankReason; rankExplanation: string } {
  const affiliateActive = preferred?.affiliateEnabled && ["APPROVED", "ACTIVE"].includes(preferred.affiliateStatus);
  const providerMatches = !preferred?.providerCode || preferred.providerCode === offer.providerCode;
  if (offer.providerActive && offer.affiliateUrl && affiliateActive && providerMatches && offer.providerType === "DIRECT_AFFILIATE") {
    return rank(1000 - preferred.priority, "DIRECT_PARTNER", "Active direct affiliate partner for this vehicle and component scope.");
  }
  if (offer.providerActive && offer.affiliateUrl && affiliateActive && providerMatches && ["FACTORY", "FACTORY_PERFORMANCE"].includes(preferred.relationshipType)) {
    return rank(900 - preferred.priority, "FACTORY_PREFERRED", "Active factory or factory-performance source for this component.");
  }
  if (offer.providerActive && offer.affiliateUrl && affiliateActive && providerMatches) {
    return rank(800 - preferred.priority, "PREFERRED_AFFILIATE", "Approved preferred-brand affiliate offer for this component.");
  }
  if (offer.providerActive && offer.providerType === "AUTHORIZED_RETAILER") {
    return rank(700, "AUTHORIZED_RETAILER", "Offer is supplied by a configured authorized retailer.");
  }
  if (
    offer.oemMatchType === "EXACT" ||
    sameIdentifier(offer.oemPartNumber, offer.canonicalOemPartNumber ?? canonical.canonicalOemPartNumber)
  ) {
    return rank(600 + offer.confidenceScore, "EXACT_OEM", "Marketplace offer has an exact OEM-number match.");
  }
  if (sameIdentifier(
    offer.manufacturerPartNumber,
    offer.canonicalManufacturerPartNumber ?? canonical.canonicalManufacturerPartNumber,
  )) {
    return rank(550 + offer.confidenceScore, "EXACT_MPN", "Marketplace offer has an exact manufacturer part-number match.");
  }
  if (offer.fitmentConfidence && ["EXACT_MATCH", "HIGH_CONFIDENCE", "HIGH"].includes(offer.fitmentConfidence)) {
    return rank(500 + offer.confidenceScore, "VERIFIED_FITMENT", "Offer passed high-confidence vehicle and component fitment checks.");
  }
  if (offer.confidenceScore >= 60) {
    return rank(400 + offer.confidenceScore, "HIGH_CONFIDENCE_MARKETPLACE", "Marketplace offer passed the high-confidence quality threshold.");
  }
  return rank(300 + offer.confidenceScore, "GENERIC_MARKETPLACE", "Marketplace fallback with limited product-identity evidence.");
}

function rank(rankScore: number, rankReason: OfferRankReason, rankExplanation: string) {
  return { rankScore, rankReason, rankExplanation };
}

function sameIdentifier(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false;
  return normalizeIdentifier(left) === normalizeIdentifier(right);
}

function normalizeIdentifier(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeBrand(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
