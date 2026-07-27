/**
 * lib/market-sources/connectors/auction.connector.ts
 *
 * Sprint 5.5 — Auction Source Connector (Stub)
 *
 * Implements ISourceConnector for auction houses such as:
 *   - Bring a Trailer (BaT)
 *   - RM Sotheby's
 *   - Gooding & Company
 *
 * HOW TO ACTIVATE:
 *   1. Add the auction source to the MarketSource table (name must match sourceName).
 *   2. Implement fetchListings() and fetchSales() to call the auction API or scraper.
 *   3. Implement normalizeListing() and normalizeSale() to map the raw API response.
 *   4. Import and call runConnector(new AuctionConnector()) from a cron job or script.
 *
 * IMPORTANT:
 *   - Do NOT store raw auction API responses in Prisma.
 *   - Always normalize through normalizeListing() / normalizeSale() first.
 *   - Respect rate limits and terms of service for each auction house.
 */

import type {
  ISourceConnector,
  MarketListingInput,
  MarketSaleInput,
} from "../types";

export class AuctionConnector implements ISourceConnector {
  readonly sourceName: string;
  readonly sourceType = "AUCTION" as const;

  /**
   * @param sourceName Must exactly match a MarketSource.name record in the DB,
   *                   e.g. "Bring a Trailer" or "RM Sotheby's"
   */
  constructor(sourceName = "Bring a Trailer") {
    this.sourceName = sourceName;
  }

  /**
   * Fetch active auction listings.
   *
   * TODO: Replace stub with real implementation.
   * Example integrations:
   *   - BaT RSS feed (public): https://bringatrailer.com/feed/
   *   - RM Sotheby's REST API (requires account)
   *
   * @returns Array of normalized listing inputs
   */
  async fetchListings(): Promise<MarketListingInput[]> {
    // STUB: return empty until real source is connected
    console.log(`[AuctionConnector:${this.sourceName}] fetchListings — stub, no data`);
    return [];
  }

  /**
   * Fetch completed auction sale results.
   *
   * TODO: Replace stub with real implementation.
   * Example: BaT sold listings endpoint or results RSS
   *
   * @returns Array of normalized sale inputs
   */
  async fetchSales(): Promise<MarketSaleInput[]> {
    // STUB: return empty until real source is connected
    console.log(`[AuctionConnector:${this.sourceName}] fetchSales — stub, no data`);
    return [];
  }

  /**
   * Normalize a raw auction listing payload into MarketListingInput.
   *
   * TODO: Implement when source is connected.
   * Example raw BaT listing shape:
   * {
   *   title: "1999 Ferrari 360 Modena",
   *   year: 1999,
   *   bidPrice: 85000,
   *   odometer: 22000,
   *   color: "Rosso Corsa",
   *   location: "California",
   *   url: "https://bringatrailer.com/listing/..."
   * }
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalizeListing(raw: any): MarketListingInput | null {
    // STUB
    void raw;
    return null;
  }

  /**
   * Normalize a raw auction sale result into MarketSaleInput.
   *
   * TODO: Implement when source is connected.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalizeSale(raw: any): MarketSaleInput | null {
    // STUB
    void raw;
    return null;
  }
}
