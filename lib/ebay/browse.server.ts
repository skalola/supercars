import { getEbayApplicationToken } from "@/lib/ebay/oauth.server";
import { scoreComponentOffer, scoreOffer, type OfferConfidence } from "@/lib/parts/offer-quality";
import { normalizeOemPartNumber } from "@/lib/parts/ferrari-taxonomy";
import type { CanonicalPartOfferQuery, PartOfferProviderAdapter } from "@/lib/parts/offers/provider";
import { resolveEbayFitmentCategories, resolveEbayVehicleFitment, verifyAndCacheEbayFitmentCategories } from "@/lib/ebay/taxonomy.server";

const EBAY_BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const EBAY_MARKETPLACE_ID = "EBAY_US";

type EbayPrice = { value?: string; currency?: string };
type EbaySeller = { username?: string; feedbackPercentage?: string };
type EbayImage = { imageUrl?: string };
type EbayItemLocation = { city?: string; stateOrProvince?: string; postalCode?: string; country?: string };
type EbayLocalizedAspect = { name?: string; value?: string };

type EbayItemSummary = {
  itemId?: string;
  title?: string;
  condition?: string;
  price?: EbayPrice;
  seller?: EbaySeller;
  image?: EbayImage;
  additionalImages?: EbayImage[];
  subtitle?: string;
  shortDescription?: string;
  itemAffiliateWebUrl?: string;
  itemWebUrl?: string;
  itemEndDate?: string;
  compatibilityMatch?: string;
  compatibilityProperties?: Array<{ name?: string; localizedName?: string; value?: string }>;
  itemLocation?: EbayItemLocation;
  categories?: Array<{ categoryId?: string; categoryName?: string }>;
  localizedAspects?: EbayLocalizedAspect[];
  quantityLimitPerBuyer?: number;
  shippingOptions?: Array<{ shippingCost?: EbayPrice }>;
};

type EbaySearchResponse = {
  itemSummaries?: EbayItemSummary[];
  warnings?: Array<{ message?: string }>;
};

export type EbayPartSearchInput = CanonicalPartOfferQuery;

export type EbayPartOffer = {
  provider: "EBAY";
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
  affiliateReferenceId: string;
  itemEndDate: Date | null;
  confidence: Exclude<OfferConfidence, "REJECTED">;
  confidenceScore: number;
  oemMatchType: "EXACT" | "NONE";
  genuineOemStatus: "CLAIMED" | "NOT_STATED";
  compatibilityStatus: "MARKETPLACE_MATCH" | "MODEL_NAMED" | "UNKNOWN";
  shippingCostCents: number | null;
  shippingCurrency: string | null;
  subtitle: string | null;
  additionalImageUrls: string[];
  itemLocation: string | null;
  marketplaceCategoryId: string | null;
  structuredBrand: string | null;
  structuredManufacturerPartNumber: string | null;
  structuredOemPartNumber: string | null;
  compatibilityData: Record<string, unknown> | null;
  quantityAvailable: number | null;
};

export type EbayComponentSearchInput = {
  providerId?: string;
  modelId?: string;
  componentTypeId?: string;
  makeName?: string;
  makeSlug?: string;
  modelName: string;
  componentName: string;
  templates: string[];
  knownModels?: string[];
  knownFerrariModels?: string[];
  knownMakes?: string[];
  knownBrands: string[];
  aliases?: string[];
  identifiers?: string[];
  fitmentRisk?: "LOW" | "MEDIUM" | "HIGH";
  categorySlug?: string;
  year?: number | null;
  referenceId: string;
  limit?: number;
  includeDiagnostics?: boolean;
};

export type EbayComponentOffer = EbayPartOffer & {
  searchQuery: string;
  matchReasons: string[];
};

export const EBAY_PART_OFFER_PROVIDER: PartOfferProviderAdapter<EbayPartOffer> = {
  provider: "EBAY",
  providerType: "EBAY",
  searchOffers: searchEbayOffersForPart,
  buildAffiliateUrl: (offer) => offer.affiliateUrl,
  validateOffer: (offer) => ({
    valid: Boolean(offer.externalItemId && offer.title && offer.affiliateUrl),
    reason: offer.affiliateUrl ? undefined : "Affiliate URL is missing.",
  }),
  searchPartTypeOffers: (input) => searchEbayOffersForComponent({
    providerId: input.providerId,
    modelId: input.modelId,
    componentTypeId: input.partTypeId,
    makeName: input.makeName,
    makeSlug: input.makeSlug,
    modelName: input.modelName,
    componentName: input.partTypeName,
    templates: input.templates ?? [],
    knownModels: input.knownModels ?? [],
    knownMakes: input.knownMakes ?? [],
    knownBrands: input.knownBrands ?? [],
    aliases: input.aliases,
    identifiers: input.identifiers,
    fitmentRisk: input.fitmentRisk,
    categorySlug: input.systemSlug,
    year: input.year,
    referenceId: input.referenceId,
    limit: input.limit,
  }),
};

