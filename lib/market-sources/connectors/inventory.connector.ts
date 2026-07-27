/**
 * lib/market-sources/connectors/inventory.connector.ts
 *
 * Sprint 5.7 — Dealer / Marketplace Inventory Connector
 *
 * Implements ISourceConnector for active vehicle inventory from
 * exotic car marketplaces and dealer networks, represented here
 * by a DuPont Registry / exotic dealer inventory fixture.
 *
 * This connector feeds the Listing table (active supply side of
 * Market Intelligence), complementing the BaT connector's
 * historical sales data.
 *
 * Data flow:
 *   Fixture → normalizeListing() → MarketListingInput
 *   → ingestListings() → Listing table
 *   → generateSnapshot() → MarketSnapshot
 *   → getMarketSummary() → Model Pages + Passport
 *
 * Production activation:
 *   Replace INVENTORY_FIXTURE with a real HTTP call to a dealer
 *   feed or marketplace API. normalizeListing() is production-ready
 *   and maps the same field names that major exotic marketplaces use.
 *
 *   Example (DuPont Registry partner API):
 *     const res = await fetch(process.env.DUPONT_API_URL, {
 *       headers: { Authorization: `Bearer ${process.env.DUPONT_API_KEY}` }
 *     });
 *     const { listings } = await res.json();
 *     return listings.map(l => this.normalizeListing(l)).filter(Boolean);
 */

import type {
  ISourceConnector,
  MarketListingInput,
  MarketSaleInput,
} from "../types";

// ─── Raw Inventory Item Type ──────────────────────────────────────────────────

/**
 * Shape of a single listing as returned by a typical exotic marketplace API.
 * Field names follow DuPont Registry / Cars & Bids / ClassicCars.com conventions.
 * Only consumed fields are typed; extras are ignored.
 */
interface RawInventoryItem {
  /** e.g. "Ferrari" */
  make: string;
  /** e.g. "458 Italia" or "488 GTB" — may include variant/trim suffix */
  model: string;
  /** Model year, integer */
  year: number;
  /** Asking price in USD */
  asking_price: number | null;
  /** Odometer in miles */
  mileage: number | null;
  /** Exterior color, seller-reported */
  color: string | null;
  /** City + state string, e.g. "Beverly Hills, CA" */
  location: string | null;
  /** Listing dealer or private seller name */
  dealer_name: string | null;
  /** Canonical URL to the listing page */
  url: string;
  /** ISO date string when this listing was first posted */
  listed_date: string;
  [key: string]: unknown;
}

// ─── Fixture Dataset ──────────────────────────────────────────────────────────

/**
 * Representative exotic inventory fixture.
 *
 * Coverage:
 *   Ferrari: 458 Italia, 488 GTB, F430, F8 Tributo, SF90 Stradale, 360 Modena
 *   Lamborghini: Huracan, Aventador, Gallardo
 *
 * Prices reflect realistic 2025 exotic dealer asking prices.
 * Dealers and locations are representative but fictional.
 *
 * Edge cases included:
 *   - Missing price (must be skipped)
 *   - Missing URL (must be skipped)
 *   - Unknown make (must log + skip)
 *   - Variant in model name (model-matcher handles: "Huracan EVO RWD" → Huracan)
 */
