import type { ModelCatalogRecord, ModelCatalogSource, ModelMetadataCandidate } from "../types";
import { buildModelSearchQuery, isUsefulModelImageUrl, scoreTitleMatch } from "../normalizer";

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

type CommonsImageInfoResponse = {
  query?: {
    pages?: Record<string, {
      imageinfo?: Array<{
        descriptionurl?: string;
        extmetadata?: Record<string, {
          value?: string;
        }>;
      }>;
    }>;
  };
};

type CommonsAttribution = {
  sourceUrl: string | null;
  license: string | null;
  attribution: string | null;
  attributionUrl: string | null;
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
    const commonsAttribution = isUsefulModelImageUrl(imageUrl)
      ? await fetchCommonsAttribution(imageUrl).catch(() => null)
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
    if (isUsefulModelImageUrl(imageUrl) && !commonsAttribution?.license) {
      notes.push("Image license metadata could not be verified from Commons.");
    }

    return {
      sourceName: "Wikipedia / Wikimedia",
      sourceUrl,
      title,
      description: summary?.extract ? trimExtract(summary.extract) : null,
      imageUrl: isUsefulModelImageUrl(imageUrl) ? imageUrl : null,
      imageSourceUrl: commonsAttribution?.sourceUrl || sourceUrl,
      imageLicense: commonsAttribution?.license || "Wikipedia/Wikimedia source page license; verify before publishing",
      imageAttribution: commonsAttribution?.attribution || title,
      imageAttributionUrl: commonsAttribution?.attributionUrl || sourceUrl,
      confidence,
      requiresManualReview: confidence < 80 || !isUsefulModelImageUrl(imageUrl) || !commonsAttribution?.license,
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

async function fetchCommonsAttribution(imageUrl: string | null): Promise<CommonsAttribution | null> {
  const filename = getCommonsFilename(imageUrl);
  if (!filename) return null;

  const params = new URLSearchParams({
    action: "query",
    titles: `File:${filename}`,
    prop: "imageinfo",
    iiprop: "extmetadata|url",
    format: "json",
    origin: "*",
  });

  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers: {
      "User-Agent": "SUPERCAR-DASH-model-catalog-audit/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Commons image metadata failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as CommonsImageInfoResponse;
  const imageInfo = Object.values(data.query?.pages || {})[0]?.imageinfo?.[0];
  const metadata = imageInfo?.extmetadata || {};
  const licenseName = cleanMetadata(metadata.LicenseShortName?.value || metadata.License?.value);
  const licenseUrl = cleanMetadata(metadata.LicenseUrl?.value);
  const artist = cleanMetadata(metadata.Artist?.value);
  const credit = cleanMetadata(metadata.Credit?.value);
  const objectName = cleanMetadata(metadata.ObjectName?.value);
  const attribution = [artist, credit, objectName].find((value) => value && !/^own work$/i.test(value)) || objectName || artist || credit;

  return {
    sourceUrl: imageInfo?.descriptionurl || null,
    license: licenseUrl && licenseName ? `${licenseName} (${licenseUrl})` : licenseName || licenseUrl || null,
    attribution: attribution || null,
    attributionUrl: imageInfo?.descriptionurl || null,
  };
}

function getCommonsFilename(imageUrl: string | null) {
  if (!imageUrl) return null;

  try {
    const url = new URL(imageUrl);
    const parts = url.pathname.split("/").map((part) => decodeURIComponent(part));
    const thumbIndex = parts.findIndex((part) => part === "thumb");
    if (thumbIndex >= 0 && parts.length > thumbIndex + 3) {
      return parts[thumbIndex + 3];
    }
    const lastPart = parts[parts.length - 1];
    return lastPart || null;
  } catch {
    return null;
  }
}

function cleanMetadata(value: string | null | undefined) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim() || null;
}
