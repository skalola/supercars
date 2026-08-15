import { createHash } from "node:crypto";

export const CANONICAL_PART_TYPES = [
  "OEM",
  "OEM_EQUIVALENT",
  "REPLACEMENT",
  "PERFORMANCE",
  "AFTERMARKET",
  "ACCESSORY",
  "UNCLASSIFIED",
] as const;

export const PART_IDENTITY_CONFIDENCE = [
  "VERIFIED_IDENTIFIER",
  "HIGH",
  "MEDIUM",
  "UNVERIFIED",
] as const;

export const CATALOG_GAP_STATUSES = [
  "UNASSESSED",
  "NONE",
  "NO_REFERENCE_DATA",
  "REFERENCE_BLOCKED",
  "IDENTITY_UNRESOLVED",
  "VARIANT_TOO_SPECIFIC",
  "NOT_APPLICABLE",
] as const;

export const OFFER_GAP_STATUSES = [
  "UNASSESSED",
  "NONE",
  "NO_EBAY_RESULTS",
  "LOW_CONFIDENCE_ONLY",
  "OFFER_REFRESH_PENDING",
  "API_ERROR",
] as const;

export type CanonicalPartType = typeof CANONICAL_PART_TYPES[number];
export type PartIdentityConfidence = typeof PART_IDENTITY_CONFIDENCE[number];
export type CatalogGapStatus = typeof CATALOG_GAP_STATUSES[number];
export type OfferGapStatus = typeof OFFER_GAP_STATUSES[number];

export type CanonicalIdentifier = {
  type: "OEM" | "MPN" | "SKU" | "ALIAS";
  value: string;
  confidence: PartIdentityConfidence;
};

const IDENTITY_IDENTIFIER_PRIORITY: Record<CanonicalIdentifier["type"], number> = {
  MPN: 0,
  OEM: 1,
  SKU: 2,
  ALIAS: 3,
};

const PUBLIC_IDENTITY_CONFIDENCE = new Set<PartIdentityConfidence>([
  "VERIFIED_IDENTIFIER",
  "HIGH",
]);

export function normalizePartIdentifier(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function buildCanonicalPartIdentityKey(input: {
  brandId: string;
  identifiers: CanonicalIdentifier[];
}) {
  const identifier = input.identifiers
    .filter((candidate) => PUBLIC_IDENTITY_CONFIDENCE.has(candidate.confidence))
    .map((candidate) => ({ ...candidate, normalizedValue: normalizePartIdentifier(candidate.value) }))
    .filter((candidate) => candidate.normalizedValue.length > 0 && candidate.type !== "ALIAS")
    .sort((left, right) =>
      IDENTITY_IDENTIFIER_PRIORITY[left.type] - IDENTITY_IDENTIFIER_PRIORITY[right.type]
      || left.normalizedValue.localeCompare(right.normalizedValue),
    )[0];

  if (!input.brandId.trim() || !identifier) return null;
  return hashedKey("part", [input.brandId, identifier.type, identifier.normalizedValue]);
}

export function buildPartCatalogReferenceKey(input: {
  sourceCode: string;
  sourceUrl: string;
  sourcePartNumber?: string | null;
  modelId?: string | null;
  yearStart?: number | null;
  yearEnd?: number | null;
}) {
  return hashedKey("reference", [
    input.sourceCode,
    normalizeUrl(input.sourceUrl),
    normalizePartIdentifier(input.sourcePartNumber || ""),
    input.modelId,
    input.yearStart,
    input.yearEnd,
  ]);
}

export function buildPartFitmentKey(input: {
  partId: string;
  makeId?: string | null;
  modelId?: string | null;
  modelVariantId?: string | null;
  yearStart?: number | null;
  yearEnd?: number | null;
  trim?: string | null;
  engine?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  bodyStyle?: string | null;
  aspiration?: string | null;
  electrificationLevel?: string | null;
}) {
  return hashedKey("fitment", [
    input.partId,
    input.makeId,
    input.modelId,
    input.modelVariantId,
    input.yearStart,
    input.yearEnd,
    input.trim,
    input.engine,
    input.transmission,
    input.drivetrain,
    input.bodyStyle,
    input.aspiration,
    input.electrificationLevel,
  ]);
}

export function buildModelPartApplicabilityKey(input: {
  modelPartComponentId: string;
  modelVariantId?: string | null;
  yearStart?: number | null;
  yearEnd?: number | null;
  engine?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  bodyStyle?: string | null;
  aspiration?: string | null;
  electrificationLevel?: string | null;
}) {
  return hashedKey("applicability", [
    input.modelPartComponentId,
    input.modelVariantId,
    input.yearStart,
    input.yearEnd,
    input.engine,
    input.transmission,
    input.drivetrain,
    input.bodyStyle,
    input.aspiration,
    input.electrificationLevel,
  ]);
}

export function getCanonicalPartPublicationEligibility(input: {
  status: string;
  catalogPublished: boolean;
  identityConfidence: string;
  identityKey?: string | null;
  componentTypeId?: string | null;
  activeCatalogReferenceCount: number;
}) {
  if (input.status !== "ACTIVE") return ineligible("Part is not active.");
  if (!input.catalogPublished) return ineligible("Part has not been approved for catalog publication.");
  if (!PUBLIC_IDENTITY_CONFIDENCE.has(input.identityConfidence as PartIdentityConfidence)) {
    return ineligible("Part identity has not reached a publishable confidence level.");
  }
  if (!input.identityKey) return ineligible("Part has no canonical identity key.");
  if (!input.componentTypeId) return ineligible("Part is not attached to a normalized component.");
  if (input.activeCatalogReferenceCount < 1) return ineligible("Part has no active catalog reference.");
  return { eligible: true, reason: null } as const;
}

export function classifyLegacyProductForMigration(input: {
  productFamilyType: string;
  sourceCatalog?: string | null;
  sourceConfidence: string;
  hasHighConfidenceIdentifier: boolean;
}) {
  if (
    input.productFamilyType === "CANONICAL"
    && input.sourceCatalog !== "EBAY_PRODUCT_FAMILY"
    && input.sourceConfidence === "SOURCE_VERIFIED"
  ) {
    return "PRESERVE_CANONICAL" as const;
  }
  if (input.hasHighConfidenceIdentifier && ["HIGH", "SOURCE_VERIFIED"].includes(input.sourceConfidence)) {
    return "REVIEW_FOR_PROMOTION" as const;
  }
  return "UNRESOLVED_PRODUCT" as const;
}

export function getCustomerFitmentLabel(confidence: string) {
  if (["VERIFIED_IDENTIFIER", "EXACT_MATCH", "SOURCE_VERIFIED"].includes(confidence)) return "Exact Fit";
  if (["HIGH", "HIGH_CONFIDENCE", "VERIFIED"].includes(confidence)) return "Verified Fit";
  return "Likely Fit - Verify Before Purchase";
}

function ineligible(reason: string) {
  return { eligible: false, reason } as const;
}

function hashedKey(prefix: string, values: Array<string | number | null | undefined>) {
  const normalized = values.map(normalizeKeyPart).join("|");
  return `${prefix}:${createHash("sha256").update(normalized).digest("hex")}`;
}

function normalizeKeyPart(value: string | number | null | undefined) {
  if (value == null) return "";
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value.trim();
  }
}
