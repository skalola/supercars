import * as cheerio from "cheerio";
import type { PrismaClient } from "@prisma/client";
import {
  buildFerrariCanonicalPartKey,
  ensureFerrariPartTaxonomy,
  FERRARI_PART_CATEGORIES,
  getFerrariCategorySlug,
  mapFerrariSourceCategory,
  normalizeOemPartNumber,
} from "@/lib/parts/ferrari-taxonomy";
import { toPartSlug } from "@/lib/parts/slug";
import { getCatalogNodePlaceholderUrl } from "@/lib/parts/visual-placeholders";

const SCUDERIA_ORIGIN = "https://www.scuderiacarparts.com";
const FERRARI_ROOT = `${SCUDERIA_ORIGIN}/part-finder/ferrari`;
const DEFAULT_DELAY_MS = 1_100;

export type ScuderiaCatalogPart = {
  oemPartNumber: string;
  name: string;
  sourceCategory: string;
  diagramReference: string | null;
  sourceUrl: string;
  observedPriceCents: number | null;
  modelSlug: string;
  variantName: string | null;
};

export type ScuderiaCoverageReport = {
  supercarDashModels: number;
  sourceModelsFound: number;
  modelsMapped: string[];
  modelsUnmapped: string[];
  variantsDiscovered: number;
  categoriesDiscovered: number;
  diagramsVisited: number;
  canonicalPartsImported: number;
  partsWithOemNumber: number;
  partsWithoutOemNumber: number;
  duplicateOemRecordsPrevented: number;
  failedSourceUrls: Array<{ url: string; error: string }>;
  coverageByModel: Record<string, { variants: number; categories: number; parts: number }>;
};

type FetchPage = (url: string) => Promise<string>;

type CrawlOptions = {
  prisma: PrismaClient;
  fetchPage?: FetchPage;
  delayMs?: number;
  maxModels?: number;
  maxDiagramsPerModel?: number;
};

