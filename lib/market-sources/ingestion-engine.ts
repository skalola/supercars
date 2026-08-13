/**
 * lib/market-sources/ingestion-engine.ts
 *
 * Sprint 5.5 — Ingestion Engine
 *
 * Accepts normalized MarketListingInput / MarketSaleInput arrays,
 * resolves them to Model records, and persists them to Prisma.
 *
 * This is the ONLY layer that writes to Listing / MarketSale.
 * Connectors produce data; the engine persists it.
 *
 * Future pipeline:
 *   Connector → [MarketListingInput[]] → IngestionEngine → Listing table
 *   Connector → [MarketSaleInput[]]    → IngestionEngine → MarketSale table
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifySavedCarNewListing, notifySavedCarPriceDrop } from "@/lib/garage/saved-car-alerts";
import { batchResolveModels } from "./model-matcher";
import type {
  MarketListingInput,
  MarketSaleInput,
  IngestionResult,
  ISourceConnector,
} from "./types";

// ─── Source Record Cache ──────────────────────────────────────────────────────

/**
 * Looks up (or lazily creates) a MarketSource DB record by name.
 * Uses an in-process cache so we don't query per-record.
 */
const sourceCache = new Map<string, Promise<string>>();

async function getSourceId(
  sourceName: string,
  sourceType: string
): Promise<string> {
  const cacheKey = sourceName.trim().toLowerCase();
  const cached = sourceCache.get(cacheKey);
  if (cached) return cached;

  const pending = prisma.marketSource
    .upsert({
      where: { name: sourceName },
      update: {},
      create: {
        name: sourceName,
        type: sourceType,
        active: true,
      },
      select: { id: true },
    })
    .then((source) => source.id)
    .catch((error) => {
      sourceCache.delete(cacheKey);
      throw error;
    });

  sourceCache.set(cacheKey, pending);
  return pending;
}

type ModelResolutionMap = Awaited<ReturnType<typeof batchResolveModels>>;

async function resolveSourceIds(
  inputs: Array<{ source: string; sourceType: string }>,
) {
  const uniqueSources = new Map<string, { source: string; sourceType: string }>();
  for (const input of inputs) {
    uniqueSources.set(input.source.trim().toLowerCase(), input);
  }

  const entries = await Promise.all(
    Array.from(uniqueSources.entries()).map(async ([key, input]) => [
      key,
      await getSourceId(input.source, input.sourceType),
    ] as const),
  );
  return new Map(entries);
}

// ─── Ingest Listings ─────────────────────────────────────────────────────────

/**
 * Persists a batch of normalized listings.
 * Deduplication key: (sourceId, url). If a URL already exists for that
 * source, the price, mileage, and lastSeen are updated.
 */
