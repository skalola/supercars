export type CatalogConfidence = "LOW" | "MEDIUM" | "HIGH" | "SOURCE_VERIFIED";
export type CatalogReviewStatus = "SOURCE_VERIFIED" | "NEEDS_REVIEW" | "REJECTED";

export type ModelLineupCandidate = {
  sourceType: "OEM" | "NHTSA" | "EPA" | "WIKIDATA" | "MANUAL_IMPORT";
  sourceName: string;
  sourceUrl?: string | null;
  externalId?: string | null;
  makeName: string;
  modelName: string;
  canonicalFamilyName?: string | null;
  variantName?: string | null;
  productionStartYear?: number | null;
  productionEndYear?: number | null;
  bodyStyle?: string | null;
  category?: string | null;
  confidence: CatalogConfidence;
  payloadHash?: string | null;
};

export type CatalogIdentityDecision = {
  action: "LINK_MODEL" | "LINK_VARIANT" | "CREATE_MODEL" | "REVIEW" | "REJECT";
  normalizedFamilyKey: string;
  canonicalFamilyName: string;
  reviewStatus: CatalogReviewStatus;
  reasons: string[];
};