export async function crawlScuderiaFerrariCatalog(options: CrawlOptions): Promise<ScuderiaCoverageReport> {
  const fetchPage = options.fetchPage ?? fetchScuderiaPage;
  const delayMs = Math.max(DEFAULT_DELAY_MS, options.delayMs ?? DEFAULT_DELAY_MS);
  const report = await createEmptyReport(options.prisma);
  const run = await options.prisma.partSourceRun.create({
    data: { source: "SCUDERIA_CAR_PARTS", runType: "CATALOG", makeSlug: "ferrari" },
    select: { id: true },
  });
  await ensureFerrariPartTaxonomy(options.prisma);

  try {
    const rootHtml = await fetchWithReport(FERRARI_ROOT, fetchPage, report);
    if (!rootHtml) return await finishRun(options.prisma, run.id, report, "BLOCKED");

    const sourceModels = parseSelectOptions(rootHtml, "Select Model")
      .filter((option) => isFerrariCatalogUrl(option.url))
      .slice(0, options.maxModels);
    report.sourceModelsFound = sourceModels.length;

    const databaseModels = await options.prisma.model.findMany({
      where: { make: { slug: "ferrari" } },
      select: { id: true, name: true, slug: true },
    });

    for (const sourceModel of sourceModels) {
      const sourceModelSlug = getFerrariPathSegments(sourceModel.url)[2] || "";
      const sourceModelMatch = matchFerrariModel(sourceModelSlug, sourceModel.label, databaseModels);
      if (!sourceModelMatch) {
        report.modelsUnmapped.push(sourceModel.label);
        continue;
      }
      if (!report.modelsMapped.includes(sourceModelMatch.name)) report.modelsMapped.push(sourceModelMatch.name);
      report.coverageByModel[sourceModelMatch.slug] ??= { variants: 0, categories: 0, parts: 0 };

      await sleep(delayMs);
      const modelHtml = await fetchWithReport(sourceModel.url, fetchPage, report);
      if (!modelHtml) continue;
      const oeUrl = parseSelectOptions(modelHtml, "Select Product Type")
        .find((option) => /original parts/i.test(option.label))?.url ?? `${sourceModel.url}/oe`;

      await sleep(delayMs);
      const oeHtml = await fetchWithReport(oeUrl, fetchPage, report);
      if (!oeHtml) continue;
      const variants = parseSelectOptions(oeHtml, "Select Model Variant").filter((option) => isFerrariCatalogUrl(option.url));
      report.variantsDiscovered += variants.length;

      for (const variant of variants) {
        const databaseModel = matchFerrariModel(sourceModelSlug, variant.label, databaseModels);
        if (!databaseModel) {
          if (!report.modelsUnmapped.includes(variant.label)) report.modelsUnmapped.push(variant.label);
          continue;
        }
        if (!report.modelsMapped.includes(databaseModel.name)) report.modelsMapped.push(databaseModel.name);
        report.coverageByModel[databaseModel.slug] ??= { variants: 0, categories: 0, parts: 0 };
        report.coverageByModel[databaseModel.slug].variants += 1;
        await sleep(delayMs);
        const variantHtml = await fetchWithReport(variant.url, fetchPage, report);
        if (!variantHtml) continue;
        const categories = parseSelectOptions(variantHtml, "Select Main OE Parts Main Category").filter((option) => isFerrariCatalogUrl(option.url));
        report.categoriesDiscovered += categories.length;
        report.coverageByModel[databaseModel.slug].categories += categories.length;

        for (const category of categories) {
          await sleep(delayMs);
          const categoryHtml = await fetchWithReport(category.url, fetchPage, report);
          if (!categoryHtml) continue;
          const diagrams = parseSelectOptions(categoryHtml, "Select Sub Category OE Parts")
            .filter((option) => isFerrariCatalogUrl(option.url))
            .slice(0, options.maxDiagramsPerModel);

          for (const diagram of diagrams) {
            await sleep(delayMs);
            const diagramHtml = await fetchWithReport(diagram.url, fetchPage, report);
            if (!diagramHtml) continue;
            report.diagramsVisited += 1;
            const parts = parseScuderiaDiagram(diagramHtml, {
              sourceCategory: category.label,
              sourceUrl: diagram.url,
              modelSlug: databaseModel.slug,
              variantName: cleanFerrariLabel(variant.label),
            });
            report.partsWithoutOemNumber += countDiagramRowsWithoutOem(diagramHtml);
            await persistScuderiaParts(options.prisma, databaseModel.id, parts, report);
          }
        }
      }
    }

    return await finishRun(options.prisma, run.id, report, report.failedSourceUrls.length ? "PARTIAL" : "COMPLETED");
  } catch (error) {
    await options.prisma.partSourceRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorSummary: getErrorMessage(error),
        stats: report,
        failedUrls: report.failedSourceUrls,
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

export function parseScuderiaDiagram(
  html: string,
  context: Pick<ScuderiaCatalogPart, "sourceCategory" | "sourceUrl" | "modelSlug" | "variantName">,
) {
  const $ = cheerio.load(html);
  const diagramReference = getFerrariPathSegments(context.sourceUrl).at(-1) ?? null;
  const parts: ScuderiaCatalogPart[] = [];

  $("tr.diagrow").each((_, row) => {
    const partLink = $(row).find('a.parturl[href*="/part/"]').first();
    const cells = $(row).find("td");
    const rawOem = partLink.text().trim() || cells.eq(2).text().trim();
    const oemPartNumber = normalizeOemPartNumber(rawOem);
    const name = $(row).find("#hiddiagpartdesc a.parturl").first().text().replace(/\s+/g, " ").trim()
      || $(row).find("td.visible-sm a.parturl").last().text().replace(/\s+/g, " ").trim();
    if (!oemPartNumber || !name) return;

    const priceText = cells.eq(5).text().trim();
    parts.push({
      ...context,
      oemPartNumber,
      name,
      diagramReference,
      sourceUrl: toAbsoluteScuderiaUrl(partLink.attr("href") || context.sourceUrl),
      observedPriceCents: parsePriceCents(priceText),
    });
  });

  return dedupeParts(parts);
}

export function parseSelectOptions(html: string, ariaLabel: string) {
  const $ = cheerio.load(html);
  return $(`select[aria-label="${ariaLabel}"] option`)
    .map((_, option) => ({
      label: $(option).text().replace(/\s+/g, " ").trim(),
      url: toAbsoluteScuderiaUrl($(option).attr("value") || ""),
    }))
    .get()
    .filter((option) => option.label && option.url !== SCUDERIA_ORIGIN);
}

async function persistScuderiaParts(
  prisma: PrismaClient,
  modelId: string,
  parts: ScuderiaCatalogPart[],
  report: ScuderiaCoverageReport,
) {
  const ferrariBrand = await prisma.partBrand.upsert({
    where: { slug: "ferrari-oem" },
    update: { active: true },
    create: { name: "Ferrari OEM", slug: "ferrari-oem", country: "Italy", active: true },
    select: { id: true },
  });

  for (const part of parts) {
    report.partsWithOemNumber += 1;
    const categoryName = mapFerrariSourceCategory(part.sourceCategory);
    const categorySlug = getFerrariCategorySlug(categoryName);
    const category = await prisma.partCategory.upsert({
      where: { slug: categorySlug },
      update: { active: true },
      create: {
        name: categoryName,
        slug: categorySlug,
        description: `Normalized Ferrari ${categoryName.toLowerCase()} catalog parts.`,
        displayOrder: FERRARI_PART_CATEGORIES.indexOf(categoryName) * 10 + 10,
        active: true,
      },
      select: { id: true },
    });
    const canonicalKey = buildFerrariCanonicalPartKey(part.oemPartNumber);
    const existing = await prisma.performancePart.findUnique({ where: { canonicalKey }, select: { id: true } });
    if (existing) report.duplicateOemRecordsPrevented += 1;
    const canonicalData = buildScuderiaCanonicalPartData(part, category.id, ferrariBrand.id);
    const canonical = await prisma.performancePart.upsert({
      where: { canonicalKey },
      update: {
        ...canonicalData,
        lastCheckedAt: new Date(),
      },
      create: {
        canonicalKey,
        ...canonicalData,
        slug: `${toPartSlug(part.name)}-${part.oemPartNumber.toLowerCase()}`,
        sourceName: "Scuderia Car Parts",
        sourceConfidence: "SOURCE_VERIFIED",
        status: "ACTIVE",
        imageUrl: getCatalogNodePlaceholderUrl(categorySlug, categorySlug),
        lastCheckedAt: new Date(),
      },
      select: { id: true },
    });
    const compatibility = await prisma.partCompatibility.findFirst({
      where: {
        partId: canonical.id,
        modelId,
        trim: part.variantName,
        yearStart: null,
        yearEnd: null,
        engine: null,
      },
      select: { id: true },
    });
    if (compatibility) {
      await prisma.partCompatibility.update({
        where: { id: compatibility.id },
        data: { confidence: "SOURCE_VERIFIED" },
      });
    } else {
      await prisma.partCompatibility.create({
        data: {
          partId: canonical.id,
          modelId,
          trim: part.variantName,
          confidence: "SOURCE_VERIFIED",
        },
      });
    }
    if (!existing) report.canonicalPartsImported += 1;
    report.coverageByModel[part.modelSlug] ??= { variants: 0, categories: 0, parts: 0 };
    report.coverageByModel[part.modelSlug].parts += 1;
  }
}

export function buildScuderiaCanonicalPartData(part: ScuderiaCatalogPart, categoryId: string, brandId: string) {
  return {
    categoryId,
    brandId,
    name: part.name,
    componentType: normalizeComponentType(part.name),
    partNumber: part.oemPartNumber,
    oemPartNumber: part.oemPartNumber,
    sourceUrl: part.sourceUrl,
    sourceCatalog: "SCUDERIA_FERRARI_OE",
    sourceCategory: part.sourceCategory,
    diagramReference: part.diagramReference,
  };
}

async function fetchScuderiaPage(url: string) {
  assertFerrariCatalogUrl(url);
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "SupercarDashCatalogBot/1.0 (+https://supercardash.com)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchWithReport(url: string, fetchPage: FetchPage, report: ScuderiaCoverageReport) {
  try {
    assertFerrariCatalogUrl(url);
    return await fetchPage(url);
  } catch (error) {
    report.failedSourceUrls.push({ url, error: getErrorMessage(error) });
    return null;
  }
}

async function createEmptyReport(prisma: PrismaClient): Promise<ScuderiaCoverageReport> {
  return {
    supercarDashModels: await prisma.model.count({ where: { make: { slug: "ferrari" } } }),
    sourceModelsFound: 0,
    modelsMapped: [],
    modelsUnmapped: [],
    variantsDiscovered: 0,
    categoriesDiscovered: 0,
    diagramsVisited: 0,
    canonicalPartsImported: 0,
    partsWithOemNumber: 0,
    partsWithoutOemNumber: 0,
    duplicateOemRecordsPrevented: 0,
    failedSourceUrls: [],
    coverageByModel: {},
  };
}

async function finishRun(prisma: PrismaClient, runId: string, report: ScuderiaCoverageReport, status: string) {
  await prisma.partSourceRun.update({
    where: { id: runId },
    data: {
      status,
      stats: report,
      failedUrls: report.failedSourceUrls,
      errorSummary: status === "BLOCKED" ? "Scuderia rejected the server-side catalog request." : null,
      completedAt: new Date(),
    },
  });
  return report;
}

function matchFerrariModel(
  sourceSlug: string,
  sourceLabel: string,
  models: Array<{ id: string; name: string; slug: string }>,
) {
  const sourceTokens = new Set(normalizeModelName(`${sourceSlug} ${cleanFerrariLabel(sourceLabel)}`).split(" "));
  const ranked = models
    .map((model) => ({ model, score: normalizeModelName(`${model.slug} ${model.name}`).split(" ").filter((token) => sourceTokens.has(token)).length }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score ? ranked[0].model : null;
}

function normalizeModelName(value: string) {
  return value.toLowerCase().replace(/ferrari/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeComponentType(value: string) {
  return value
    .replace(/\b(COMPL\.?|COMPLETE)\b/gi, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function cleanFerrariLabel(value: string) {
  return value.replace(/^Ferrari\s+/i, "").trim();
}

function dedupeParts(parts: ScuderiaCatalogPart[]) {
  return [...new Map(parts.map((part) => [part.oemPartNumber, part])).values()];
}

function countDiagramRowsWithoutOem(html: string) {
  const $ = cheerio.load(html);
  let count = 0;
  $("tr.diagrow").each((_, row) => {
    const rawOem = $(row).find('a.parturl[href*="/part/"]').first().text().trim();
    if (!normalizeOemPartNumber(rawOem)) count += 1;
  });
  return count;
}

function parsePriceCents(value: string) {
  const amount = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

function toAbsoluteScuderiaUrl(value: string) {
  try {
    return new URL(value, SCUDERIA_ORIGIN).toString().replace(/\/$/, "");
  } catch {
    return SCUDERIA_ORIGIN;
  }
}

function getFerrariPathSegments(url: string) {
  return new URL(url).pathname.split("/").filter(Boolean);
}

function isFerrariCatalogUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.origin === SCUDERIA_ORIGIN && parsed.pathname.startsWith("/part-finder/ferrari");
  } catch {
    return false;
  }
}

function assertFerrariCatalogUrl(url: string) {
  if (!isFerrariCatalogUrl(url)) throw new Error(`Refusing non-Ferrari Scuderia URL: ${url}`);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown source error";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
