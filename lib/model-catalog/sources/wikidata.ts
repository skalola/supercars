import type { ModelCatalogRecord, ModelCatalogSource, ModelMetadataCandidate } from "../types";
import { buildModelSearchQuery, isUsefulModelImageUrl, scoreTitleMatch } from "../normalizer";
import { fetchCommonsImageMetadata } from "./commons";

type WikidataSearchResponse = {
  search?: Array<{
    id: string;
    title: string;
    label?: string;
    description?: string;
    concepturi?: string;
  }>;
};

type WikidataEntitiesResponse = {
  entities?: Record<string, {
    id: string;
    labels?: {
      en?: {
        value?: string;
      };
    };
    descriptions?: {
      en?: {
        value?: string;
      };
    };
    claims?: {
      P18?: Array<{
        mainsnak?: {
          datavalue?: {
            value?: string;
          };
        };
      }>;
    };
  }>;
};

export const wikidataModelCatalogSource: ModelCatalogSource = {
  id: "wikidata",
  label: "Wikidata / Wikimedia Commons",
  async findCandidate(record) {
    const searchResult = await searchWikidata(record);
    if (!searchResult) return null;

    const entity = await fetchWikidataEntity(searchResult.id).catch(() => null);
    const title = entity?.labels?.en?.value || searchResult.label || searchResult.title;
    const description = entity?.descriptions?.en?.value || searchResult.description || null;
    const confidence = scoreWikidataMatch(title, description, record);
    const imageFilename = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value || null;
    const commonsMetadata = imageFilename ? await fetchCommonsImageMetadata(imageFilename).catch(() => null) : null;
    const imageUrl = commonsMetadata?.imageUrl || null;
    const sourceUrl = `https://www.wikidata.org/wiki/${searchResult.id}`;
    const notes: string[] = [];

    if (confidence < 84) {
      notes.push("Wikidata entity match is below automatic approval threshold.");
    }
    if (!isUsefulModelImageUrl(imageUrl)) {
      notes.push("No usable Wikidata Commons image claim found.");
    }
    if (!commonsMetadata?.license) {
      notes.push("Commons image license metadata could not be verified.");
    }

    return {
      sourceName: "Wikidata / Wikimedia Commons",
      sourceUrl,
      title,
      description,
      imageUrl: isUsefulModelImageUrl(imageUrl) ? imageUrl : null,
      imageSourceUrl: commonsMetadata?.sourceUrl || sourceUrl,
      imageLicense: commonsMetadata?.license || null,
      imageAttribution: commonsMetadata?.attribution || title,
      imageAttributionUrl: commonsMetadata?.attributionUrl || sourceUrl,
      confidence,
      requiresManualReview: confidence < 84 || !isUsefulModelImageUrl(imageUrl) || !commonsMetadata?.license,
      notes,
    } satisfies ModelMetadataCandidate;
  },
};

async function searchWikidata(record: ModelCatalogRecord) {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: buildModelSearchQuery(record.makeName, record.modelName),
    language: "en",
    uselang: "en",
    type: "item",
    limit: "8",
    format: "json",
    origin: "*",
  });

  const response = await fetch(`https://www.wikidata.org/w/api.php?${params.toString()}`, {
    headers: {
      "User-Agent": "SUPERCAR-DASH-model-catalog/1.0 (contact: support@supercars.market)",
    },
  });

  if (!response.ok) {
    throw new Error(`Wikidata search failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as WikidataSearchResponse;
  const results = data.search || [];
  return results
    .map((item) => ({
      ...item,
      confidence: scoreWikidataMatch(item.label || item.title, item.description || null, record),
    }))
    .sort((a, b) => b.confidence - a.confidence)[0] || null;
}

async function fetchWikidataEntity(id: string) {
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: id,
    props: "labels|descriptions|claims",
    languages: "en",
    format: "json",
    origin: "*",
  });

  const response = await fetch(`https://www.wikidata.org/w/api.php?${params.toString()}`, {
    headers: {
      "User-Agent": "SUPERCAR-DASH-model-catalog/1.0 (contact: support@supercars.market)",
    },
  });

  if (!response.ok) {
    throw new Error(`Wikidata entity fetch failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as WikidataEntitiesResponse;
  return Object.values(data.entities || {})[0] || null;
}

function scoreWikidataMatch(title: string, description: string | null, record: ModelCatalogRecord) {
  const baseScore = scoreTitleMatch(title, record.makeName, record.modelName);
  const normalizedDescription = String(description || "").toLowerCase();
  let score = baseScore;

  if (/automobile|car|vehicle|sports car|supercar|model/.test(normalizedDescription)) {
    score += 8;
  }
  if (/video game|song|film|album|software|fictional/.test(normalizedDescription)) {
    score -= 25;
  }

  return Math.max(0, Math.min(100, score));
}
