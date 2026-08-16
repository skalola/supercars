export type CanonicalPartOfferQuery = {
  makeName?: string;
  partId: string;
  partName: string;
  manufacturer?: string | null;
  oemPartNumber?: string | null;
  categorySlug: string;
  compatibleModels: string[];
  limit?: number;
};

export type VehiclePartOfferQuery = {
  providerId: string;
  modelId: string;
  makeName: string;
  makeSlug: string;
  modelName: string;
  modelSlug: string;
  partTypeId: string;
  partTypeName: string;
  partTypeSlug: string;
  systemSlug: string;
  aliases?: string[];
  identifiers?: string[];
  knownMakes?: string[];
  knownModels?: string[];
  knownBrands?: string[];
  templates?: string[];
  fitmentRisk?: "LOW" | "MEDIUM" | "HIGH";
  year?: number | null;
  referenceId: string;
  limit?: number;
};

export interface PartOfferProviderAdapter<TOffer> {
  readonly provider: string;
  readonly providerType: string;
  searchOffers(input: CanonicalPartOfferQuery): Promise<TOffer[]>;
  getOffer?(externalItemId: string): Promise<TOffer | null>;
  refreshOffer?(offer: TOffer): Promise<TOffer | null>;
  buildAffiliateUrl(offer: TOffer): string | null;
  validateOffer(offer: TOffer): { valid: boolean; reason?: string };
  searchPartTypeOffers?(input: VehiclePartOfferQuery): Promise<{
    offers: TOffer[];
    queries: string[];
    examinedCount: number;
    rejectedCount: number;
    missingAffiliateUrlCount: number;
    rejectionReasons: Record<string, number>;
  }>;
}
