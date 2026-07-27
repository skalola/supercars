/**
 * lib/market-sources/connectors/bat.connector.ts
 *
 * Sprint 5.8 — Bring a Trailer (BaT) Auction Connector
 *
 * Implements ISourceConnector for Bring a Trailer auction results.
 *
 * API Limitation Documentation:
 *   - Bring a Trailer (BaT) does not provide a public, unauthenticated API
 *     endpoint for auction results.
 *   - The WordPress endpoint (`https://bringatrailer.com/wp-json/bat/v1/auctions/results`)
 *     returns a 401 Unauthorized status when queried anonymously.
 *   - Scraping the HTML pages directly is unstable and prone to breaking when
 *     BaT updates its theme or selectors.
 *   - Thus, this connector is designed for production-readiness by:
 *     1. Attempting to fetch from `process.env.BAT_API_URL` if configured.
 *     2. Falling back to reading real pre-collected and normalized auction
 *        sales from the static repository database (`data/bat-real-sales.json`).
 *     3. Processing all results through the same validation and title-parsing pipeline.
 */

import * as fs from "fs";
import * as path from "path";
import type {
  ISourceConnector,
  MarketListingInput,
  MarketSaleInput,
} from "../types";

// ─── BaT Raw Types ────────────────────────────────────────────────────────────

interface BaTRawResult {
  title: string;
  sold_at: string | number;
  sold_price: number;
  mileage?: number | null;
  color?: string | null;
  location?: string | null;
  url: string;
  [key: string]: unknown;
}

// ─── Title Parser ─────────────────────────────────────────────────────────────

interface ParsedTitle {
  year: number;
  make: string;
  modelRaw: string;
}

const KNOWN_MAKES: Record<string, string> = {
  ferrari: "Ferrari",
  lamborghini: "Lamborghini",
  porsche: "Porsche",
  mclaren: "McLaren",
  "aston martin": "Aston Martin",
  bentley: "Bentley",
  "rolls-royce": "Rolls-Royce",
  bugatti: "Bugatti",
  pagani: "Pagani",
  koenigsegg: "Koenigsegg",
};

function parseTitle(title: string): ParsedTitle | null {
  const clean = title.trim();
  const yearMatch = clean.match(/^(\d{4})\s+(.+)$/);
  if (!yearMatch) return null;

  const year = parseInt(yearMatch[1], 10);
  if (year < 1950 || year > new Date().getFullYear() + 1) return null;

  const remainder = yearMatch[2];

  const sortedMakes = Object.keys(KNOWN_MAKES).sort((a, b) => b.length - a.length);
  for (const makeKey of sortedMakes) {
    const makeFull = KNOWN_MAKES[makeKey];
    const makeRegex = new RegExp(`^${makeFull}\\s+(.+)$`, "i");
    const makeMatch = remainder.match(makeRegex);
    if (makeMatch) {
      return {
        year,
        make: makeFull,
        modelRaw: makeMatch[1].trim(),
      };
    }
  }

  return null;
}

// ─── Date Parser ─────────────────────────────────────────────────────────────

function parseSaleDate(raw: string | number): Date | null {
  if (typeof raw === "number") {
    const d = new Date(raw * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

// ─── BaT Connector ────────────────────────────────────────────────────────────

export class BaTConnector implements ISourceConnector {
  readonly sourceName = "Bring a Trailer";
  readonly sourceType = "AUCTION" as const;

  async fetchListings(): Promise<MarketListingInput[]> {
    return [];
  }

  /**
   * Retrieves completed sales from BaT results.
   * If a BAT_API_URL env variable is provided, fetches dynamically.
   * Otherwise, reads real historical BaT results from the local JSON data store.
   */
  async fetchSales(): Promise<MarketSaleInput[]> {
    let rawResults: BaTRawResult[] = [];

    const apiUrl = process.env.BAT_API_URL;
    if (apiUrl) {
      try {
        console.log(`[BaTConnector] Fetching real sales from API: ${apiUrl}`);
        const res = await fetch(apiUrl);
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        rawResults = await res.json() as BaTRawResult[];
      } catch (err) {
        console.error(`[BaTConnector] API fetch failed, falling back to local file:`, err);
        rawResults = this.loadLocalSales();
      }
    } else {
      rawResults = this.loadLocalSales();
    }

    const results: MarketSaleInput[] = [];
    for (const raw of rawResults) {
      const normalized = this.normalizeSale(raw);
      if (normalized) results.push(normalized);
    }

    console.log(
      `[BaTConnector] fetchSales — ${results.length} valid sales from ${rawResults.length} records`
    );
    return results;
  }

  /**
   * Loads pre-collected real Bring a Trailer auction result data from data directory.
   */
  private loadLocalSales(): BaTRawResult[] {
    try {
      const filePath = path.join(process.cwd(), "data", "bat-real-sales.json");
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(fileContent) as BaTRawResult[];
      }
      console.warn(`[BaTConnector] Local sales database file not found at ${filePath}`);
    } catch (err) {
      console.error(`[BaTConnector] Failed to read local sales database:`, err);
    }
    return [];
  }

  normalizeListing(_raw: unknown): MarketListingInput | null {
    return null;
  }

  normalizeSale(raw: BaTRawResult): MarketSaleInput | null {
    const parsed = parseTitle(raw.title);
    if (!parsed) {
      console.warn(`[BaTConnector] Could not parse title: "${raw.title}" — skipping`);
      return null;
    }

    // ── Rule 2: Valid sale price ─────────────────────────────────────────────
    if (!raw.sold_price || raw.sold_price <= 0) {
      console.warn(
        `[BaTConnector] Invalid or zero sold_price for "${raw.title}" — skipping (may be a no-sale/BaT Nein)`
      );
      return null;
    }

    // ── Rule 3: Valid sale date ──────────────────────────────────────────────
    const saleDate = parseSaleDate(raw.sold_at);
    if (!saleDate) {
      console.warn(`[BaTConnector] Unparseable sold_at for "${raw.title}" — skipping`);
      return null;
    }

    // ── Rule 4: URL ──────────────────────────────────────────────────────────
    if (!raw.url || raw.url.trim() === "") {
      console.warn(`[BaTConnector] Missing URL for "${raw.title}" — skipping`);
      return null;
    }

    return {
      make: parsed.make,
      model: parsed.modelRaw,   // model-matcher resolves variant text → DB model
      year: parsed.year,
      salePrice: raw.sold_price,
      mileage: raw.mileage ?? null,
      color: raw.color ?? null,
      location: raw.location ?? null,
      source: this.sourceName,
      sourceType: this.sourceType,
      url: raw.url,
      saleDate,
    };
  }
}
