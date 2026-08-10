import { PrismaClient } from "@prisma/client";
import { canonicalBaseModelName } from "@/lib/model-catalog/base-model";
import { fetchCommonsImageMetadata } from "@/lib/model-catalog/sources/commons";
import { normalizeCatalogText } from "@/lib/model-catalog/normalizer";

const prisma = new PrismaClient();

type CliOptions = {
  make: string | null;
  limitMakes: number;
  categoryLimit: number;
  filesPerCategory: number;
  directSearchLimit: number;
  openverseLimit: number;
  delayMs: number;
};

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

type CommonsFileSearchResponse = {
  query?: {
    search?: Array<{
      title: string;
      snippet?: string;
    }>;
  };
};

type OpenverseImageResponse = {
  results?: Array<{
    title?: string | null;
    foreign_landing_url?: string | null;
    url?: string | null;
    creator?: string | null;
    creator_url?: string | null;
    license?: string | null;
    license_version?: string | null;
    license_url?: string | null;
    tags?: Array<{ name?: string | null }>;
  }>;
};

const OPENVERSE_LICENSES = ["cc0", "by", "by-sa", "by-nc", "by-nc-sa", "pdm"];

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const makes = await prisma.make.findMany({
    where: options.make ? { name: { equals: options.make, mode: "insensitive" } } : {},
    include: {
      models: {
        include: {
          images: true,
        },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
    take: options.limitMakes,
  });

  let candidatesCreated = 0;
  let candidatesUpdated = 0;
  let categoriesScanned = 0;

  for (const make of makes) {
    const missingModels = make.models.filter((model) => !model.images.some((image) => image.type?.toLowerCase() !== "candidate" && image.reviewStatus !== "NEEDS_REVIEW"));
    const baseFamilies = buildBaseFamilies(missingModels.map((model) => model.name), make.name);
    console.log(`[model-image-pool] ${make.name}: ${missingModels.length} missing models, ${baseFamilies.length} base families.`);

    const categoryQueries = [make.name, ...baseFamilies.map((family) => `${make.name} ${family}`)].slice(0, options.categoryLimit);
    for (const query of categoryQueries) {
      const categories = await searchCommonsCategories(query).catch((error) => {
        console.warn(`[model-image-pool] Commons category search failed for ${query}:`, error instanceof Error ? error.message : error);
        return [];
      });

      for (const category of categories.slice(0, 4)) {
        categoriesScanned += 1;
        const files = await fetchCategoryFiles(category.title).catch(() => []);
        for (const file of files.slice(0, options.filesPerCategory)) {
          const metadata = await fetchCommonsImageMetadata(file.title).catch(() => null);
          if (!metadata?.imageUrl || !metadata.license) continue;
          const title = file.title.replace(/^File:/i, "");
          const result = await upsertCandidate({
            makeName: make.name,
            url: metadata.imageUrl,
            source: "COMMONS_CATEGORY_POOL",
            sourceName: "Wikimedia Commons Category Pool",
            sourceUrl: metadata.sourceUrl || commonsCategoryUrl(category.title),
            license: metadata.license,
            attribution: metadata.attribution,
            attributionUrl: metadata.attributionUrl,
            title,
            category: category.title,
            context: `${category.title} ${title}`,
            baseModelName: inferBestBaseFamily(`${category.title} ${title}`, baseFamilies),
          });
          candidatesCreated += result.created ? 1 : 0;
          candidatesUpdated += result.created ? 0 : 1;
        }
        await sleep(options.delayMs);
      }
    }

    const directQueries = buildDirectSearchQueries(
      make.name,
      missingModels.map((model) => model.name),
      baseFamilies,
    ).slice(0, options.directSearchLimit);
    for (const query of directQueries) {
      const files = await searchCommonsFiles(query).catch((error) => {
        console.warn(`[model-image-pool] Commons file search failed for ${query}:`, error instanceof Error ? error.message : error);
        return [];
      });
      for (const file of files.slice(0, options.filesPerCategory)) {
        const metadata = await fetchCommonsImageMetadata(file.title).catch(() => null);
        if (!metadata?.imageUrl || !metadata.license) continue;
        const title = file.title.replace(/^File:/i, "");
        const result = await upsertCandidate({
          makeName: make.name,
          url: metadata.imageUrl,
          source: "COMMONS_FILE_POOL",
          sourceName: "Wikimedia Commons File Pool",
          sourceUrl: metadata.sourceUrl || commonsFileUrl(file.title),
          license: metadata.license,
          attribution: metadata.attribution,
          attributionUrl: metadata.attributionUrl,
          title,
          category: null,
          context: `${query} ${title} ${file.snippet || ""}`,
          baseModelName: inferBestBaseFamily(`${query} ${title} ${file.snippet || ""}`, baseFamilies),
        });
        candidatesCreated += result.created ? 1 : 0;
        candidatesUpdated += result.created ? 0 : 1;
      }
      await sleep(options.delayMs);
    }

    for (const family of baseFamilies.slice(0, options.openverseLimit)) {
      const results = await searchOpenverse(`${make.name} ${family} car`).catch(() => []);
      for (const item of results) {
        if (!item.url || !item.license) continue;
        const result = await upsertCandidate({
          makeName: make.name,
          url: item.url,
          source: "OPENVERSE_POOL",
          sourceName: "Openverse Pool",
          sourceUrl: item.foreign_landing_url || item.url,
          license: formatOpenverseLicense(item),
          attribution: [item.creator, item.title].filter(Boolean).join(" - ") || item.title || null,
          attributionUrl: item.creator_url || item.foreign_landing_url || item.url,
          title: item.title || null,
          category: null,
          context: `${item.title || ""} ${(item.tags || []).map((tag) => tag.name).filter(Boolean).join(" ")} ${item.foreign_landing_url || ""}`,
          baseModelName: family,
        });
        candidatesCreated += result.created ? 1 : 0;
        candidatesUpdated += result.created ? 0 : 1;
      }
      await sleep(options.delayMs);
    }
  }

  console.log(`[model-image-pool] Categories scanned: ${categoriesScanned}`);
  console.log(`[model-image-pool] Candidates created: ${candidatesCreated}`);
  console.log(`[model-image-pool] Candidates updated: ${candidatesUpdated}`);
}

async function searchCommonsFiles(query: string) {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `${query} filetype:bitmap`,
    srnamespace: "6",
    srlimit: "12",
    format: "json",
    origin: "*",
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers: { "User-Agent": "SUPERCAR-DASH-model-image-pool/1.0 (contact: support@supercars.market)" },
  });
  if (!response.ok) throw new Error(`Commons file search HTTP ${response.status}`);
  const data = (await response.json()) as CommonsFileSearchResponse;
  return (data.query?.search || [])
    .filter((item) => isLikelyVehicleFile(item.title))
    .filter((item) => scoreContext(`${item.title} ${item.snippet || ""}`, query) >= 45)
    .sort((a, b) => scoreContext(`${b.title} ${b.snippet || ""}`, query) - scoreContext(`${a.title} ${a.snippet || ""}`, query));
}

