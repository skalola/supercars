import type { ModelCatalogRecord, ModelCatalogSource } from "./types";
import { wikipediaModelCatalogSource } from "./sources/wikimedia";

export const modelCatalogSources: ModelCatalogSource[] = [
  wikipediaModelCatalogSource,
];

export async function findModelMetadataCandidates(record: ModelCatalogRecord, sources = modelCatalogSources) {
  const candidates = [];

  for (const source of sources) {
    try {
      const candidate = await source.findCandidate(record);
      if (candidate) candidates.push(candidate);
    } catch (error) {
      candidates.push({
        sourceName: source.label,
        sourceUrl: "",
        title: `${record.makeName} ${record.modelName}`,
        description: null,
        imageUrl: null,
        imageSourceUrl: null,
        imageLicense: null,
        imageAttribution: null,
        imageAttributionUrl: null,
        confidence: 0,
        requiresManualReview: true,
        notes: [error instanceof Error ? error.message : "Source lookup failed."],
      });
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

export type {
  ModelAuditRow,
  ModelCatalogRecord,
  ModelCatalogSource,
  ModelCoverageStatus,
  ModelMetadataCandidate,
} from "./types";
