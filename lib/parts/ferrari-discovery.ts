import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  EbayBrowseError,
  searchEbayOffersForFerrariComponentQuery,
} from "@/lib/ebay/browse.server";
import { FERRARI_AFTERMARKET_QUERY_BRANDS } from "@/lib/parts/ferrari-component-library";
import {
  loadFerrariExistingOffers,
  persistFerrariDiscoveredOffer,
} from "@/lib/parts/ferrari-product-normalizer";
import { ensureEbayOfferProvider } from "@/lib/parts/ebay-partner";
import { buildPreferredBrandSearchTemplates } from "@/lib/parts/preferred-brands";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_OFFER_TTL_MS = 8 * DAY_MS;

export type FerrariDiscoveryOptions = {
  maxQueries?: number;
  resultsPerQuery?: number;
  delayMs?: number;
  refreshHours?: number;
  modelSlugs?: string[];
  categorySlugs?: string[];
  maxRetries?: number;
  mappingIds?: string[];
  exhaustiveRecovery?: boolean;
};

export type FerrariDiscoveryReport = {
  ferrariModelsInDatabase: number;
  modelsProcessed: string[];
  modelComponentMappingsVisited: number;
  queriesExecuted: number;
  freshQueriesSkipped: number;
  resumedQueries: number;
  listingsExamined: number;
  listingsAccepted: number;
  listingsRejected: number;
  productFamiliesTouched: number;
  identifiersTouched: number;
  activeAffiliateOffersTouched: number;
  offersUnchanged: number;
  offerHeartbeats: number;
  offersUpdated: number;
  offersInserted: number;
  offerFullWritesAvoided: number;
  apiFailures: number;
  rateLimitEvents: number;
  stoppedByRateLimit: boolean;
  failedQueries: Array<{ query: string; error: string }>;
};