async function upsertCandidate(input: {
  makeName: string;
  url: string;
  source: string;
  sourceName: string;
  sourceUrl: string | null;
  license: string | null;
  attribution: string | null;
  attributionUrl: string | null;
  title: string | null;
  category: string | null;
  context: string | null;
  baseModelName: string | null;
}) {
  const existing = await prisma.modelImageCandidate.findUnique({
    where: {
      source_url_makeName: {
        source: input.source,
        url: input.url,
        makeName: input.makeName,
      },
    },
  });
  const data = {
    makeName: input.makeName,
    url: input.url,
    source: input.source,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    license: input.license,
    attribution: input.attribution,
    attributionUrl: input.attributionUrl,
    title: input.title,
    category: input.category,
    context: input.context,
    baseModelName: input.baseModelName,
  };

  if (existing) {
    await prisma.modelImageCandidate.update({ where: { id: existing.id }, data });
    return { created: false };
  }

  await prisma.modelImageCandidate.create({ data });
  return { created: true };
}

async function searchCommonsCategories(query: string) {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srnamespace: "14",
    srlimit: "10",
    format: "json",
    origin: "*",
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers: { "User-Agent": "SUPERCAR-DASH-model-image-pool/1.0 (contact: support@supercars.market)" },
  });
  if (!response.ok) throw new Error(`Commons category search HTTP ${response.status}`);
  const data = (await response.json()) as CommonsCategorySearchResponse;
  return (data.query?.search || [])
    .filter((item) => scoreContext(item.title, query) >= 48)
    .sort((a, b) => scoreContext(b.title, query) - scoreContext(a.title, query));
}