export async function searchEbayOffersForPart(input: EbayPartSearchInput) {
  assertServerRuntime();
  const affiliateReferenceId = buildEbayAffiliateReference(input);
  const makeName = input.makeName?.trim() || "Ferrari";
  const primaryQuery = input.oemPartNumber
    ? `${makeName} ${normalizeOemPartNumber(input.oemPartNumber)}`
    : `${makeName} ${input.compatibleModels[0] || ""} ${input.partName}`;
  let candidates = await browseSearch(primaryQuery, affiliateReferenceId, input.limit ?? 20);
  let offers = normalizeAndScore(candidates, input, affiliateReferenceId);

  if (!offers.some((offer) => offer.confidence === "EXACT_MATCH" || offer.confidence === "HIGH_CONFIDENCE") && input.oemPartNumber) {
    const fallbackQuery = `${makeName} ${input.compatibleModels[0] || ""} ${input.partName}`.replace(/\s+/g, " ").trim();
    candidates = [...candidates, ...(await browseSearch(fallbackQuery, affiliateReferenceId, input.limit ?? 20))];
    offers = normalizeAndScore(candidates, input, affiliateReferenceId);
  }

  return offers
    .filter((offer) => offer.confidence === "EXACT_MATCH" || offer.confidence === "HIGH_CONFIDENCE" || offer.confidence === "LIKELY_COMPATIBLE")
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, input.limit ?? 20);
}

export const searchEbayOffersForFerrariPart = searchEbayOffersForPart;

export async function searchEbayOffersForComponent(input: EbayComponentSearchInput) {
  assertServerRuntime();
  const plans = buildComponentSearchPlans(input).slice(0, 10);
  const makeName = input.makeName?.trim() || "Ferrari";
  const candidates: ComponentCandidate[] = [];
  const taxonomyQueries: string[] = [];
  let taxonomyCategoryFound = false;
  if (input.providerId && input.modelId && input.componentTypeId && input.year) {
    const categories = await resolveEbayFitmentCategories({
      providerId: input.providerId,
      componentTypeId: input.componentTypeId,
      componentName: input.componentName,
      aliases: input.aliases,
    }).catch(() => []);
    for (const category of categories) {
      const fitment = await resolveEbayVehicleFitment({
        providerId: input.providerId,
        category,
        modelId: input.modelId,
        year: input.year,
        makeName,
        modelName: input.modelName,
      }).catch(() => null);
      if (!fitment) continue;
      taxonomyCategoryFound = true;
      const query = [input.componentName, ...(input.aliases ?? []).slice(0, 1)].join(" ");
      taxonomyQueries.push(`${category.categoryId}:${query}`);
      const items = await browseSearch(query, input.referenceId, Math.min(input.limit ?? 20, 25), {
        categoryId: category.categoryId,
        compatibility: fitment,
      }).catch(() => []);
      candidates.push(...items.map((item) => ({ query, item, requiredCompatibility: fitment })));
      const current = normalizeComponentCandidates(candidates, input);
      if (current.offers.length >= Math.min(8, input.limit ?? 20)) break;
    }
  }
  let motorsCategoryId: string | null = null;
  for (const plan of candidates.length > 0 ? plans.slice(0, 2) : plans) {
    let items: EbayItemSummary[];
    try {
      items = await browseSearch(plan.query, input.referenceId, Math.min(input.limit ?? 20, 25), {
        categoryId: motorsCategoryId,
        compatibility: motorsCategoryId && input.year
          ? { year: input.year, make: makeName, model: input.modelName }
          : null,
      });
    } catch (error) {
      if (!(error instanceof EbayBrowseError) || error.status !== 400 || !motorsCategoryId) throw error;
      items = await browseSearch(plan.query, input.referenceId, Math.min(input.limit ?? 20, 25));
    }
    candidates.push(...items.map((item) => ({ query: plan.query, item })));
    if (!taxonomyCategoryFound && input.providerId && input.modelId && input.componentTypeId && input.year) {
      const categories = await verifyAndCacheEbayFitmentCategories({
        providerId: input.providerId,
        componentTypeId: input.componentTypeId,
        categories: items.flatMap((item) => (item.categories ?? []).flatMap((category) => category.categoryId
          ? [{ categoryId: category.categoryId, categoryName: category.categoryName ?? null }]
          : [])),
      }).catch(() => []);
      for (const category of categories) {
        const fitment = await resolveEbayVehicleFitment({
          providerId: input.providerId,
          category,
          modelId: input.modelId,
          year: input.year,
          makeName,
          modelName: input.modelName,
        }).catch(() => null);
        if (!fitment) continue;
        taxonomyCategoryFound = true;
        taxonomyQueries.push(`${category.categoryId}:${plan.query}`);
        const compatibleItems = await browseSearch(plan.query, input.referenceId, Math.min(input.limit ?? 20, 25), {
          categoryId: category.categoryId,
          compatibility: fitment,
        }).catch(() => []);
        candidates.unshift(...compatibleItems.map((item) => ({ query: plan.query, item, requiredCompatibility: fitment })));
      }
    }
    motorsCategoryId ??= inferDominantAutomotiveCategory(items);
    const current = normalizeComponentCandidates(candidates, input);
    const strongCount = current.offers.filter((offer) => offer.confidence === "EXACT_MATCH" || offer.confidence === "HIGH_CONFIDENCE").length;
    if (strongCount >= Math.min(8, input.limit ?? 20)) break;
  }
  const result = normalizeComponentCandidates(candidates, input);
  return { ...result, queries: [...taxonomyQueries, ...plans.map((plan) => plan.query)], motorsCategoryId };
}

