import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { EbayComponentOffer } from "@/lib/ebay/browse.server";
import { FERRARI_PART_BRANDS } from "@/lib/parts/ferrari-component-library";
import { buildPartOfferContentHash } from "@/lib/parts/offer-content-hash";

export type FerrariOfferClassification =
  | "OEM_GENUINE"
  | "OEM_REPLACEMENT"
  | "PERFORMANCE_UPGRADE"
  | "USED_OEM"
  | "REMANUFACTURED"
  | "UNKNOWN";

export const MARKETPLACE_CAN_CREATE_CANONICAL_PARTS = false as const;

type IdentifierCandidate = {
  type: "OEM" | "MPN";
  value: string;
  normalizedValue: string;
  confidence: "HIGH" | "POSSIBLE";
  evidence: string;
};

type ProductIdentity = {
  brand: string;
  classification: FerrariOfferClassification;
  identifiers: IdentifierCandidate[];
  familyName: string;
  normalizedTitle: string;
  familyKey: string;
  provisional: boolean;
};

export type ExistingOfferSnapshot = {
  id: string;
  partId: string | null;
  providerId: string | null;
  contentHash: string | null;
  active: boolean;
  lastSeenAt: Date;
  contexts: Array<{
    id: string;
    active: boolean;
    fitmentConfidence: string;
    confidenceScore: number;
  }>;
};

export type PersistDiscoveredOfferInput = {
  makeName?: string;
  knownBrands?: readonly string[];
  offer: EbayComponentOffer;
  partnerId: string | null;
  providerId: string;
  mappingId: string;
  modelId: string;
  makeId: string;
  modelYearStart: number | null;
  modelYearEnd: number | null;
  categoryId: string;
  categorySlug: string;
  componentTypeId: string;
  componentName: string;
  performanceRelated: boolean;
  now: Date;
  expiresAt: Date;
  existingOffer?: ExistingOfferSnapshot | null;
};

export type FerrariExistingOfferSnapshot = ExistingOfferSnapshot;
export type PersistFerrariDiscoveredOfferInput = PersistDiscoveredOfferInput;

const MODEL_OR_YEAR_ONLY = /^(?:19|20)\d{2}$|^(?:206|208|246|250|275|288|296|308|328|330|348|355|360|430|456|458|488|499|512|550|575|599|612|812)$/;
const OFFER_HEARTBEAT_MS = 12 * 60 * 60 * 1000;

export function deriveProductIdentity(
  offer: EbayComponentOffer,
  input: { componentTypeId: string; componentName: string; performanceRelated: boolean; makeName?: string; knownBrands?: readonly string[] },
): ProductIdentity {
  const makeName = input.makeName?.trim() || "Ferrari";
  const brand = extractKnownBrand(offer.structuredBrand, offer.title, makeName, input.knownBrands ?? []);
  const identifiers = extractPartIdentifiers({
    title: offer.title,
    structuredMpn: offer.structuredManufacturerPartNumber,
    structuredOem: offer.structuredOemPartNumber,
  });
  const strongestIdentifier = identifiers.find((identifier) => identifier.confidence === "HIGH");
  const classification = classifyOffer(offer, brand, makeName, input.performanceRelated);
  const normalizedTitle = normalizeWords(offer.title);
  const familyKeyMaterial = strongestIdentifier
    ? `${input.componentTypeId}:${normalizeWords(brand)}:${strongestIdentifier.type}:${strongestIdentifier.normalizedValue}`
    : `${input.componentTypeId}:offer:${offer.externalItemId}`;
  const familyKey = `ebay-family:${createHash("sha256").update(familyKeyMaterial).digest("hex").slice(0, 32)}`;
  const identifierLabel = strongestIdentifier ? ` ${strongestIdentifier.value}` : "";
  return {
    brand,
    classification,
    identifiers,
    familyName: `${brand} ${input.componentName}${identifierLabel}`.replace(/\s+/g, " ").trim(),
    normalizedTitle,
    familyKey,
    provisional: !strongestIdentifier,
  };
}