async function fetchCategoryFiles(categoryTitle: string) {
  const params = new URLSearchParams({
    action: "query",
    list: "categorymembers",
    cmtitle: categoryTitle,
    cmtype: "file",
    cmlimit: "40",
    format: "json",
    origin: "*",
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers: { "User-Agent": "SUPERCAR-DASH-model-image-pool/1.0 (contact: support@supercars.market)" },
  });
  if (!response.ok) throw new Error(`Commons category members HTTP ${response.status}`);
  const data = (await response.json()) as CommonsCategoryMembersResponse;
  return (data.query?.categorymembers || []).filter((item) => item.ns === 6 && isLikelyVehicleFile(item.title));
}

async function searchOpenverse(query: string) {
  const params = new URLSearchParams({
    q: query,
    page_size: "20",
    license: OPENVERSE_LICENSES.join(","),
  });
  const response = await fetch(`https://api.openverse.org/v1/images/?${params.toString()}`, {
    headers: { "User-Agent": "SUPERCAR-DASH-model-image-pool/1.0 (contact: support@supercars.market)" },
  });
  if (!response.ok) throw new Error(`Openverse search HTTP ${response.status}`);
  const data = (await response.json()) as OpenverseImageResponse;
  return (data.results || []).filter((item) => item.url && !/logo|badge|emblem|interior|wheel|engine|headlight|tail light|taillight|lamp|leuchte|patent|toy|diecast/i.test(`${item.title || ""} ${item.url}`));
}

function buildBaseFamilies(modelNames: string[], makeName: string) {
  const counts = new Map<string, number>();
  for (const modelName of modelNames) {
    const base = canonicalBaseModelName(modelName, makeName);
    if (!base || base.length < 2) continue;
    counts.set(base, (counts.get(base) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([base]) => base);
}

function buildDirectSearchQueries(makeName: string, modelNames: string[], baseFamilies: string[]) {
  const queries = new Set<string>();
  for (const modelName of modelNames) {
    queries.add(`${makeName} ${stripGameVariantTerms(modelName)}`.trim());
    const base = canonicalBaseModelName(modelName, makeName);
    if (base) queries.add(`${makeName} ${base}`.trim());
  }
  for (const family of baseFamilies) {
    queries.add(`${makeName} ${family}`.trim());
  }
  return Array.from(queries).filter((query) => query.length >= makeName.length + 3);
}

function stripGameVariantTerms(value: string) {
  return value
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(gr\.?\s?[134b]|group\s?[134b]|vgt|vision gran turismo|safety car|race car|rally car|road car|touring car)\b/gi, " ")
    .replace(/\b(gt500|gt300|gt3|gt4|gte|super gt|dtm|endurance model|sprint model)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferBestBaseFamily(context: string, families: string[]) {
  const normalizedContext = normalizeCatalogText(context);
  return families
    .filter((family) => normalizedContext.includes(normalizeCatalogText(family)))
    .sort((a, b) => b.length - a.length)[0] || null;
}

function scoreContext(value: string, query: string) {
  const valueTokens = new Set(normalizeCatalogText(value).split(" ").filter(Boolean));
  const queryTokens = normalizeCatalogText(query).split(" ").filter((token) => token.length > 1);
  const matched = queryTokens.filter((token) => valueTokens.has(token)).length;
  return queryTokens.length ? Math.round((matched / queryTokens.length) * 100) : 0;
}

function formatOpenverseLicense(item: NonNullable<OpenverseImageResponse["results"]>[number]) {
  const license = item.license?.trim();
  if (!license) return null;
  const version = item.license_version?.trim();
  const url = item.license_url?.trim();
  const label = version ? `${license.toUpperCase()} ${version}` : license.toUpperCase();
  return url ? `${label} (${url})` : label;
}

function isLikelyVehicleFile(title: string) {
  return /\.(jpe?g|png|webp|tiff?)$/i.test(title) && !/logo|badge|emblem|interior|wheel|engine|headlight|tail light|taillight|lamp|leuchte|patent|diagram|map|svg/i.test(title);
}

function commonsCategoryUrl(title: string) {
  return `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function commonsFileUrl(title: string) {
  return `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function parseOptions(args: string[]): CliOptions {
  const getValue = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  return {
    make: getValue("make") || null,
    limitMakes: Math.max(1, Number(getValue("limit-makes")) || 6),
    categoryLimit: Math.max(1, Number(getValue("category-limit")) || 12),
    filesPerCategory: Math.max(1, Number(getValue("files-per-category")) || 8),
    directSearchLimit: Math.max(0, Number(getValue("direct-search-limit")) || 20),
    openverseLimit: Math.max(0, Number(getValue("openverse-limit")) || 8),
    delayMs: Math.max(0, Number(getValue("delay-ms")) || 1200),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .catch((error) => {
    console.error("[model-image-pool] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