export async function discoverFerrariParts(prisma: PrismaClient, options: FerrariDiscoveryOptions = {}) {
  const maxQueries = clampInteger(options.maxQueries ?? 100, 1, 5_000);
  const resultsPerQuery = clampInteger(options.resultsPerQuery ?? 20, 1, 50);
  const delayMs = clampInteger(options.delayMs ?? 350, 0, 10_000);
  const maxRetries = clampInteger(options.maxRetries ?? 2, 0, 5);
  const refreshMs = Math.max(1, options.refreshHours ?? 168) * 60 * 60 * 1000;
  const now = new Date();
  const report: FerrariDiscoveryReport = {
    ferrariModelsInDatabase: 0,
    modelsProcessed: [],
    modelComponentMappingsVisited: 0,
    queriesExecuted: 0,
    freshQueriesSkipped: 0,
    resumedQueries: 0,
    listingsExamined: 0,
    listingsAccepted: 0,
    listingsRejected: 0,
    productFamiliesTouched: 0,
    identifiersTouched: 0,
    activeAffiliateOffersTouched: 0,
    offersUnchanged: 0,
    offerHeartbeats: 0,
    offersUpdated: 0,
    offersInserted: 0,
    offerFullWritesAvoided: 0,
    apiFailures: 0,
    rateLimitEvents: 0,
    stoppedByRateLimit: false,
    failedQueries: [],
  };
  const run = await prisma.partSourceRun.create({
    data: { source: "EBAY_BROWSE_API", runType: "FERRARI_COMPONENT_DISCOVERY", makeSlug: "ferrari" },
    select: { id: true },
  });

  try {
    const [ferrari, knownModels, partner, preferredBrandMappings] = await Promise.all([
      prisma.make.findUnique({ where: { slug: "ferrari" }, select: { id: true, _count: { select: { models: true } } } }),
      prisma.model.findMany({ where: { make: { slug: "ferrari" } }, select: { name: true } }),
      ensureEbayOfferProvider(prisma),
      prisma.preferredPartBrand.findMany({
        where: { vehicleMake: { slug: "ferrari" }, active: true, partBrand: { active: true } },
        select: {
          componentCategoryId: true,
          componentTypeId: true,
          partBrand: { select: { name: true } },
        },
      }),
    ]);
    if (!ferrari) throw new Error("Ferrari make record is missing.");
    report.ferrariModelsInDatabase = ferrari._count.models;

    const mappings = await prisma.modelPartComponent.findMany({
      where: {
        active: true,
        model: {
          makeId: ferrari.id,
          ...(options.modelSlugs?.length ? { slug: { in: options.modelSlugs } } : {}),
        },
        componentType: {
          active: true,
          ...(options.categorySlugs?.length ? { category: { slug: { in: options.categorySlugs } } } : {}),
        },
        ...(options.mappingIds?.length ? { id: { in: options.mappingIds } } : {}),
      },
      select: {
        id: true,
        lastOfferSearchAt: true,
        model: {
          select: {
            id: true,
            name: true,
            slug: true,
            productionStartYear: true,
            productionEndYear: true,
          },
        },
        componentType: {
          select: {
            id: true,
            name: true,
            slug: true,
            performanceRelated: true,
            aliases: true,
            fitmentRisk: true,
            categoryId: true,
            category: { select: { slug: true } },
            searchTemplates: {
              where: { active: true },
              select: { template: true, priority: true },
              orderBy: { priority: "asc" },
            },
          },
        },
      },
      orderBy: [{ lastOfferSearchAt: "asc" }, { model: { name: "asc" } }, { componentType: { displayOrder: "asc" } }],
      take: 2_000,
    });
    const orderedMappings = interleaveBy(mappings, (mapping) => mapping.model.id);
    const modelNames = knownModels.map((model) => model.name);
    const processedModels = new Set<string>();
    const families = new Set<string>();
    const identifiers = new Set<string>();
    const offers = new Set<string>();

    mappingLoop: for (const mapping of orderedMappings) {
      if (report.queriesExecuted >= maxQueries) break;
      report.modelComponentMappingsVisited += 1;
      const year = mapping.model.productionEndYear ?? mapping.model.productionStartYear;
      let mappingRejected = 0;
      let mappingAccepted = 0;
      let mappingApiFailures = 0;
      let completedTemplates = 0;
      let attemptedTemplate = false;
      const preferredBrandNames = preferredBrandMappings
        .filter((preferred) =>
          preferred.componentTypeId === mapping.componentType.id ||
          (!preferred.componentTypeId && preferred.componentCategoryId === mapping.componentType.categoryId) ||
          (!preferred.componentTypeId && !preferred.componentCategoryId),
        )
        .map((preferred) => preferred.partBrand.name);
      const templates = buildPreferredBrandSearchTemplates(
        mapping.componentType.searchTemplates.map((template) => template.template),
        preferredBrandNames,
      );
      for (const template of templates) {
        if (report.queriesExecuted >= maxQueries) break;
        const query = interpolateQuery(template, mapping.model.name, mapping.componentType.name, year);
        if (!query) continue;
        const queryKey = hashQuery(`${mapping.id}:${query}`);
        const existingCheckpoint = await prisma.partDiscoveryQuery.findUnique({
          where: { queryKey },
          select: { id: true, status: true, attempts: true, refreshAfter: true },
        });
        const checkpoint = existingCheckpoint ?? await prisma.partDiscoveryQuery.create({
          data: { modelPartComponentId: mapping.id, queryKey, queryText: query, template },
          select: { id: true, status: true, attempts: true, refreshAfter: true },
        });
        if (checkpoint.refreshAfter && checkpoint.refreshAfter > now && checkpoint.status === "COMPLETED") {
          report.freshQueriesSkipped += 1;
          completedTemplates += 1;
          continue;
        }
        if (checkpoint.attempts > 0) report.resumedQueries += 1;
        processedModels.add(mapping.model.name);
        const referenceId = buildReference(mapping.model.slug, mapping.componentType.category.slug, mapping.componentType.slug, year);
        let templateAccepted = 0;
        try {
          const result = await withRetry(
            () => searchEbayOffersForFerrariComponentQuery({
              query,
              modelName: mapping.model.name,
              componentName: mapping.componentType.name,
              knownFerrariModels: modelNames,
              knownBrands: [...new Set([
                ...(FERRARI_AFTERMARKET_QUERY_BRANDS[mapping.componentType.category.slug] ?? []),
                ...preferredBrandNames,
              ])],
              aliases: readAliases(mapping.componentType.aliases),
              fitmentRisk: normalizeFitmentRisk(mapping.componentType.fitmentRisk),
              categorySlug: mapping.componentType.category.slug,
              year,
              referenceId,
              limit: resultsPerQuery,
            }),
            maxRetries,
          );
          report.queriesExecuted += 1;
          report.listingsExamined += result.examinedCount;
          report.listingsAccepted += result.offers.length;
          mappingAccepted += result.offers.length;
          templateAccepted = result.offers.length;
          report.listingsRejected += result.rejectedCount;
          mappingRejected += result.rejectedCount;
          const existingOffers = await loadFerrariExistingOffers(prisma, {
            mappingId: mapping.id,
            provider: "EBAY",
            externalItemIds: result.offers.map((offer) => offer.externalItemId),
          });
          for (const offer of result.offers) {
            const persisted = await persistFerrariDiscoveredOffer(prisma, {
              offer,
              partnerId: partner.affiliatePartnerId,
              providerId: partner.id,
              mappingId: mapping.id,
              modelId: mapping.model.id,
              makeId: ferrari.id,
              modelYearStart: mapping.model.productionStartYear,
              modelYearEnd: mapping.model.productionEndYear,
              categoryId: mapping.componentType.categoryId,
              categorySlug: mapping.componentType.category.slug,
              componentTypeId: mapping.componentType.id,
              componentName: mapping.componentType.name,
              performanceRelated: mapping.componentType.performanceRelated,
              now: new Date(),
              expiresAt: offer.itemEndDate && offer.itemEndDate > now
                ? offer.itemEndDate
                : new Date(Date.now() + DEFAULT_OFFER_TTL_MS),
              existingOffer: existingOffers.get(offer.externalItemId) ?? null,
            });
            if (persisted.writeDisposition === "UNCHANGED") {
              report.offersUnchanged += 1;
              report.offerFullWritesAvoided += 1;
            } else if (persisted.writeDisposition === "HEARTBEAT") {
              report.offerHeartbeats += 1;
              report.offerFullWritesAvoided += 1;
            } else if (persisted.writeDisposition === "UPDATED") {
              report.offersUpdated += 1;
            } else if (persisted.writeDisposition === "INSERTED") {
              report.offersInserted += 1;
            }
            if (persisted.familyId) families.add(persisted.familyId);
            offers.add(persisted.offerId);
            for (const identifier of persisted.familyId ? persisted.identity.identifiers : []) {
              identifiers.add(`${persisted.familyId}:${identifier.type}:${identifier.normalizedValue}`);
            }
          }
          await prisma.partDiscoveryQuery.update({
            where: { id: checkpoint.id },
            data: {
              status: "COMPLETED",
              attempts: { increment: 1 },
              listingsExamined: result.examinedCount,
              listingsAccepted: result.offers.length,
              listingsRejected: result.rejectedCount,
              lastError: null,
              lastAttemptAt: new Date(),
              lastSuccessAt: new Date(),
              refreshAfter: new Date(Date.now() + refreshMs),
            },
          });
          completedTemplates += 1;
          attemptedTemplate = true;
        } catch (error) {
          report.queriesExecuted += 1;
          const message = getErrorMessage(error);
          const rateLimited = error instanceof EbayBrowseError && error.status === 429;
          report.apiFailures += 1;
          mappingApiFailures += 1;
          if (rateLimited) {
            report.rateLimitEvents += 1;
            report.stoppedByRateLimit = true;
          }
          report.failedQueries.push({ query, error: message });
          await prisma.partDiscoveryQuery.update({
            where: { id: checkpoint.id },
            data: {
              status: rateLimited ? "RATE_LIMITED" : "FAILED",
              attempts: { increment: 1 },
              rateLimitEvents: rateLimited ? { increment: 1 } : undefined,
              lastError: message.slice(0, 1_000),
              lastAttemptAt: new Date(),
              lastRateLimitAt: rateLimited ? new Date() : undefined,
              refreshAfter: new Date(Date.now() + (rateLimited ? DAY_MS : 15 * 60 * 1000)),
            },
          });
          if (rateLimited) break mappingLoop;
          attemptedTemplate = true;
        }
        if (delayMs > 0 && report.queriesExecuted < maxQueries) await delay(delayMs);
        if (attemptedTemplate && (!options.exhaustiveRecovery || templateAccepted > 0)) break;
      }
      if (attemptedTemplate) {
        const allTemplatesComplete = completedTemplates === templates.length;
        const status = mappingApiFailures > 0 && completedTemplates === 0
          ? "API_ERROR"
          : mappingAccepted > 0
            ? (allTemplatesComplete ? "COMPLETED" : "PARTIAL")
            : mappingRejected > 0
              ? "LOW_CONFIDENCE_ONLY"
              : allTemplatesComplete
                ? "SEARCH_EXHAUSTED"
                : "ZERO_OFFERS";
        await prisma.modelPartComponent.update({
          where: { id: mapping.id },
          data: {
            lastOfferSearchAt: new Date(),
            lastOfferSearchStatus: status,
            lastOfferRejectedCount: mappingRejected,
          },
        });
      }
    }
    report.modelsProcessed = [...processedModels].sort();
    report.productFamiliesTouched = families.size;
    report.identifiersTouched = identifiers.size;
    report.activeAffiliateOffersTouched = offers.size;
    await prisma.partOffer.updateMany({
      where: { provider: "EBAY", active: true, expiresAt: { lte: new Date() } },
      data: { active: false, availability: "STALE", lastCheckedAt: new Date() },
    });
    await prisma.partSourceRun.update({
      where: { id: run.id },
      data: {
        status: report.stoppedByRateLimit ? "PAUSED_RATE_LIMIT" : report.apiFailures ? "PARTIAL" : "COMPLETED",
        stats: report,
        errorSummary: report.apiFailures ? `${report.apiFailures} eBay discovery queries failed.` : null,
        completedAt: new Date(),
      },
    });
    return report;
  } catch (error) {
    await prisma.partSourceRun.update({
      where: { id: run.id },
      data: { status: "FAILED", stats: report, errorSummary: getErrorMessage(error), completedAt: new Date() },
    });
    throw error;
  }
}

