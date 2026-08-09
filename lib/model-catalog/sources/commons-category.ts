import type { ModelCatalogRecord, ModelCatalogSource, ModelMetadataCandidate } from "../types";
import { buildModelSearchQuery, isUsefulModelImageUrl, normalizeCatalogText, scoreTitleMatch } from "../normalizer";
import { fetchCommonsImageMetadata, getCommonsFilename } from "./commons";

type CommonsCategorySearchResponse = {
  query?: {
    search?: Array<{
      title: string;
      snippet?: string;
    }>;
  };
};

type CommonsCategoryMembersResponse = {
  query?: {
    categorymembers?: Array<{
      title: string;
      ns: number;
    }>;
  };
};

type CategoryCandidate = {
  title: string;
  score: number;
};

const MAX_CATEGORIES = 4;
const MAX_FILES_PER_CATEGORY = 10;

export const commonsCategoryModelCatalogSource: ModelCatalogSource = {
  id: "commons-category",
  label: "Wikimedia Commons Categories",
  async findCandidate(record) {
    const categories = await findCommonsCategories(record);
    if (categories.length === 0) return null;

    const fileCandidates = [];
    for (const category of categories.slice(0, MAX_CATEGORIES)) {
      const files = await fetchCategoryFiles(category.title).catch(() => []);
      for (const file of files.slice(0, MAX_FILES_PER_CATEGORY)) {
        const metadata = await fetchCommonsImageMetadata(file.title).catch(() => null);
        const imageUrl = metadata?.imageUrl || null;
        const title = file.title.replace(/^File:/i, "");
        const context = `${category.title} ${title}`;
        const confidence = scoreCommonsCategoryImage(context, record, category.score);
        if (!isUsefulModelImageUrl(imageUrl)) continue;

        fileCandidates.push({
          category,
          file,
          metadata,
          imageUrl,
          title,
          confidence,
        });
      }
    }

    const best = fileCandidates
      .filter((candidate) => candidate.metadata?.license)
      .sort((a, b) => b.confidence - a.confidence)[0];

    if (!best) {
      return {
        sourceName: "Wikimedia Commons Categories",
        sourceUrl: commonsCategoryUrl(categories[0].title),
        title: categories[0].title.replace(/^Category:/, ""),
        description: null,
        imageUrl: null,
        imageSourceUrl: null,
        imageLicense: null,
        imageAttribution: null,
        imageAttributionUrl: null,
        confidence: categories[0].score,
        requiresManualReview: true,
        notes: ["No licensed image file found in matching Commons categories."],
      } satisfies ModelMetadataCandidate;
    }

    const sourceUrl = best.metadata?.sourceUrl || commonsCategoryUrl(best.category.title);
    const notes = [];
    if (best.confidence < 82) {
      notes.push("Commons category image match is below automatic approval threshold.");
    }

    return {
      sourceName: "Wikimedia Commons Categories",
      sourceUrl: commonsCategoryUrl(best.category.title),
      title: best.title,
      description: null,
      imageUrl: best.imageUrl,
      imageSourceUrl: sourceUrl,
      imageLicense: best.metadata?.license || null,
      imageAttribution: best.metadata?.attribution || best.title,
      imageAttributionUrl: best.metadata?.attributionUrl || sourceUrl,
      confidence: best.confidence,
      requiresManualReview: best.confidence < 82 || !best.metadata?.license,
      notes,
    } satisfies ModelMetadataCandidate;
  },
};

async function findCommonsCategories(record: ModelCatalogRecord) {
  const directTitles = buildDirectCategoryTitles(record);
  const directCategories = await Promise.all(
    directTitles.map(async (title) => {
      const files = await fetchCategoryFiles(title).catch(() => []);
      return files.length > 0
        ? {
            title,
            score: scoreCommonsCategory(title, record),
          }
        : null;
    }),
  );

  const searchedCategories = await searchCommonsCategories(record).catch(() => []);
  const seen = new Set<string>();
  return [...directCategories.filter((item): item is CategoryCandidate => Boolean(item)), ...searchedCategories]
    .filter((category) => {
      if (seen.has(category.title)) return false;
      seen.add(category.title);
      return category.score >= 68;
    })
    .sort((a, b) => b.score - a.score);
}