const INVENTORY_FIXTURE: RawInventoryItem[] = [
  // ── Ferrari 458 Italia ────────────────────────────────────────────────────
  {
    make: "Ferrari",
    model: "458 Italia",
    year: 2014,
    asking_price: 229500,
    mileage: 8200,
    color: "Rosso Corsa",
    location: "Beverly Hills, CA",
    dealer_name: "Beverly Hills Ferrari",
    url: "https://www.dupontregistry.com/autos/listing/ferrari-458-italia-inv-001",
    listed_date: "2025-06-01T00:00:00Z",
  },
  {
    make: "Ferrari",
    model: "458 Italia",
    year: 2013,
    asking_price: 209000,
    mileage: 13400,
    color: "Bianco Avus",
    location: "Miami, FL",
    dealer_name: "Prestige Imports Miami",
    url: "https://www.dupontregistry.com/autos/listing/ferrari-458-italia-inv-002",
    listed_date: "2025-05-14T00:00:00Z",
  },
  {
    make: "Ferrari",
    model: "458 Italia",
    year: 2015,
    asking_price: 249000,
    mileage: 4800,
    color: "Giallo Triplo Strato",
    location: "Scottsdale, AZ",
    dealer_name: "Barrett-Jackson Auto Gallery",
    url: "https://www.dupontregistry.com/autos/listing/ferrari-458-italia-inv-003",
    listed_date: "2025-06-20T00:00:00Z",
  },

  // ── Ferrari 488 GTB ───────────────────────────────────────────────────────
  {
    make: "Ferrari",
    model: "488 GTB",
    year: 2017,
    asking_price: 255000,
    mileage: 7100,
    color: "Rosso Corsa",
    location: "Chicago, IL",
    dealer_name: "Midwest Exotic Cars",
    url: "https://www.dupontregistry.com/autos/listing/ferrari-488-gtb-inv-004",
    listed_date: "2025-05-28T00:00:00Z",
  },
  {
    make: "Ferrari",
    model: "488 GTB",
    year: 2018,
    asking_price: 262500,
    mileage: 5400,
    color: "Blu Pozzi",
    location: "Dallas, TX",
    dealer_name: "Park Place Dealerships",
    url: "https://www.dupontregistry.com/autos/listing/ferrari-488-gtb-inv-005",
    listed_date: "2025-06-10T00:00:00Z",
  },

  // ── Ferrari F430 ──────────────────────────────────────────────────────────
  {
    make: "Ferrari",
    model: "F430",
    year: 2007,
    asking_price: 109000,
    mileage: 19800,
    color: "Rosso Corsa",
    location: "Las Vegas, NV",
    dealer_name: "Lotus Cars Las Vegas",
    url: "https://www.dupontregistry.com/autos/listing/ferrari-f430-inv-006",
    listed_date: "2025-04-30T00:00:00Z",
  },
  {
    make: "Ferrari",
    model: "F430",
    year: 2008,
    asking_price: 115000,
    mileage: 14300,
    color: "Grigio Silverstone",
    location: "Atlanta, GA",
    dealer_name: "Auto Collections",
    url: "https://www.dupontregistry.com/autos/listing/ferrari-f430-inv-007",
    listed_date: "2025-05-05T00:00:00Z",
  },

  // ── Ferrari F8 Tributo ────────────────────────────────────────────────────
  {
    make: "Ferrari",
    model: "F8 Tributo",
    year: 2021,
    asking_price: 319000,
    mileage: 3200,
    color: "Rosso Corsa",
    location: "New York, NY",
    dealer_name: "Manhattan Motorcars",
    url: "https://www.dupontregistry.com/autos/listing/ferrari-f8-tributo-inv-008",
    listed_date: "2025-06-18T00:00:00Z",
  },
  {
    make: "Ferrari",
    model: "F8 Tributo",
    year: 2020,
    asking_price: 298000,
    mileage: 6100,
    color: "Giallo Modena",
    location: "Seattle, WA",
    dealer_name: "Seattle Exotic Cars",
    url: "https://www.dupontregistry.com/autos/listing/ferrari-f8-tributo-inv-009",
    listed_date: "2025-05-22T00:00:00Z",
  },

  // ── Ferrari SF90 Stradale ─────────────────────────────────────────────────
  {
    make: "Ferrari",
    model: "SF90 Stradale",
    year: 2022,
    asking_price: 589000,
    mileage: 1800,
    color: "Nero Daytona",
    location: "Greenwich, CT",
    dealer_name: "Autosport of Greenwich",
    url: "https://www.dupontregistry.com/autos/listing/ferrari-sf90-inv-010",
    listed_date: "2025-06-25T00:00:00Z",
  },

  // ── Ferrari 360 Modena ────────────────────────────────────────────────────
  {
    make: "Ferrari",
    model: "360 Modena",
    year: 2003,
    asking_price: 74500,
    mileage: 28400,
    color: "Rosso Corsa",
    location: "Denver, CO",
    dealer_name: "Rocky Mountain Exotics",
    url: "https://www.dupontregistry.com/autos/listing/ferrari-360-modena-inv-011",
    listed_date: "2025-04-18T00:00:00Z",
  },

  // ── Lamborghini Huracan ───────────────────────────────────────────────────
  {
    make: "Lamborghini",
    model: "Huracan LP610-4",
    year: 2015,
    asking_price: 189000,
    mileage: 11200,
    color: "Giallo Orion",
    location: "Houston, TX",
    dealer_name: "Lamborghini Houston",
    url: "https://www.dupontregistry.com/autos/listing/lamborghini-huracan-inv-012",
    listed_date: "2025-05-10T00:00:00Z",
  },
  {
    make: "Lamborghini",
    model: "Huracan Performante",
    year: 2018,
    asking_price: 234000,
    mileage: 4900,
    color: "Arancio Borealis",
    location: "Miami, FL",
    dealer_name: "Lamborghini Palm Beach",
    url: "https://www.dupontregistry.com/autos/listing/lamborghini-huracan-perf-inv-013",
    listed_date: "2025-06-08T00:00:00Z",
  },
  {
    make: "Lamborghini",
    model: "Huracan EVO RWD",
    year: 2020,
    asking_price: 248000,
    mileage: 2600,
    color: "Verde Mantis",
    location: "Los Angeles, CA",
    dealer_name: "Lamborghini Los Angeles",
    url: "https://www.dupontregistry.com/autos/listing/lamborghini-huracan-evo-inv-014",
    listed_date: "2025-06-15T00:00:00Z",
  },
  {
    make: "Lamborghini",
    model: "Huracan Spyder",
    year: 2016,
    asking_price: 195000,
    mileage: 9800,
    color: "Bianco Monocerus",
    location: "Phoenix, AZ",
    dealer_name: "Scottsdale Ferrari",
    url: "https://www.dupontregistry.com/autos/listing/lamborghini-huracan-spyder-inv-015",
    listed_date: "2025-05-18T00:00:00Z",
  },

  // ── Lamborghini Aventador ─────────────────────────────────────────────────
  {
    make: "Lamborghini",
    model: "Aventador LP700-4",
    year: 2014,
    asking_price: 319000,
    mileage: 8500,
    color: "Bianco Isis",
    location: "San Francisco, CA",
    dealer_name: "Marin Exotic Cars",
    url: "https://www.dupontregistry.com/autos/listing/lamborghini-aventador-inv-016",
    listed_date: "2025-05-30T00:00:00Z",
  },
  {
    make: "Lamborghini",
    model: "Aventador SVJ",
    year: 2020,
    asking_price: 489000,
    mileage: 2100,
    color: "Verde Gea",
    location: "New York, NY",
    dealer_name: "Post Oak Motor Cars",
    url: "https://www.dupontregistry.com/autos/listing/lamborghini-aventador-svj-inv-017",
    listed_date: "2025-06-22T00:00:00Z",
  },

  // ── Lamborghini Gallardo ──────────────────────────────────────────────────
  {
    make: "Lamborghini",
    model: "Gallardo LP560-4",
    year: 2012,
    asking_price: 115000,
    mileage: 16700,
    color: "Arancio Borealis",
    location: "Dallas, TX",
    dealer_name: "Boardwalk Ferrari",
    url: "https://www.dupontregistry.com/autos/listing/lamborghini-gallardo-inv-018",
    listed_date: "2025-04-25T00:00:00Z",
  },
  {
    make: "Lamborghini",
    model: "Gallardo Spyder",
    year: 2009,
    asking_price: 98000,
    mileage: 24200,
    color: "Grigio Titans",
    location: "Portland, OR",
    dealer_name: "Portland Exotic Cars",
    url: "https://www.dupontregistry.com/autos/listing/lamborghini-gallardo-spyder-inv-019",
    listed_date: "2025-05-02T00:00:00Z",
  },

  // ── Edge case: missing price — must be skipped ────────────────────────────
  {
    make: "Ferrari",
    model: "458 Italia",
    year: 2014,
    asking_price: null,
    mileage: 9100,
    color: "Rosso Corsa",
    location: "Boston, MA",
    dealer_name: "New England Exotics",
    url: "https://www.dupontregistry.com/autos/listing/ferrari-458-noprice-inv-020",
    listed_date: "2025-06-01T00:00:00Z",
  },
  // ── Edge case: missing URL — must be skipped ──────────────────────────────
  {
    make: "Lamborghini",
    model: "Huracan",
    year: 2017,
    asking_price: 208000,
    mileage: 7600,
    color: "Giallo Midas",
    location: "Denver, CO",
    dealer_name: "Mile High Motors",
    url: "",
    listed_date: "2025-06-05T00:00:00Z",
  },
  // ── Edge case: unknown make — model matcher will not find it ──────────────
  {
    make: "Bugatti",
    model: "Chiron",
    year: 2019,
    asking_price: 3200000,
    mileage: 1100,
    color: "French Racing Blue",
    location: "New York, NY",
    dealer_name: "Bugatti Manhattan",
    url: "https://www.dupontregistry.com/autos/listing/bugatti-chiron-inv-021",
    listed_date: "2025-06-10T00:00:00Z",
  },
];