export async function persistDiscoveredOffer(
  prisma: PrismaClient,
  input: PersistDiscoveredOfferInput,
) {
  const identity = deriveProductIdentity(input.offer, input);
  const contentHash = buildPartOfferContentHash({
    ...input.offer,
    fitmentConfidence: input.offer.confidence,
  });
  const existingOffer = input.existingOffer !== undefined
    ? input.existingOffer
    : await prisma.partOffer.findUnique({
    where: {
      provider_externalItemId: {
        provider: input.offer.provider,
        externalItemId: input.offer.externalItemId,
      },
    },
    select: {
      id: true,
      partId: true,
      providerId: true,
      contentHash: true,
      active: true,
      lastSeenAt: true,
      contexts: {
        where: { modelPartComponentId: input.mappingId },
        select: {
          id: true,
          active: true,
          fitmentConfidence: true,
          confidenceScore: true,
        },
        take: 1,
      },
    },
      });
  const existingContext = existingOffer?.contexts[0];

  if (existingOffer && existingOffer.contentHash === contentHash) {
    const heartbeatDue = existingOffer.lastSeenAt < new Date(input.now.getTime() - OFFER_HEARTBEAT_MS);
    const providerNeedsLink = existingOffer.providerId !== input.providerId;
    if (heartbeatDue || !existingOffer.active || providerNeedsLink) {
      await prisma.partOffer.update({
        where: { id: existingOffer.id },
        data: {
          providerId: input.providerId,
          active: true,
          availability: "AVAILABLE",
          lastSeenAt: input.now,
          lastCheckedAt: input.now,
          expiresAt: input.expiresAt,
        },
      });
    }
    if (existingContext) {
      const contextChanged = !existingContext.active
        || existingContext.fitmentConfidence !== input.offer.confidence
        || existingContext.confidenceScore !== input.offer.confidenceScore;
      if (contextChanged) {
        await prisma.partOfferContext.update({
          where: { id: existingContext.id },
          data: {
            fitmentConfidence: input.offer.confidence,
            confidenceScore: input.offer.confidenceScore,
            matchReasons: input.offer.matchReasons,
            active: true,
            lastSeenAt: input.now,
            lastCheckedAt: input.now,
          },
        });
      }
      return {
        offerId: existingOffer.id,
        familyId: existingOffer.partId,
        identity,
        writeDisposition: heartbeatDue || !existingOffer.active || providerNeedsLink || contextChanged ? "HEARTBEAT" as const : "UNCHANGED" as const,
      };
    }

    if (existingOffer.partId) await ensureCompatibility(prisma, existingOffer.partId, input);
    await prisma.partOfferContext.create({
      data: buildContextCreate(input, existingOffer.id),
    });
    return {
      offerId: existingOffer.id,
      familyId: existingOffer.partId,
      identity,
      writeDisposition: "CONTEXT_ADDED" as const,
    };
  }

  const strongestIdentifier = identity.identifiers.find((identifier) => identifier.confidence === "HIGH");
  const existingCanonicalFamily = strongestIdentifier
    ? await prisma.performancePart.findFirst({
      where: {
        componentTypeId: input.componentTypeId,
        OR: [
          ...(strongestIdentifier.type === "OEM" ? [{ oemPartNumber: strongestIdentifier.normalizedValue }] : []),
          ...(strongestIdentifier.type === "MPN" ? [{ partNumber: strongestIdentifier.normalizedValue }] : []),
          { identifiers: { some: { type: strongestIdentifier.type, normalizedValue: strongestIdentifier.normalizedValue } } },
        ],
      },
      select: { id: true },
    })
    : null;
  const familyId = existingOffer?.partId ?? existingCanonicalFamily?.id ?? null;

  if (familyId) await ensureCompatibility(prisma, familyId, input);
  if (familyId && identity.identifiers.length > 0) {
    await prisma.partIdentifier.createMany({
      data: identity.identifiers.map((identifier) => ({
        partId: familyId,
        type: identifier.type,
        value: identifier.value,
        normalizedValue: identifier.normalizedValue,
        source: "EBAY",
        confidence: identifier.confidence,
        evidence: identifier.evidence,
      })),
      skipDuplicates: true,
    });
  }

  const storedOffer = existingOffer
    ? await prisma.partOffer.update({
      where: { id: existingOffer.id },
      data: buildOfferWrite(input, familyId, identity, contentHash),
      select: { id: true },
    })
    : await prisma.partOffer.create({
      data: {
      provider: input.offer.provider,
      externalItemId: input.offer.externalItemId,
        ...buildOfferWrite(input, familyId, identity, contentHash),
      },
      select: { id: true },
    });
  if (existingContext) {
    await prisma.partOfferContext.update({
      where: { id: existingContext.id },
      data: {
        searchQuery: input.offer.searchQuery,
        fitmentConfidence: input.offer.confidence,
        confidenceScore: input.offer.confidenceScore,
        matchReasons: input.offer.matchReasons,
        active: true,
        lastSeenAt: input.now,
        lastCheckedAt: input.now,
      },
    });
  } else {
    await prisma.partOfferContext.create({
      data: buildContextCreate(input, storedOffer.id),
    });
  }
  return {
    offerId: storedOffer.id,
    familyId,
    identity,
    writeDisposition: existingOffer ? "UPDATED" as const : "INSERTED" as const,
  };
}

