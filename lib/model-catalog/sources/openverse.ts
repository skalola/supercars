import type { ModelCatalogRecord, ModelCatalogSource, ModelMetadataCandidate } from "../types";
import { buildModelSearchQuery, isUsefulModelImageUrl, scoreTitleMatch } from "../normalizer";

type OpenverseImageResponse = {
  results?: Array<{
    id: string;
    title?: string | null;
    foreign_landing_url?: string | null;
    url?: string | null;
    creator?: string | null;
    creator_url?: string | null;
    license?: string | null;
    license_version?: string | null;
    license_url?: string | null;
    provider?: string | null;
    source?: string | null;
    tags?: Array<{
      name?: string | null;
    }>;
  }>;
};

const OPENVERSE_LICENSES = [
  "cc0",
  "by",
  "by-sa",
  "by-nc",
  "by-nc-sa",
  "pdm",
];

export const openverseModelCatalogSource: ModelCatalogSource = {
  id: "openverse",
  label: "Openverse",
  async findCandidate(record) {
    const result = await searchOpenverse(record);
    if (!result) return null;

    const title = result.title || `${record.makeName} ${record.modelName}`;
    const landingUrl = result.foreign_landing_url || result.url || "https://openverse.org/";
    const confidence = scoreOpenverseMatch(result, record);
    const imageUrl = result.url || null;
    const license = formatLicense(result);
    const attribution = [result.creator, title].filter(Boolean).join(" - ");
    const notes: string[] = [];

    if (confidence < 82) {
      notes.push("Openverse result match is below automatic approval threshold.");
    }
    if (!isUsefulModelImageUrl(imageUrl)) {
      notes.push("No usable Openverse image URL found.");
    }
    if (!license || !landingUrl) {
      notes.push("Openverse license or landing page metadata is missing.");
    }

    return {
      sourceName: "Openverse",
      sourceUrl: landingUrl,
      title,
      description: null,
      imageUrl: isUsefulModelImageUrl(imageUrl) ? imageUrl : null,
      imageSourceUrl: landingUrl,
      imageLicense: license,
      imageAttribution: attribution || title,
      imageAttributionUrl: result.creator_url || landingUrl,
      confidence,
      requiresManualReview: confidence < 82 || !isUsefulModelImageUrl(imageUrl) || !license || !landingUrl,
      notes,
    } satisfies ModelMetadataCandidate;
  },
};

async function searchOpenverse(record: ModelCatalogRecord) {
  const params = new URLSearchParams({
    q: buildModelSearchQuery(record.makeName, record.modelName),
    page_size: "12",
    license: OPENVERSE_LICENSES.join(","),
  });

  const response = await fetch(`https://api.openverse.org/v1/images/?${params.toString()}`, {
    headers: {
      "User-Agent": "SUPERCAR-DASH-model-catalog/1.0 (contact: support@supercars.market)",
    },
  });

  if (!response.ok) {
    throw new Error(`Openverse image search failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as OpenverseImageResponse;
  const results = data.results || [];
  return results
    .filter((item) => isUsefulModelImageUrl(item.url))
    .map((item) => ({
      ...item,
      confidence: scoreOpenverseMatch(item, record),
    }))
    .sort((a, b) => b.confidence - a.confidence)[0] || null;
}

function scoreOpenverseMatch(result: NonNullable<OpenverseImageResponse["results"]>[number], record: ModelCatalogRecord) {
  const title = result.title || "";
  const tags = (result.tags || []).map((tag) => tag.name).filter(Boolean).join(" ");
  const searchableText = `${title} ${tags} ${result.foreign_landing_url || ""}`;
  let score = scoreTitleMatch(searchableText, record.makeName, record.modelName);

  if (/logo|badge|emblem|interior|wheel|engine|part|toy|diecast|model car/i.test(searchableText)) {
    score -= 30;
  }
  if (/car|automobile|vehicle|coupe|sedan|roadster|supercar|sports/i.test(searchableText)) {
    score += 6;
  }

  return Math.max(0, Math.min(100, score));
}

function formatLicense(result: NonNullable<OpenverseImageResponse["results"]>[number]) {
  const license = result.license?.trim();
  if (!license) return null;

  const version = result.license_version?.trim();
  const url = result.license_url?.trim();
  const label = version ? `${license.toUpperCase()} ${version}` : license.toUpperCase();
  return url ? `${label} (${url})` : label;
}