function readAliases(value: unknown) {
  return Array.isArray(value) ? value.filter((alias): alias is string => typeof alias === "string") : [];
}

function normalizeFitmentRisk(value: string): "LOW" | "MEDIUM" | "HIGH" {
  return value === "LOW" || value === "HIGH" ? value : "MEDIUM";
}

function interpolateQuery(template: string, modelName: string, componentName: string, year: number | null) {
  return template
    .replaceAll("{make}", "Ferrari")
    .replaceAll("{model}", modelName)
    .replaceAll("{component}", componentName)
    .replaceAll("{year}", year ? String(year) : "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildReference(modelSlug: string, categorySlug: string, componentSlug: string, year: number | null) {
  return ["ferrari", modelSlug, categorySlug, componentSlug, year].filter(Boolean).join("_").slice(0, 64);
}

function hashQuery(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function withRetry<T>(operation: () => Promise<T>, maxRetries: number) {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      const retryable = error instanceof EbayBrowseError && (error.status === 429 || error.status >= 500);
      if (!retryable || attempt >= maxRetries || (error instanceof EbayBrowseError && error.status === 429)) throw error;
      await delay(500 * 2 ** attempt);
      attempt += 1;
    }
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function clampInteger(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Ferrari parts discovery error";
}

function interleaveBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  const ordered: T[] = [];
  let index = 0;
  while (ordered.length < rows.length) {
    for (const group of groups.values()) {
      if (group[index]) ordered.push(group[index]);
    }
    index += 1;
  }
  return ordered;
}