export function deriveFerrariProductIdentity(
  offer: EbayComponentOffer,
  input: { componentTypeId: string; componentName: string; performanceRelated: boolean },
) {
  return deriveProductIdentity(offer, {
    ...input,
    makeName: "Ferrari",
    knownBrands: FERRARI_PART_BRANDS,
  });
}

export async function loadExistingOffers(
  prisma: PrismaClient,
  input: { mappingId: string; provider: string; externalItemIds: string[] },
) {
  if (input.externalItemIds.length === 0) return new Map<string, ExistingOfferSnapshot>();
  const offers = await prisma.partOffer.findMany({
    where: {
      provider: input.provider,
      externalItemId: { in: [...new Set(input.externalItemIds)] },
    },
    select: {
      id: true,
      partId: true,
      providerId: true,
      contentHash: true,
      active: true,
      lastSeenAt: true,
      externalItemId: true,
      contexts: {
        where: { modelPartComponentId: input.mappingId },
        select: {
          id: true,
          active: true,
          fitmentConfidence: true,
          confidenceScore: true,
        },
        take: 1,
      },
    },
  });
  return new Map(offers.map(({ externalItemId, ...offer }) => [externalItemId, offer]));
}

async function ensureCompatibility(
  prisma: PrismaClient,
  familyId: string,
  input: PersistDiscoveredOfferInput,
) {
  const compatibility = await prisma.partCompatibility.findFirst({
    where: {
      partId: familyId,
      makeId: input.makeId,
      modelId: input.modelId,
      yearStart: input.modelYearStart,
      yearEnd: input.modelYearEnd,
    },
    select: { id: true },
  });
  if (compatibility) return;
  await prisma.partCompatibility.create({
    data: {
      partId: familyId,
      makeId: input.makeId,
      modelId: input.modelId,
      yearStart: input.modelYearStart,
      yearEnd: input.modelYearEnd,
      confidence: input.offer.confidence,
      notes: "Compatibility inferred from qualified eBay model/component evidence; confirm exact VIN fitment before purchase.",
    },
  });
}

function buildContextCreate(input: PersistDiscoveredOfferInput, offerId: string) {
  return {
    offerId,
    modelPartComponentId: input.mappingId,
    searchQuery: input.offer.searchQuery,
    fitmentConfidence: input.offer.confidence,
    confidenceScore: input.offer.confidenceScore,
    matchReasons: input.offer.matchReasons,
    active: true,
    lastSeenAt: input.now,
    lastCheckedAt: input.now,
  };
}

function buildOfferWrite(
  input: PersistDiscoveredOfferInput,
  familyId: string | null,
  identity: ProductIdentity,
  contentHash: string,
) {
  const offer = input.offer;
  return {
    partId: familyId,
    providerId: input.providerId,
    affiliatePartnerId: input.partnerId,
    title: offer.title,
    subtitle: offer.subtitle,
    priceCents: offer.priceCents,
    currency: offer.currency,
    condition: offer.condition,
    sellerName: offer.sellerName,
    sellerFeedbackPercentage: offer.sellerFeedbackPercentage,
    sellerQualityScore: offer.sellerQualityScore,
    imageUrl: offer.imageUrl,
    additionalImageUrls: offer.additionalImageUrls,
    affiliateUrl: offer.affiliateUrl,
    sourceUrl: offer.sourceUrl,
    itemLocation: offer.itemLocation,
    brandName: identity.brand,
    manufacturerPartNumber: identity.identifiers.find((identifier) => identifier.type === "MPN" && identifier.confidence === "HIGH")?.normalizedValue ?? null,
    oemPartNumber: identity.identifiers.find((identifier) => identifier.type === "OEM" && identifier.confidence === "HIGH")?.normalizedValue ?? null,
    compatibilityData: offer.compatibilityData
      ? offer.compatibilityData as Prisma.InputJsonValue
      : Prisma.DbNull,
    marketplaceCategoryId: offer.marketplaceCategoryId,
    classification: identity.classification,
    quantityAvailable: offer.quantityAvailable,
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
    lastSeenAt: input.now,
    lastCheckedAt: input.now,
    expiresAt: input.expiresAt,
    active: true,
  };
}