type ComponentCandidate = {
  query: string;
  item: EbayItemSummary;
  requiredCompatibility?: { year: number; make: string; model: string } | null;
};

export function hasRequiredCompatibilityEvidence(
  properties: EbayItemSummary["compatibilityProperties"],
  required: { year: number; make: string; model: string },
) {
  const values = new Map((properties ?? []).map((property) => [
    (property.name ?? property.localizedName ?? "").toLowerCase(),
    normalizeFitmentValue(property.value ?? ""),
  ]));
  return values.get("year") === String(required.year)
    && values.get("make") === normalizeFitmentValue(required.make)
    && values.get("model") === normalizeFitmentValue(required.model);
}

export function buildComponentSearchPlans(input: EbayComponentSearchInput) {
  const makeName = input.makeName?.trim() || "Ferrari";
  const exactIdentifiers = (input.identifiers ?? []).slice(0, 3).map((identifier) => ({
    stage: "EXACT_IDENTIFIER" as const,
    query: `${makeName} ${normalizeOemPartNumber(identifier)}`,
  }));
  const exact = [{
    stage: "VEHICLE_COMPONENT" as const,
    query: [input.year, makeName, input.modelName, input.componentName].filter(Boolean).join(" "),
  }, {
    stage: "VEHICLE_COMPONENT" as const,
    query: `${makeName} ${input.modelName} ${input.componentName}`,
  }];
  const aliases = (input.aliases ?? []).slice(0, 4).flatMap((alias) => ([
    input.year ? {
      stage: "VEHICLE_ALIAS" as const,
      query: `${input.year} ${makeName} ${input.modelName} ${alias}`,
    } : null,
    {
      stage: "VEHICLE_ALIAS" as const,
      query: `${makeName} ${input.modelName} ${alias}`,
    },
  ].filter((plan): plan is { stage: "VEHICLE_ALIAS"; query: string } => Boolean(plan))));
  const configured = input.templates.map((template) => ({
    stage: /\b(BMC|K&N|Novitec|Capristo|Akrapovic|Brembo|Michelin|Pirelli|Eventuri|Bosch|Mahle|Mann|NGK)\b/i.test(template)
      ? "KNOWN_BRAND" as const
      : "CONFIGURED" as const,
    query: interpolateComponentQuery(template, input),
  }));
  return [...new Map([...exactIdentifiers, ...exact, ...aliases, ...configured]
    .filter((plan) => plan.query)
    .map((plan) => [plan.query.toLowerCase(), plan])).values()];
}

