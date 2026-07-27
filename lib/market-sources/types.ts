/**
 * lib/market-sources/types.ts
 *
 * Sprint 5.5 — Market Data Ingestion Framework
 *
 * Shared TypeScript types for normalized market data flowing
 * from any external source into the Listing / MarketSale tables.
 *
 * Rule: Never store source-specific raw formats in Prisma.
 * Everything must be normalized to these types first.
 */

// ─── Source Type Enum ─────────────────────────────────────────────────────────

export type SourceType = "AUCTION" | "DEALER" | "MARKETPLACE";

// ─── Normalized Listing Input ─────────────────────────────────────────────────

/**
 * Normalized representation of a vehicle actively for sale.
 * Maps to the Prisma `Listing` model after model resolution.
 */
export type MarketListingInput = {
  /** Raw make string as provided by the external source, e.g. "Ferrari" */
  make: string;
  /** Raw model string as provided by the source, e.g. "458 Italia" */
  model: string;
  /** Model year */
  year: number;
  /** Asking price in USD */
  price: number | null;
  /** Odometer reading in miles */
  mileage: number | null;
  /** Exterior color as described by source */
  color: string | null;
  /** Location string, e.g. "Los Angeles, CA" */
  location: string | null;
  /** Dealer or seller name, if applicable */
  dealerName: string | null;
  /** Original source name, e.g. "Bring a Trailer" */
  source: string;
  /** Source type */
  sourceType: SourceType;
  /** URL to the original listing */
  url: string | null;
  /** When this listing was first observed by the source */
  listingDate: Date;
};

// ─── Normalized Sale Input ────────────────────────────────────────────────────

/**
 * Normalized representation of a completed vehicle sale.
 * Maps to the Prisma `MarketSale` model after model resolution.
 */
export type MarketSaleInput = {
  /** Raw make string as provided by the external source */
  make: string;
  /** Raw model string as provided by the source */
  model: string;
  /** Model year */
  year: number;
  /** Final hammer / transaction price in USD */
  salePrice: number;
  /** Odometer reading in miles at time of sale */
  mileage: number | null;
  /** Exterior color */
  color: string | null;
  /** Location string */
  location: string | null;
  /** Original source name */
  source: string;
  /** Source type */
  sourceType: SourceType;
  /** URL to the original sale record or auction result */
  url: string | null;
  /** Date the sale was confirmed / hammer fell */
  saleDate: Date;
};

// ─── Ingestion Result ─────────────────────────────────────────────────────────

export type IngestionResult = {
  /** Source that was processed */
  sourceName: string;
  /** Listings created or updated */
  listingsUpserted: number;
  /** Sales recorded */
  salesCreated: number;
  /** Listings that could not be matched to a Model */
  unresolved: string[];
  /** ISO timestamp */
  processedAt: string;
};

// ─── Source Connector Interface ───────────────────────────────────────────────

/**
 * Contract that every source connector must implement.
 *
 * Connectors are responsible for:
 *   1. Fetching raw data from the external source
 *   2. Normalizing it into MarketListingInput / MarketSaleInput
 *
 * The IngestionEngine handles persistence.
 */
export interface ISourceConnector {
  /** Human-readable name matching the MarketSource.name in the DB */
  readonly sourceName: string;
  /** Source category */
  readonly sourceType: SourceType;

  /**
   * Fetch active listings from the source.
   * Implement pagination / throttling inside the connector.
   * Returns an empty array if the source has no listings endpoint.
   */
  fetchListings(): Promise<MarketListingInput[]>;

  /**
   * Fetch recent sale results from the source.
   * Returns an empty array if the source has no sales endpoint.
   */
  fetchSales(): Promise<MarketSaleInput[]>;

  /**
   * Normalize a raw source-specific listing object into MarketListingInput.
   * Called internally by fetchListings(). Exposed so it can be unit-tested.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalizeListing(raw: any): MarketListingInput | null;

  /**
   * Normalize a raw source-specific sale object into MarketSaleInput.
   * Called internally by fetchSales(). Exposed so it can be unit-tested.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalizeSale(raw: any): MarketSaleInput | null;
}