// ─── Inventory Connector ──────────────────────────────────────────────────────

export class InventoryConnector implements ISourceConnector {
  readonly sourceName: string;
  readonly sourceType = "MARKETPLACE" as const;

  /**
   * @param sourceName  Must exactly match a MarketSource.name in the DB.
   *                    Defaults to "DuPont Registry" (seeded in Sprint 5.2).
   */
  constructor(sourceName = "DuPont Registry") {
    this.sourceName = sourceName;
  }

  /**
   * Returns normalized active listing records from the inventory fixture.
   *
   * In production, replace the fixture iteration with a real API call:
   *   const res = await fetch(`${process.env.DUPONT_API_URL}/listings/active`, {
   *     headers: { Authorization: `Bearer ${process.env.DUPONT_API_KEY}` }
   *   });
   *   const data = await res.json();
   *   return data.listings.map(l => this.normalizeListing(l)).filter(Boolean);
   */
  async fetchListings(): Promise<MarketListingInput[]> {
    const results: MarketListingInput[] = [];

    for (const raw of INVENTORY_FIXTURE) {
      const normalized = this.normalizeListing(raw);
      if (normalized) results.push(normalized);
    }

    console.log(
      `[InventoryConnector] fetchListings — ${results.length} valid listings from ${INVENTORY_FIXTURE.length} fixture records`
    );
    return results;
  }