export async function ingestListings(
  inputs: MarketListingInput[],
  suppliedResolution?: ModelResolutionMap,
): Promise<{ upserted: number; unresolved: string[] }> {
  if (inputs.length === 0) return { upserted: 0, unresolved: [] };

  let upserted = 0;
  const unresolved: string[] = [];
  const validInputs = inputs.filter((input) => {
    const valid = Boolean(
      input.price !== null &&
      input.price !== undefined &&
      input.price > 0 &&
      input.model?.trim() &&
      input.year &&
      input.source?.trim() &&
      input.url?.trim(),
    );
    if (!valid) {
      unresolved.push(
        `${input.make} ${input.model || "Unknown Model"} ${input.year || "Unknown Year"}: Missing required field (price, model, year, source, url)`,
      );
    }
    return valid;
  });

  if (validInputs.length === 0) return { upserted, unresolved };

  const resolved = suppliedResolution ?? await batchResolveModels(
    validInputs.map((input) => ({ make: input.make, model: input.model })),
  );
  const matchedInputs: Array<{ input: MarketListingInput; modelId: string }> = [];

  for (const input of validInputs) {
    const key = `${input.make}::${input.model}`;
    const match = resolved.get(key);
    if (!match || !match.matched) {
      unresolved.push(`${input.make} ${input.model} ${input.year}: ${match?.reason ?? "unknown"}`);
      continue;
    }
    matchedInputs.push({ input, modelId: match.modelId });
  }

  const sourceIds = await resolveSourceIds(matchedInputs.map(({ input }) => input));
  const prepared = new Map<string, {
    input: MarketListingInput;
    modelId: string;
    sourceId: string;
  }>();

  for (const { input, modelId } of matchedInputs) {
    const sourceId = sourceIds.get(input.source.trim().toLowerCase())!;
    prepared.set(`${sourceId}::${input.url}`, { input, modelId, sourceId });
  }

  const records = Array.from(prepared.values());
  if (records.length === 0) return { upserted, unresolved };

  const existingRows = await prisma.listing.findMany({
    where: {
      sourceId: { in: Array.from(new Set(records.map((record) => record.sourceId))) },
      url: { in: Array.from(new Set(records.map((record) => record.input.url!))) },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, sourceId: true, url: true, price: true, askingPrice: true },
  });
  const existingBySourceUrl = new Map<string, (typeof existingRows)[number]>();
  for (const row of existingRows) {
    if (!row.sourceId || !row.url) continue;
    const key = `${row.sourceId}::${row.url}`;
    if (!existingBySourceUrl.has(key)) existingBySourceUrl.set(key, row);
  }

  for (const { input, modelId, sourceId } of records) {
    const existingListing = existingBySourceUrl.get(`${sourceId}::${input.url}`);

    try {
      const savedListing = existingListing
        ? await prisma.listing.update({
          where: { id: existingListing.id },
          data: {
            price: input.price,
            askingPrice: input.price,
            mileage: input.mileage,
            color: input.color,
            location: input.location,
            dealerName: input.dealerName,
            status: "ACTIVE",
            lastSeen: new Date(),
          },
        })
        : await prisma.listing.create({
          data: {
            modelId,
            sourceId,
            year: input.year,
            price: input.price,
            askingPrice: input.price,
            mileage: input.mileage,
            color: input.color,
            location: input.location,
            dealerName: input.dealerName,
            url: input.url,
            status: "ACTIVE",
            firstSeen: input.listingDate,
            lastSeen: new Date(),
          },
        });

      if (existingListing) {
        const previousPrice = existingListing.askingPrice ?? existingListing.price ?? null;
        if (previousPrice && input.price && input.price < previousPrice) {
          await safelySendSavedCarAlert(() =>
            notifySavedCarPriceDrop(savedListing.id, previousPrice, input.price!)
          );
        }
      } else {
        await safelySendSavedCarAlert(() => notifySavedCarNewListing(savedListing.id));
      }

      upserted++;
    } catch (err) {
      console.error(`[IngestionEngine] Failed to upsert listing:`, err);
      unresolved.push(`${input.make} ${input.model} ${input.year}: DB error`);
    }
  }

  return { upserted, unresolved };
}

