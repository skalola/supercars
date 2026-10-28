import { prisma } from "@/lib/prisma";
import { USER_PART_SELLER_POLICY_VERSION } from "@/lib/parts/user-part-compliance-policy";

const USER_PART_RESULT_LIMIT = 20;

export async function getCompatibleUserPartOffers(input: {
  makeId: string;
  modelId: string;
  componentTypeId: string;
  year: number | null;
}) {
  const rows = await prisma.userPartListing.findMany({
    where: {
      status: "ACTIVE",
      quantity: { gt: 0 },
      componentTypeId: input.componentTypeId,
      sellerPolicyVersion: USER_PART_SELLER_POLICY_VERSION,
      sellerAttestedAt: { not: null },
      images: { some: { validationStatus: "VALID" } },
      seller: { sellerPaymentAccount: { is: { onboardingStatus: "READY", chargesEnabled: true, payoutsEnabled: true } } },
      OR: [
        { universalFitment: true },
        { fitments: { some: {
          makeId: input.makeId,
          modelId: input.modelId,
          ...(input.year ? { AND: [
            { OR: [{ yearStart: null }, { yearStart: { lte: input.year } }] },
            { OR: [{ yearEnd: null }, { yearEnd: { gte: input.year } }] },
          ] } : {}),
        } } },
      ],
    },
    select: {
      id: true, title: true, condition: true, priceCents: true, currency: true,
      shippingCostCents: true, brandName: true, manufacturerPartNumber: true,
      universalFitment: true,
      seller: { select: { username: true, name: true } },
      brand: { select: { name: true } },
      images: {
        where: { validationStatus: "VALID" },
        select: { url: true },
        orderBy: [{ isPrimary: "desc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
        take: 1,
      },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: USER_PART_RESULT_LIMIT,
  });

  return rows.flatMap((row) => {
    if (!row.seller.username || !row.images[0]) return [];
    return [{
      id: row.id,
      provider: "GARAGE_OWNER",
      providerType: "USER_MARKETPLACE",
      externalItemId: row.id,
      title: row.title,
      priceCents: row.priceCents,
      currency: row.currency,
      condition: row.condition,
      sellerName: row.seller.name || row.seller.username,
      sellerFeedbackPercentage: null,
      imageUrl: row.images[0].url,
      manufacturer: row.brand?.name || row.brandName || "Garage Owner",
      manufacturerPartNumber: row.manufacturerPartNumber,
      oemPartNumber: null,
      classification: "USER_LISTING",
      shippingCostCents: row.shippingCostCents,
      shippingCurrency: row.currency,
      genuineOemStatus: "UNKNOWN",
      compatibilityStatus: row.universalFitment ? "UNIVERSAL" : "SELLER_DECLARED",
      fitmentConfidence: row.universalFitment ? "UNIVERSAL" : "SELLER_DECLARED_EXACT_MODEL",
      confidenceScore: row.universalFitment ? 55 : 75,
      matchReasons: row.universalFitment ? ["Seller marked universal fitment"] : ["Seller-declared make, model, and year fitment"],
      rankReason: "Owner-listed part with matching fitment",
      rankExplanation: "Displayed after qualified direct suppliers and before marketplace fallback offers.",
      rankScore: 0,
      qualityTier: "GOOD",
      itemAffiliateWebUrl: null,
      buyUrl: `/garage/${encodeURIComponent(row.seller.username)}?tab=partsForSale&listing=${encodeURIComponent(row.id)}`,
      offerKind: "USER_LISTING" as const,
    }];
  });
}

export function prioritizeStorefrontOffers<
  S extends { provider: string; offerKind?: string },
  U extends { provider: string; offerKind?: string; fitmentConfidence?: string | null },
>(supplierOffers: S[], userOffers: U[]): Array<S | U> {
  const direct = supplierOffers.filter((offer) => offer.provider.toUpperCase() !== "EBAY");
  const fallback = supplierOffers.filter((offer) => offer.provider.toUpperCase() === "EBAY");
  const rankedUserOffers = [...userOffers].sort(
    (left, right) => userFitmentPriority(right.fitmentConfidence) - userFitmentPriority(left.fitmentConfidence),
  );
  return [...direct, ...rankedUserOffers, ...fallback];
}

function userFitmentPriority(confidence?: string | null) {
  if (confidence === "SELLER_DECLARED_EXACT_VARIANT") return 4;
  if (confidence === "SELLER_DECLARED_EXACT_MODEL") return 3;
  if (confidence === "SELLER_DECLARED") return 2;
  if (confidence === "UNIVERSAL") return 1;
  return 0;
}

export function paginateStorefrontOffers<T>(offers: T[], page: number, pageSize: number) {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const start = (safePage - 1) * safePageSize;
  return {
    items: offers.slice(start, start + safePageSize),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total: offers.length,
      hasPrevious: safePage > 1,
      hasMore: offers.length > start + safePageSize,
    },
  };
}