async function searchCommonsCategories(record: ModelCatalogRecord): Promise<CategoryCandidate[]> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: buildModelSearchQuery(record.makeName, record.modelName),
    srnamespace: "14",
    srlimit: "12",
    format: "json",
    origin: "*",
  });

  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers: {
      "User-Agent": "SUPERCAR-DASH-model-catalog/1.0 (contact: support@supercars.market)",
    },
  });

  if (!response.ok) {
    throw new Error(`Commons category search failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as CommonsCategorySearchResponse;
  return (data.query?.search || [])
    .map((item) => ({
      title: item.title,
      score: scoreCommonsCategory(`${item.title} ${item.snippet || ""}`, record),
    }))
    .sort((a, b) => b.score - a.score);
}

async function fetchCategoryFiles(categoryTitle: string) {
  const params = new URLSearchParams({
    action: "query",
    list: "categorymembers",
    cmtitle: categoryTitle,
    cmtype: "file",
    cmlimit: "24",
    format: "json",
    origin: "*",
  });

  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers: {
      "User-Agent": "SUPERCAR-DASH-model-catalog/1.0 (contact: support@supercars.market)",
    },
  });

  if (!response.ok) {
    throw new Error(`Commons category members failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as CommonsCategoryMembersResponse;
  return (data.query?.categorymembers || []).filter((item) => item.ns === 6 && isLikelyVehicleFile(item.title));
}

function buildDirectCategoryTitles(record: ModelCatalogRecord) {
  const names = new Set<string>();
  const rawModel = record.modelName.trim();
  const baseModel = simplifyModelName(rawModel);

  for (const modelName of [rawModel, baseModel]) {
    if (!modelName) continue;
    names.add(`Category:${record.makeName} ${modelName}`);
    names.add(`Category:${modelName}`);
  }

  return Array.from(names);
}

function scoreCommonsCategory(value: string, record: ModelCatalogRecord) {
  const normalizedValue = normalizeCatalogText(value);
  const normalizedMake = normalizeCatalogText(record.makeName);
  const normalizedModel = normalizeCatalogText(record.modelName);
  const simplifiedModel = normalizeCatalogText(simplifyModelName(record.modelName));
  let score = scoreTitleMatch(value, record.makeName, record.modelName);

  if (normalizedValue.includes(normalizedMake)) score += 10;
  if (simplifiedModel && normalizedValue.includes(simplifiedModel)) score += 24;
  if (/logo|badge|emblem|interior|parts|wheel|engine|scale model|toy/i.test(value)) score -= 35;
  if (/automobile|cars|vehicles|racing cars|sports cars/i.test(value)) score += 4;
  if (normalizedModel.includes("vgt") && !normalizedValue.includes("vgt") && !normalizedValue.includes("vision gran turismo")) score -= 20;

  return Math.max(0, Math.min(100, score));
}

function scoreCommonsCategoryImage(value: string, record: ModelCatalogRecord, categoryScore: number) {
  const filename = getCommonsFilename(value) || value;
  const normalizedValue = normalizeCatalogText(value);
  const simplifiedModel = normalizeCatalogText(simplifyModelName(record.modelName));
  let score = Math.round(categoryScore * 0.7 + scoreCommonsCategory(value, record) * 0.3);

  if (simplifiedModel && normalizedValue.includes(simplifiedModel)) score += 8;
  if (/logo|badge|emblem|interior|parts|wheel|engine|scale model|toy|diecast/i.test(filename)) score -= 45;
  if (/front|rear|side|show|salon|street|road|race|rally/i.test(filename)) score += 3;

  return Math.max(0, Math.min(100, score));
}

function simplifyModelName(value: string) {
  return value
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(gr\.?\s?[134b]|group\s?[134b]|vgt|vision gran turismo|safety car|pace car|race car|racing car|rally car|drift car|road car|concept|prototype|touring car)\b/gi, " ")
    .replace(/\b(gt500|gt300|gt3|gt4|gte|lm|super gt|dtm|pikes peak|endurance model|sprint model)\b/gi, " ")
    .replace(/\b(type\s?[rs]|v[\s-]?spec|edition|limited|premium|performance|sport|sports|allure|line)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyVehicleFile(title: string) {
  return /\.(jpe?g|png|webp|tiff?)$/i.test(title) && !/logo|badge|emblem|interior|wheel|engine|diagram|map|svg/i.test(title);
}

function commonsCategoryUrl(title: string) {
  return `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}