function extractKnownBrand(structuredBrand: string | null, title: string, makeName: string, knownBrands: readonly string[]) {
  const availableBrands = [...new Set([makeName, ...knownBrands].filter(Boolean))];
  const candidate = structuredBrand && availableBrands.find((brand) => normalizeWords(brand) === normalizeWords(structuredBrand));
  if (candidate) return candidate;
  const normalizedTitle = normalizeWords(title);
  const aftermarketBrand = availableBrands
    .filter((brand) => normalizeWords(brand) !== normalizeWords(makeName))
    .find((brand) => normalizedTitle.includes(normalizeWords(brand)));
  if (aftermarketBrand) return aftermarketBrand;
  const escapedMake = makeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\b(?:genuine ${escapedMake}|${escapedMake} genuine|${escapedMake} oem|oem ${escapedMake})\\b`, "i").test(title)) return makeName;
  return "Unbranded";
}

function extractPartIdentifiers(input: { title: string; structuredMpn: string | null; structuredOem: string | null }) {
  const candidates: IdentifierCandidate[] = [];
  addIdentifier(candidates, "MPN", input.structuredMpn, "HIGH", "Structured eBay manufacturer part number");
  addIdentifier(candidates, "OEM", input.structuredOem, "HIGH", "Structured eBay OEM part number");
  const labeledPattern = /\b(OE\/OEM|OEM|MPN|P\/N|PART(?:\s+NO|\s+NUMBER)?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9.-]{3,23})\b/gi;
  for (const match of input.title.matchAll(labeledPattern)) {
    addIdentifier(candidates, /OEM|OE\//i.test(match[1]) ? "OEM" : "MPN", match[2], "HIGH", `Labeled identifier in title: ${match[0]}`);
  }
  for (const match of input.title.matchAll(/\b\d{6,9}\b/g)) {
    addIdentifier(candidates, "OEM", match[0], "POSSIBLE", `Unlabeled automotive-format number in title: ${match[0]}`);
  }
  const deduplicated = new Map<string, IdentifierCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.type}:${candidate.normalizedValue}`;
    const current = deduplicated.get(key);
    if (!current || (current.confidence === "POSSIBLE" && candidate.confidence === "HIGH")) deduplicated.set(key, candidate);
  }
  return [...deduplicated.values()];
}

function addIdentifier(
  target: IdentifierCandidate[],
  type: IdentifierCandidate["type"],
  value: string | null | undefined,
  confidence: IdentifierCandidate["confidence"],
  evidence: string,
) {
  const normalizedValue = normalizeIdentifier(value);
  if (!normalizedValue || MODEL_OR_YEAR_ONLY.test(normalizedValue) || !/\d/.test(normalizedValue)) return;
  target.push({ type, value: value!.trim(), normalizedValue, confidence, evidence });
}

function normalizeIdentifier(value: string | null | undefined) {
  if (!value) return "";
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length >= 5 && normalized.length <= 24 ? normalized : "";
}

function classifyOffer(offer: EbayComponentOffer, brand: string, makeName: string, performanceRelated: boolean): FerrariOfferClassification {
  const text = normalizeWords(`${offer.title} ${offer.condition || ""}`);
  const factoryBrand = normalizeWords(brand) === normalizeWords(makeName);
  if (/remanufactured|reman|rebuilt/.test(text)) return "REMANUFACTURED";
  if (/used|pre owned|preowned/.test(text) && (factoryBrand || /genuine|oem/.test(text))) return "USED_OEM";
  if (factoryBrand && /genuine|oem/.test(text)) return "OEM_GENUINE";
  if (performanceRelated) return "PERFORMANCE_UPGRADE";
  if (brand !== "Unbranded") return "OEM_REPLACEMENT";
  return "UNKNOWN";
}

function normalizeWords(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export const persistFerrariDiscoveredOffer = persistDiscoveredOffer;
export const loadFerrariExistingOffers = loadExistingOffers;
