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
const sourceCache = new Map<string, string>(); // name → id

async function getSourceId(
  sourceName: string,
  sourceType: string
): Promise<string> {
  if (sourceCache.has(sourceName)) return sourceCache.get(sourceName)!;

  const source = await prisma.marketSource.upsert({
    where: { name: sourceName },
    update: {},
    create: {
      name: sourceName,
      type: sourceType,
      active: true,
    },
  });

  sourceCache.set(sourceName, source.id);
  return source.id;
}

// ─── Ingest Listings ─────────────────────────────────────────────────────────

/**
 * Persists a batch of normalized listings.
 * Deduplication key: (modelId, sourceId, url). If a URL already exists
 * for that source/model, the price, mileage, and lastSeen are updated.
 * If no URL, falls back to (modelId, sourceId, year, price) to avoid
 * exact duplicates.
 */
export async function ingestListings(
  inputs: MarketListingInput[]
): Promise<{ upserted: number; unresolved: string[] }> {
  if (inputs.length === 0) return { upserted: 0, unresolved: [] };

  // Batch-resolve models
  const pairs = inputs.map((i) => ({ make: i.make, model: i.model }));
  const resolved = await batchResolveModels(pairs);

  let upserted = 0;
  const unresolved: string[] = [];

  for (const input of inputs) {
    // Before saving: Require price, model, year, source, and url
    if (
      input.price === null ||
      input.price === undefined ||
      input.price <= 0 ||
      !input.model ||
      input.model.trim() === "" ||
      !input.year ||
      !input.source ||
      input.source.trim() === "" ||
      !input.url ||
      input.url.trim() === ""
    ) {
      unresolved.push(`${input.make} ${input.model || "Unknown Model"} ${input.year || "Unknown Year"}: Missing required field (price, model, year, source, url)`);
      continue;
    }

    const key = `${input.make}::${input.model}`;
    const match = resolved.get(key);

    if (!match || !match.matched) {
      unresolved.push(`${input.make} ${input.model} ${input.year}: ${match?.reason ?? "unknown"}`);
      continue;
    }

    const sourceId = await getSourceId(input.source, input.sourceType);

    try {
      if (input.url) {
        const existingListing = await prisma.listing.findFirst({
          where: { url: input.url, sourceId },
          select: { id: true, price: true, askingPrice: true },
        });

        // URL-keyed upsert: stable identity across refreshes
        const savedListing = await prisma.listing.upsert({
          where: {
            // We use a raw findFirst + create/update because Listing has no
            // unique constraint on url — it's nullable. A composite unique
            // would require a schema migration; we avoid that per sprint rules.
            // Instead: find by url + sourceId, update or create.
            id: existingListing?.id ?? "__NOT_FOUND__",
          },
          update: {
            price: input.price,
            askingPrice: input.price,
            mileage: input.mileage,
            color: input.color,
            location: input.location,
            dealerName: input.dealerName,
            status: "ACTIVE",
            lastSeen: new Date(),
          },
          create: {
            modelId: match.modelId,
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
      } else {
        // No URL — create only if no identical record exists this run
        const existing = await prisma.listing.findFirst({
          where: {
            modelId: match.modelId,
            sourceId,
            year: input.year,
            price: input.price,
            status: "ACTIVE",
          },
        });
        if (!existing) {
          const savedListing = await prisma.listing.create({
            data: {
              modelId: match.modelId,
              sourceId,
              year: input.year,
              price: input.price,
              askingPrice: input.price,
              mileage: input.mileage,
              color: input.color,
              location: input.location,
              dealerName: input.dealerName,
              url: null,
              status: "ACTIVE",
              firstSeen: input.listingDate,
              lastSeen: new Date(),
            },
          });
          await safelySendSavedCarAlert(() => notifySavedCarNewListing(savedListing.id));
        }
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
  inputs: MarketSaleInput[]
): Promise<{ created: number; unresolved: string[] }> {
  if (inputs.length === 0) return { created: 0, unresolved: [] };

  const pairs = inputs.map((i) => ({ make: i.make, model: i.model }));
  const resolved = await batchResolveModels(pairs);

  let created = 0;
  const unresolved: string[] = [];

  for (const input of inputs) {
    const key = `${input.make}::${input.model}`;
    const match = resolved.get(key);

    if (!match || !match.matched) {
      unresolved.push(`${input.make} ${input.model} ${input.year}: ${match?.reason ?? "unknown"}`);
      continue;
    }

    const sourceId = await getSourceId(input.source, input.sourceType);

    // Check for duplicate by url (if present) or by date+price
    const exists = input.url
      ? await prisma.marketSale.findFirst({ where: { url: input.url, sourceId } })
      : await prisma.marketSale.findFirst({
          where: {
            modelId: match.modelId,
            sourceId,
            saleDate: input.saleDate,
            salePrice: input.salePrice,
          },
        });

    if (exists) continue;

    try {
      await prisma.marketSale.create({
        data: {
          modelId: match.modelId,
          sourceId,
          saleDate: input.saleDate,
          salePrice: input.salePrice,
          year: input.year,
          mileage: input.mileage,
          color: input.color,
          location: input.location,
          url: input.url,
        },
      });
      created++;
    } catch (err) {
      console.error(`[IngestionEngine] Failed to create sale:`, err);
      unresolved.push(`${input.make} ${input.model} ${input.year}: DB error`);
    }
  }

  return { created, unresolved };
}

// ─── Snapshot Generation ──────────────────────────────────────────────────────

/**
 * Computes and stores a MarketSnapshot for today for a given modelId.
 * Called after ingestion to keep the snapshot table current.
 * Idempotent: if a snapshot already exists for today's date, it is updated.
 */
export async function generateSnapshot(modelId: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // This protects market intelligence from invalid source pricing.
  const [listings, recentSales] = await Promise.all([
    prisma.listing.findMany({
      where: {
        modelId,
        status: "ACTIVE",
        OR: [
          { askingPrice: { gte: 10000 } },
          { price: { gte: 10000 } }
        ],
      },
      select: { price: true, askingPrice: true, mileage: true },
    }),
    prisma.marketSale.findMany({
      where: {
        modelId,
        saleDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        salePrice: { gte: 10000 },
      },
      select: { salePrice: true, mileage: true },
    }),
  ]);

  const prices = listings
    .map((l) => l.askingPrice ?? l.price)
    .filter((p): p is number => p !== null && p >= 10000 && p <= 20000000);
  const mileages = [
    ...listings.map((l) => l.mileage),
    ...recentSales.map((s) => s.mileage),
  ].filter((m): m is number => m !== null);

  function mean(arr: number[]) {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  }
  function median(arr: number[]) {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  }

  const snapshotData = {
    activeListingCount: listings.length,
    averagePrice: mean(prices),
    medianPrice: median(prices),
    lowestPrice: prices.length > 0 ? Math.min(...prices) : null,
    highestPrice: prices.length > 0 ? Math.max(...prices) : null,
    salesCount: recentSales.length,
    averageMileage: mean(mileages),
  };

  const existing = await prisma.marketSnapshot.findFirst({
    where: { modelId, date: { gte: today } },
  });

  if (existing) {
    await prisma.marketSnapshot.update({
      where: { id: existing.id },
      data: snapshotData,
    });
  } else {
    await prisma.marketSnapshot.create({
      data: { modelId, date: today, ...snapshotData },
    });
  }
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

  const [listingResult, saleResult] = await Promise.all([
    ingestListings(listings),
    ingestSales(sales),
  ]);

  // Generate snapshots for all unique modelIds touched in this run
  const affectedModels = new Set<string>();
  // We re-resolve to get modelIds without coupling to internals
  const allPairs = [
    ...listings.map((l) => ({ make: l.make, model: l.model })),
    ...sales.map((s) => ({ make: s.make, model: s.model })),
  ];
  const resolved = await batchResolveModels(allPairs);
  for (const result of resolved.values()) {
    if (result.matched) affectedModels.add(result.modelId);
  }

  await Promise.all(Array.from(affectedModels).map(generateSnapshot));

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
