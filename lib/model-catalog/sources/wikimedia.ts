import type { ModelCatalogRecord, ModelCatalogSource, ModelMetadataCandidate } from "../types";
import { buildModelSearchQuery, isUsefulModelImageUrl, scoreTitleMatch } from "../normalizer";

type WikipediaSearchResponse = {
  pages?: Array<{
    id: number;
    key: string;
    title: string;
    excerpt?: string;
    thumbnail?: {
      url?: string;
    };
  }>;
};

type WikipediaSummaryResponse = {
  title?: string;
  extract?: string;
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
  originalimage?: {
    source?: string;
  };
  thumbnail?: {
    source?: string;
  };
};

export const wikipediaModelCatalogSource: ModelCatalogSource = {
  id: "wikipedia",
  label: "Wikipedia / Wikimedia",
  async findCandidate(record) {
    const searchResult = await searchWikipedia(record);
    if (!searchResult) return null;

    const summary = await fetchWikipediaSummary(searchResult.key).catch(() => null);
    const title = summary?.title || searchResult.title;
    const confidence = scoreTitleMatch(title, record.makeName, record.modelName);
    const imageUrl = summary?.originalimage?.source || summary?.thumbnail?.source || searchResult.thumbnail?.url || null;
    const sourceUrl = summary?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(searchResult.key)}`;
    const notes: string[] = [];

    if (confidence < 80) {
      notes.push("Title match is below automatic approval threshold.");
    }
    if (!isUsefulModelImageUrl(imageUrl)) {
      notes.push("No usable vehicle image candidate found.");
    }
    if (!summary?.extract) {
      notes.push("No summary text candidate found.");
    }

    return {
      sourceName: "Wikipedia / Wikimedia",
      sourceUrl,
      title,
      description: summary?.extract ? trimExtract(summary.extract) : null,
      imageUrl: isUsefulModelImageUrl(imageUrl) ? imageUrl : null,
      imageSourceUrl: sourceUrl,
      imageLicense: "Wikipedia/Wikimedia source page license; verify before publishing",
      imageAttribution: title,
      imageAttributionUrl: sourceUrl,
      confidence,
      requiresManualReview: confidence < 80 || !isUsefulModelImageUrl(imageUrl),
      notes,
    } satisfies ModelMetadataCandidate;
  },
};

async function searchWikipedia(record: ModelCatalogRecord) {
  const params = new URLSearchParams({
    q: buildModelSearchQuery(record.makeName, record.modelName),
    limit: "5",
  });
  const response = await fetch(`https://en.wikipedia.org/w/rest.php/v1/search/page?${params.toString()}`, {
    headers: {
      "User-Agent": "SUPERCAR-DASH-model-catalog-audit/1.0",
    },
  });

  if (!response.ok) return null;

  const data = (await response.json()) as WikipediaSearchResponse;
  const pages = data.pages || [];
  return pages
    .map((page) => ({
      ...page,
      confidence: scoreTitleMatch(page.title, record.makeName, record.modelName),
    }))
    .sort((a, b) => b.confidence - a.confidence)[0] || null;
}

async function fetchWikipediaSummary(key: string) {
  const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`, {
    headers: {
      "User-Agent": "SUPERCAR-DASH-model-catalog-audit/1.0",
    },
  });

  if (!response.ok) return null;
  return (await response.json()) as WikipediaSummaryResponse;
}

function trimExtract(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 700);
}