function normalizeComponentCandidates(
  candidates: ComponentCandidate[],
  input: Omit<EbayComponentSearchInput, "templates">,
) {
  const seen = new Set<string>();
  const offers: EbayComponentOffer[] = [];
  const rejectionReasons: Record<string, number> = {};
  const candidatesDiagnostics: Array<{
    title: string;
    accepted: boolean;
    confidence: OfferConfidence;
    score: number;
    reasons: string[];
    affiliateUrlPresent: boolean;
  }> = [];
  let rejectedCount = 0;
  let missingAffiliateUrlCount = 0;
  for (const { query, item, requiredCompatibility } of candidates) {
    if (!item.itemId || !item.title || seen.has(item.itemId)) continue;
    seen.add(item.itemId);
    const priceCents = parsePriceCents(item.price);
    const sellerFeedbackPercentage = parseOptionalNumber(item.seller?.feedbackPercentage);
    const richFields = extractRichOfferFields(item);
    const quality = scoreComponentOffer({
      makeName: input.makeName?.trim() || "Ferrari",
      title: item.title,
      modelName: input.modelName,
      componentName: input.componentName,
      knownModels: input.knownModels ?? input.knownFerrariModels ?? [],
      knownMakes: input.knownMakes ?? [],
      knownBrands: input.knownBrands,
      year: input.year,
      condition: item.condition,
      sellerFeedbackPercentage,
      imageUrl: item.image?.imageUrl,
      priceCents,
      marketplaceCompatibilityMatch: item.compatibilityMatch,
      compatibilityProperties: item.compatibilityProperties,
      localizedAspects: item.localizedAspects,
      categoryNames: item.categories?.map((category) => category.categoryName || "").filter(Boolean),
      aliases: input.aliases,
      fitmentRisk: input.fitmentRisk,
      identifiers: input.identifiers,
    });
    const compatibilityMissing = requiredCompatibility
      ? !hasRequiredCompatibilityEvidence(item.compatibilityProperties, requiredCompatibility)
      : false;
    const rejectionReason = compatibilityMissing
      ? "eBay did not return exact Year/Make/Model compatibility evidence"
      : quality.confidence === "REJECTED"
      ? quality.reasons[0] || "Confidence threshold not met"
      : !item.itemAffiliateWebUrl
        ? "Affiliate URL missing from eBay Browse response"
        : null;
    if (input.includeDiagnostics && candidatesDiagnostics.length < 100) {
      candidatesDiagnostics.push({
        title: item.title,
        accepted: !rejectionReason,
        confidence: quality.confidence,
        score: quality.score,
        reasons: rejectionReason ? [rejectionReason, ...quality.reasons] : quality.reasons,
        affiliateUrlPresent: Boolean(item.itemAffiliateWebUrl),
      });
    }
    if (rejectionReason) {
      rejectedCount += 1;
      rejectionReasons[rejectionReason] = (rejectionReasons[rejectionReason] ?? 0) + 1;
      if (!item.itemAffiliateWebUrl) missingAffiliateUrlCount += 1;
      continue;
    }
    if (quality.confidence === "REJECTED" || !item.itemAffiliateWebUrl) continue;
    offers.push({
      provider: "EBAY",
      externalItemId: item.itemId,
      title: item.title,
      priceCents,
      currency: item.price?.currency || "USD",
      condition: item.condition || null,
      sellerName: item.seller?.username || null,
      sellerFeedbackPercentage,
      sellerQualityScore: quality.sellerQualityScore,
      imageUrl: item.image?.imageUrl || null,
      affiliateUrl: item.itemAffiliateWebUrl,
      sourceUrl: item.itemWebUrl || null,
      affiliateReferenceId: input.referenceId,
      itemEndDate: parseOptionalDate(item.itemEndDate),
      confidence: quality.confidence,
      confidenceScore: quality.score,
      oemMatchType: quality.oemMatchType,
      genuineOemStatus: quality.genuineOemStatus,
      compatibilityStatus: quality.compatibilityStatus,
      shippingCostCents: parsePriceCents(item.shippingOptions?.[0]?.shippingCost),
      shippingCurrency: item.shippingOptions?.[0]?.shippingCost?.currency || null,
      ...richFields,
      searchQuery: query,
      matchReasons: quality.reasons,
    });
  }

  return {
    offers: offers.sort((a, b) => b.confidenceScore - a.confidenceScore || (a.priceCents ?? Number.MAX_SAFE_INTEGER) - (b.priceCents ?? Number.MAX_SAFE_INTEGER)).slice(0, input.limit ?? 20),
    rejectedCount,
    examinedCount: seen.size,
    missingAffiliateUrlCount,
    rejectionReasons,
    candidateDiagnostics: input.includeDiagnostics ? candidatesDiagnostics : undefined,
  };
}