async function safelySendSavedCarAlert(send: () => Promise<{ sent: number; skipped?: string }>) {
  try {
    const result = await send();
    if (result.sent > 0) {
      console.log(`[Saved Car Alert] Sent ${result.sent} alert${result.sent === 1 ? "" : "s"}.`);
    }
  } catch (error) {
    console.warn(
      `[Saved Car Alert] Skipped alert dispatch: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ─── Ingest Sales ─────────────────────────────────────────────────────────────

/**
 * Persists a batch of normalized sale records.
 * Deduplication key: (modelId, sourceId, saleDate, salePrice, url).
 * Sales are immutable — no updates, only creates if not already present.
 */
export async function ingestSales(
  inputs: MarketSaleInput[],
  suppliedResolution?: ModelResolutionMap,
): Promise<{ created: number; unresolved: string[] }> {
  if (inputs.length === 0) return { created: 0, unresolved: [] };

  const unresolved: string[] = [];
  const resolved = suppliedResolution ?? await batchResolveModels(
    inputs.map((input) => ({ make: input.make, model: input.model })),
  );
  const matchedInputs: Array<{ input: MarketSaleInput; modelId: string }> = [];

  for (const input of inputs) {
    const key = `${input.make}::${input.model}`;
    const match = resolved.get(key);

    if (!match || !match.matched) {
      unresolved.push(`${input.make} ${input.model} ${input.year}: ${match?.reason ?? "unknown"}`);
      continue;
    }
    matchedInputs.push({ input, modelId: match.modelId });
  }

  const sourceIds = await resolveSourceIds(matchedInputs.map(({ input }) => input));
  const prepared = matchedInputs.map(({ input, modelId }) => ({
    input,
    modelId,
    sourceId: sourceIds.get(input.source.trim().toLowerCase())!,
  }));

  if (prepared.length === 0) return { created: 0, unresolved };

  const dates = prepared.map(({ input }) => input.saleDate.getTime());
  const existingRows = await prisma.marketSale.findMany({
    where: {
      sourceId: { in: Array.from(new Set(prepared.map(({ sourceId }) => sourceId))) },
      OR: [
        { url: { in: Array.from(new Set(prepared.flatMap(({ input }) => input.url ? [input.url] : []))) } },
        {
          modelId: { in: Array.from(new Set(prepared.map(({ modelId }) => modelId))) },
          saleDate: { gte: new Date(Math.min(...dates)), lte: new Date(Math.max(...dates)) },
        },
      ],
    },
    select: { modelId: true, sourceId: true, saleDate: true, salePrice: true, url: true },
  });
  const urlKeys = new Set(
    existingRows.flatMap((row) => row.url ? [`${row.sourceId}::${row.url}`] : []),
  );
  const signatureKeys = new Set(
    existingRows.map((row) =>
      `${row.modelId}::${row.sourceId}::${row.saleDate.toISOString()}::${row.salePrice}`
    ),
  );
  const pendingKeys = new Set<string>();
  const rowsToCreate = prepared.flatMap(({ input, modelId, sourceId }) => {
    const identity = input.url
      ? `url::${sourceId}::${input.url}`
      : `signature::${modelId}::${sourceId}::${input.saleDate.toISOString()}::${input.salePrice}`;
    const exists = input.url
      ? urlKeys.has(`${sourceId}::${input.url}`)
      : signatureKeys.has(`${modelId}::${sourceId}::${input.saleDate.toISOString()}::${input.salePrice}`);
    if (exists || pendingKeys.has(identity)) return [];
    pendingKeys.add(identity);
    return [{
      modelId,
      sourceId,
      saleDate: input.saleDate,
      salePrice: input.salePrice,
      year: input.year,
      mileage: input.mileage,
      color: input.color,
      location: input.location,
      url: input.url,
    }];
  });

  if (rowsToCreate.length === 0) return { created: 0, unresolved };

  try {
    const result = await prisma.marketSale.createMany({ data: rowsToCreate });
    return { created: result.count, unresolved };
  } catch (err) {
    console.error(`[IngestionEngine] Failed to create sales batch:`, err);
    unresolved.push(`${rowsToCreate.length} resolved sales: DB error`);
    return { created: 0, unresolved };
  }
}

// ─── Snapshot Generation ──────────────────────────────────────────────────────

/**
 * Computes and stores a MarketSnapshot for today for a given modelId.
 * Called after ingestion to keep the snapshot table current.
 * Idempotent: if a snapshot already exists for today's date, it is updated.
 */
export async function generateSnapshot(modelId: string): Promise<void> {
  await generateSnapshots([modelId]);
}

type SnapshotAggregate = {
  modelId: string;
  activeListingCount: number;
  averagePrice: number | null;
  medianPrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  salesCount: number;
  averageMileage: number | null;
};

async function generateSnapshots(modelIds: string[]): Promise<void> {
  const uniqueModelIds = Array.from(new Set(modelIds));
  if (uniqueModelIds.length === 0) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requestedModels = Prisma.join(
    uniqueModelIds.map((modelId) => Prisma.sql`(${modelId})`),
  );
  const aggregates = await prisma.$queryRaw<SnapshotAggregate[]>(Prisma.sql`
    WITH requested_models("modelId") AS (VALUES ${requestedModels}),
    listing_stats AS (
      SELECT
        requested_models."modelId",
        COUNT(listing.id)::int AS "activeListingCount",
        AVG(CASE WHEN COALESCE(listing."askingPrice", listing.price) BETWEEN 10000 AND 20000000
          THEN COALESCE(listing."askingPrice", listing.price) END)::float8 AS "averagePrice",
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY COALESCE(listing."askingPrice", listing.price)
        ) FILTER (WHERE COALESCE(listing."askingPrice", listing.price) BETWEEN 10000 AND 20000000)::float8 AS "medianPrice",
        MIN(COALESCE(listing."askingPrice", listing.price))
          FILTER (WHERE COALESCE(listing."askingPrice", listing.price) BETWEEN 10000 AND 20000000)::float8 AS "lowestPrice",
        MAX(COALESCE(listing."askingPrice", listing.price))
          FILTER (WHERE COALESCE(listing."askingPrice", listing.price) BETWEEN 10000 AND 20000000)::float8 AS "highestPrice",
        COALESCE(SUM(listing.mileage), 0)::float8 AS listing_mileage_sum,
        COUNT(listing.mileage)::int AS listing_mileage_count
      FROM requested_models
      LEFT JOIN "Listing" listing ON listing."modelId" = requested_models."modelId"
        AND listing.status = 'ACTIVE'
        AND (listing."askingPrice" >= 10000 OR listing.price >= 10000)
      GROUP BY requested_models."modelId"
    ),
    sale_stats AS (
      SELECT
        requested_models."modelId",
        COUNT(sale.id)::int AS "salesCount",
        COALESCE(SUM(sale.mileage), 0)::float8 AS sale_mileage_sum,
        COUNT(sale.mileage)::int AS sale_mileage_count
      FROM requested_models
      LEFT JOIN "MarketSale" sale ON sale."modelId" = requested_models."modelId"
        AND sale."saleDate" >= NOW() - INTERVAL '90 days'
        AND sale."salePrice" >= 10000
      GROUP BY requested_models."modelId"
    )
    SELECT
      listing_stats."modelId",
      listing_stats."activeListingCount",
      listing_stats."averagePrice",
      listing_stats."medianPrice",
      listing_stats."lowestPrice",
      listing_stats."highestPrice",
      sale_stats."salesCount",
      CASE WHEN listing_stats.listing_mileage_count + sale_stats.sale_mileage_count > 0
        THEN (listing_stats.listing_mileage_sum + sale_stats.sale_mileage_sum) /
          (listing_stats.listing_mileage_count + sale_stats.sale_mileage_count)
        ELSE NULL
      END::float8 AS "averageMileage"
    FROM listing_stats
    JOIN sale_stats USING ("modelId")
  `);

  await prisma.$transaction(
    aggregates.map((row) => prisma.marketSnapshot.upsert({
      where: { modelId_date: { modelId: row.modelId, date: today } },
      update: {
        activeListingCount: row.activeListingCount,
        averagePrice: row.averagePrice,
        medianPrice: row.medianPrice,
        lowestPrice: row.lowestPrice,
        highestPrice: row.highestPrice,
        salesCount: row.salesCount,
        averageMileage: row.averageMileage,
      },
      create: { ...row, date: today },
    })),
  );
}

// ─── Run Connector ────────────────────────────────────────────────────────────

/**
 * Orchestrates a full ingestion run for a single connector:
 *   1. Fetch listings
 *   2. Fetch sales
 *   3. Persist via ingestListings / ingestSales
 *   4. Generate snapshot for all affected models
 *
 * @param connector  Any class implementing ISourceConnector
 * @returns          IngestionResult summary
 */
export async function runConnector(
  connector: ISourceConnector
): Promise<IngestionResult> {
  const start = Date.now();
  console.log(`[IngestionEngine] Starting run for: ${connector.sourceName}`);

  const [listings, sales] = await Promise.all([
    connector.fetchListings(),
    connector.fetchSales(),
  ]);

  const allPairs = [
    ...listings.map((listing) => ({ make: listing.make, model: listing.model })),
    ...sales.map((sale) => ({ make: sale.make, model: sale.model })),
  ];
  const resolved = await batchResolveModels(allPairs);

  const [listingResult, saleResult] = await Promise.all([
    ingestListings(listings, resolved),
    ingestSales(sales, resolved),
  ]);

  // Generate snapshots for all unique modelIds touched in this run
  const affectedModels = new Set<string>();
  for (const result of resolved.values()) {
    if (result.matched) affectedModels.add(result.modelId);
  }

  await generateSnapshots(Array.from(affectedModels));

  const elapsed = Date.now() - start;
  console.log(
    `[IngestionEngine] Completed ${connector.sourceName} in ${elapsed}ms — ` +
      `${listingResult.upserted} listings, ${saleResult.created} sales`
  );

  return {
    sourceName: connector.sourceName,
    listingsUpserted: listingResult.upserted,
    salesCreated: saleResult.created,
    unresolved: [...listingResult.unresolved, ...saleResult.unresolved],
    processedAt: new Date().toISOString(),
  };
}
