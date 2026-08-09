import type { ModelCatalogRecord, ModelCatalogSource, ModelMetadataCandidate } from "../types";
import { buildModelSearchQuery, isUsefulModelImageUrl, scoreTitleMatch } from "../normalizer";
import { fetchCommonsImageMetadata } from "./commons";

type WikipediaSearchResponse = {
  query?: {
    search?: Array<{
      pageid: number;
      title: string;
      snippet?: string;
    }>;
  };
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
    const imageUrl = summary?.originalimage?.source || summary?.thumbnail?.source || null;
    const sourceUrl = summary?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(searchResult.key)}`;
    const commonsMetadata = isUsefulModelImageUrl(imageUrl)
      ? await fetchCommonsImageMetadata(imageUrl).catch(() => null)
      : null;
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
    if (isUsefulModelImageUrl(imageUrl) && !commonsMetadata?.license) {
      notes.push("Image license metadata could not be verified from Commons.");
    }

    return {
      sourceName: "Wikipedia / Wikimedia",
      sourceUrl,
      title,
      description: summary?.extract ? trimExtract(summary.extract) : null,
      imageUrl: isUsefulModelImageUrl(imageUrl) ? imageUrl : null,
      imageSourceUrl: commonsMetadata?.sourceUrl || sourceUrl,
      imageLicense: commonsMetadata?.license || "Wikipedia/Wikimedia source page license; verify before publishing",
      imageAttribution: commonsMetadata?.attribution || title,
      imageAttributionUrl: commonsMetadata?.attributionUrl || sourceUrl,
      confidence,
      requiresManualReview: confidence < 80 || !isUsefulModelImageUrl(imageUrl) || !commonsMetadata?.license,
      notes,
    } satisfies ModelMetadataCandidate;
  },
};

async function searchWikipedia(record: ModelCatalogRecord) {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: buildModelSearchQuery(record.makeName, record.modelName),
    srlimit: "5",
    format: "json",
    origin: "*",
  });
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
    headers: {
      "User-Agent": "SUPERCAR-DASH-model-catalog-audit/1.0 (contact: support@supercars.market)",
    },
  });

  if (!response.ok) {
    throw new Error(`Wikipedia search failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as WikipediaSearchResponse;
  const pages = data.query?.search || [];
  return pages
    .map((page) => ({
      ...page,
      key: page.title,
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

  if (!response.ok) {
    throw new Error(`Wikipedia summary failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as WikipediaSummaryResponse;
}

function trimExtract(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 700);
}