export async function searchEbayOffersForFerrariComponentQuery(
  input: Omit<EbayComponentSearchInput, "templates"> & { query: string },
) {
  assertServerRuntime();
  let items = await browseSearch(input.query, input.referenceId, Math.min(input.limit ?? 20, 50));
  let result = normalizeComponentCandidates(items.map((item) => ({ query: input.query, item })), input);
  const hasStrongOffer = result.offers.some((offer) => offer.confidence === "EXACT_MATCH" || offer.confidence === "HIGH_CONFIDENCE");
  const motorsCategoryId = inferDominantAutomotiveCategory(items);
  if (!hasStrongOffer && motorsCategoryId && input.year) {
    try {
      const compatibleItems = await browseSearch(input.query, input.referenceId, Math.min(input.limit ?? 20, 50), {
        categoryId: motorsCategoryId,
        compatibility: { year: input.year, make: input.makeName?.trim() || "Ferrari", model: input.modelName },
      });
      items = [...items, ...compatibleItems];
      result = normalizeComponentCandidates(items.map((item) => ({ query: input.query, item })), input);
    } catch (error) {
      if (!(error instanceof EbayBrowseError) || error.status !== 400) throw error;
    }
  }
  return { ...result, examinedCount: new Set(items.map((item) => item.itemId).filter(Boolean)).size, queries: [input.query], motorsCategoryId };
}

export function buildEbayAffiliateReference(input: Pick<EbayPartSearchInput, "makeName" | "partId" | "categorySlug" | "compatibleModels">) {
  const makeName = input.makeName?.trim() || "vehicle";
  const context = [makeName, input.compatibleModels[0], input.categorySlug, input.partId.slice(0, 8)]
    .filter(Boolean)
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 64);
  return context || `vehicle_part_${input.partId.slice(0, 8)}`;
}

async function browseSearch(
  query: string,
  affiliateReferenceId: string,
  limit: number,
  options: {
    categoryId?: string | null;
    compatibility?: { year: number; make: string; model: string } | null;
  } = {},
) {
  const campaignId = process.env.EBAY_EPN_CAMPAIGN_ID?.trim();
  if (!campaignId) throw new Error("EBAY_EPN_CAMPAIGN_ID is not configured.");
  const token = await getEbayApplicationToken();
  const url = new URL(EBAY_BROWSE_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 50)));
  url.searchParams.set("filter", "buyingOptions:{FIXED_PRICE}");
  if (options.categoryId) url.searchParams.set("category_ids", options.categoryId);
  if (options.categoryId && options.compatibility) {
    url.searchParams.set("compatibility_filter", [
      `Year:${options.compatibility.year}`,
      `Make:${options.compatibility.make}`,
      `Model:${options.compatibility.model}`,
    ].join(","));
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE_ID,
      "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${sanitizeHeaderValue(campaignId)},affiliateReferenceId=${sanitizeHeaderValue(affiliateReferenceId)}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = await readEbayError(response);
    throw new EbayBrowseError(response.status, detail, response.headers.get("retry-after"));
  }
  const payload = (await response.json()) as EbaySearchResponse;
  return payload.itemSummaries ?? [];
}

function normalizeFitmentValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export class EbayBrowseError extends Error {
  constructor(
    public readonly status: number,
    detail: string,
    public readonly retryAfter: string | null,
  ) {
    super(`eBay Browse search failed with HTTP ${status}${detail ? `: ${detail}` : "."}`);
    this.name = "EbayBrowseError";
  }
}

function normalizeAndScore(items: EbayItemSummary[], input: EbayPartSearchInput, affiliateReferenceId: string) {
  const seen = new Set<string>();
  const offers: EbayPartOffer[] = [];
  for (const item of items) {
    if (!item.itemId || !item.title || seen.has(item.itemId)) continue;
    seen.add(item.itemId);
    const priceCents = parsePriceCents(item.price);
    const sellerFeedbackPercentage = parseOptionalNumber(item.seller?.feedbackPercentage);
    const quality = scoreOffer({
      makeName: input.makeName,
      title: item.title,
      canonicalPartName: input.partName,
      canonicalManufacturer: input.manufacturer,
      oemPartNumber: input.oemPartNumber,
      compatibleModels: input.compatibleModels,
      condition: item.condition,
      sellerFeedbackPercentage,
      imageUrl: item.image?.imageUrl,
      priceCents,
      marketplaceCompatibilityMatch: item.compatibilityMatch,
    });
    if (quality.confidence === "REJECTED") continue;
    offers.push({
      provider: "EBAY",
      externalItemId: item.itemId,
      title: item.title,
      priceCents,
      currency: item.price?.currency || "USD",
      condition: item.condition || null,
      sellerName: item.seller?.username || null,
      sellerFeedbackPercentage,
      sellerQualityScore: quality.sellerQualityScore,
      imageUrl: item.image?.imageUrl || null,
      affiliateUrl: item.itemAffiliateWebUrl || null,
      sourceUrl: item.itemWebUrl || null,
      affiliateReferenceId,
      itemEndDate: parseOptionalDate(item.itemEndDate),
      confidence: quality.confidence,
      confidenceScore: quality.score,
      oemMatchType: quality.oemMatchType,
      genuineOemStatus: quality.genuineOemStatus,
      compatibilityStatus: quality.compatibilityStatus,
      shippingCostCents: parsePriceCents(item.shippingOptions?.[0]?.shippingCost),
      shippingCurrency: item.shippingOptions?.[0]?.shippingCost?.currency || null,
      ...extractRichOfferFields(item),
    });
  }
  return offers;
}