  /**
   * Marketplace inventory connectors don't track completed sales;
   * that data comes from the auction connector.
   */
  async fetchSales(): Promise<MarketSaleInput[]> {
    return [];
  }

  /**
   * Normalizes a raw inventory item into MarketListingInput.
   *
   * Validation rules (returns null and logs if any fail):
   *   1. make must be non-empty
   *   2. model must be non-empty
   *   3. year must be a plausible 4-digit integer (1950–present+1)
   *   4. asking_price must exist and be > 0
   *   5. url must be non-empty (deduplication key)
   *   6. listed_date must parse to a valid Date
   *
   * @param raw  A RawInventoryItem from the fixture or API
   * @returns    MarketListingInput or null
   */
  normalizeListing(raw: RawInventoryItem): MarketListingInput | null {
    // ── Rule 1: make ─────────────────────────────────────────────────────────
    if (!raw.make || raw.make.trim() === "") {
      console.warn(`[InventoryConnector] Missing make — skipping`);
      return null;
    }

    // ── Rule 2: model ─────────────────────────────────────────────────────────
    if (!raw.model || raw.model.trim() === "") {
      console.warn(`[InventoryConnector] Missing model for ${raw.make} — skipping`);
      return null;
    }

    // ── Rule 3: year ──────────────────────────────────────────────────────────
    const currentYear = new Date().getFullYear();
    if (!raw.year || raw.year < 1950 || raw.year > currentYear + 1) {
      console.warn(
        `[InventoryConnector] Invalid year "${raw.year}" for ${raw.make} ${raw.model} — skipping`
      );
      return null;
    }

    // ── Rule 4: price ─────────────────────────────────────────────────────────
    if (raw.asking_price === null || raw.asking_price === undefined || raw.asking_price <= 0) {
      console.warn(
        `[InventoryConnector] Missing or zero price for ${raw.make} ${raw.model} ${raw.year} — skipping`
      );
      return null;
    }

    // ── Rule 5: url ───────────────────────────────────────────────────────────
    if (!raw.url || raw.url.trim() === "") {
      console.warn(
        `[InventoryConnector] Missing URL for ${raw.make} ${raw.model} ${raw.year} — skipping`
      );
      return null;
    }

    // ── Rule 6: listed_date ───────────────────────────────────────────────────
    const listingDate = new Date(raw.listed_date);
    if (isNaN(listingDate.getTime())) {
      console.warn(
        `[InventoryConnector] Unparseable listed_date "${raw.listed_date}" for ${raw.make} ${raw.model} — using now`
      );
      // Non-fatal: default to now rather than skip
    }

    return {
      make: raw.make.trim(),
      model: raw.model.trim(),
      year: raw.year,
      price: raw.asking_price,
      mileage: raw.mileage ?? null,
      color: raw.color ?? null,
      location: raw.location ?? null,
      dealerName: raw.dealer_name ?? null,
      source: this.sourceName,
      sourceType: this.sourceType,
      url: raw.url.trim(),
      listingDate: isNaN(listingDate.getTime()) ? new Date() : listingDate,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalizeSale(_raw: any): MarketSaleInput | null {
    return null;
  }
}
