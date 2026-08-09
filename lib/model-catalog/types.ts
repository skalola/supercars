export type ModelCatalogRecord = {
  modelId: string;
  makeName: string;
  modelName: string;
  slug: string;
  years: string | null;
  productionStartYear: number | null;
  productionEndYear: number | null;
};

export type ModelMetadataCandidate = {
  sourceName: string;
  sourceUrl: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  imageSourceUrl: string | null;
  imageLicense: string | null;
  imageAttribution: string | null;
  imageAttributionUrl: string | null;
  confidence: number;
  requiresManualReview: boolean;
  notes: string[];
};

export type ModelCatalogSource = {
  id: string;
  label: string;
  findCandidate(record: ModelCatalogRecord): Promise<ModelMetadataCandidate | null>;
};

export type ModelCoverageStatus = "READY" | "PARTIAL" | "NEEDS_REVIEW";

export type ModelAuditRow = {
  modelId: string;
  make: string;
  model: string;
  slug: string;
  status: ModelCoverageStatus;
  missing: string[];
  hasHeroImage: boolean;
  hasDescription: boolean;
  hasProductionYears: boolean;
  hasCategory: boolean;
  hasBodyStyle: boolean;
  hasSpecs: boolean;
  hasVariants: boolean;
  hasMaintenanceRules: boolean;
  hasMarketData: boolean;
  hasListings: boolean;
  sourceCandidate?: ModelMetadataCandidate | null;
};