function extractRichOfferFields(item: EbayItemSummary): Pick<EbayPartOffer,
  "subtitle" | "additionalImageUrls" | "itemLocation" | "marketplaceCategoryId" | "structuredBrand" |
  "structuredManufacturerPartNumber" | "structuredOemPartNumber" | "compatibilityData" | "quantityAvailable"
> {
  const aspects = new Map((item.localizedAspects ?? [])
    .filter((aspect): aspect is Required<EbayLocalizedAspect> => Boolean(aspect.name && aspect.value))
    .map((aspect) => [aspect.name.toLowerCase(), aspect.value]));
  const location = item.itemLocation
    ? [item.itemLocation.city, item.itemLocation.stateOrProvince, item.itemLocation.postalCode, item.itemLocation.country]
      .filter(Boolean).join(", ")
    : null;
  return {
    subtitle: item.subtitle || item.shortDescription || null,
    additionalImageUrls: [...new Set((item.additionalImages ?? []).map((image) => image.imageUrl).filter(isPresent))].slice(0, 12),
    itemLocation: location || null,
    marketplaceCategoryId: item.categories?.[0]?.categoryId || null,
    structuredBrand: aspects.get("brand") || null,
    structuredManufacturerPartNumber: aspects.get("manufacturer part number") || aspects.get("mpn") || null,
    structuredOemPartNumber: aspects.get("oe/oem part number") || aspects.get("oem part number") || null,
    compatibilityData: item.compatibilityMatch || item.compatibilityProperties?.length
      ? {
          marketplaceMatch: item.compatibilityMatch ?? null,
          properties: item.compatibilityProperties ?? [],
          aspects: item.localizedAspects ?? [],
          categories: item.categories ?? [],
        }
      : null,
    quantityAvailable: Number.isInteger(item.quantityLimitPerBuyer) ? item.quantityLimitPerBuyer ?? null : null,
  };
}

function inferDominantAutomotiveCategory(items: EbayItemSummary[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const category of item.categories ?? []) {
      if (!category.categoryId || !/part|filter|brake|engine|exhaust|suspension|wheel|tire|automotive|car|truck/i.test(category.categoryName || "")) continue;
      counts.set(category.categoryId, (counts.get(category.categoryId) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function parsePriceCents(price?: EbayPrice) {
  const amount = Number(price?.value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function parseOptionalNumber(value?: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sanitizeHeaderValue(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 256);
}

async function readEbayError(response: Response) {
  try {
    const payload = await response.json() as {
      errors?: Array<{ errorId?: number; message?: string; longMessage?: string }>;
    };
    return payload.errors
      ?.slice(0, 2)
      .map((error) => [error.errorId, error.message, error.longMessage].filter(Boolean).join(" / "))
      .join("; ")
      .slice(0, 500) || "";
  } catch {
    return "";
  }
}

function assertServerRuntime() {
  if (typeof window !== "undefined") throw new Error("eBay Browse credentials can only be used server-side.");
}

function interpolateComponentQuery(template: string, input: EbayComponentSearchInput) {
  return template
    .replaceAll("{make}", input.makeName?.trim() || "Ferrari")
    .replaceAll("{model}", input.modelName)
    .replaceAll("{component}", input.componentName)
    .replaceAll("{year}", input.year ? String(input.year) : "")
    .replace(/\s+/g, " ")
    .trim();
}

export const searchEbayOffersForFerrariComponent = searchEbayOffersForComponent;
export const buildFerrariComponentSearchPlans = buildComponentSearchPlans;
