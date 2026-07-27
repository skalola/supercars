/**
 * lib/market-sources/connectors/dealer.connector.ts
 *
 * Sprint 5.5 — Dealer Source Connector (Stub)
 *
 * Implements ISourceConnector for dealer networks such as:
 *   - Ferrari Dealer Network
 *   - Lamborghini Dealer Network
 *   - Licensed Pre-Owned Programs
 *
 * HOW TO ACTIVATE:
 *   1. Add the dealer source to the MarketSource table (name must match sourceName).
 *   2. Implement fetchListings() to call the dealer API or feed URL.
 *   3. Dealer networks typically don't publish sale prices; fetchSales() stays empty.
 *   4. Implement normalizeListing() to map raw dealer inventory format.
 *   5. Import and call runConnector(new DealerConnector()) from a cron job.
 *
 * IMPORTANT:
 *   - Dealer APIs typically require a partnership or API key.
 *   - Set the API key via an environment variable, not in source code.
 *   - Dealer listings represent "buy now" price, not auction reserve.
 */

import type {
  ISourceConnector,
  MarketListingInput,
  MarketSaleInput,
} from "../types";

export class DealerConnector implements ISourceConnector {
  readonly sourceName: string;
  readonly sourceType = "DEALER" as const;

  /**
   * @param sourceName Must exactly match a MarketSource.name record in the DB,
   *                   e.g. "Ferrari Dealer Network"
   */
  constructor(sourceName = "Ferrari Dealer Network") {
    this.sourceName = sourceName;
  }

  /**
   * Fetch active dealer inventory listings.
   *
   * TODO: Replace stub with real implementation.
   * Example integrations:
   *   - Ferrari IMOS API (partner programme)
   *   - Lamborghini Certified Pre-Owned XML feed
   *   - Generic dealer DMS export (CDK, Reynolds & Reynolds)
   *
   * Configuration:
   *   const apiKey = process.env.DEALER_API_KEY;
   *   const baseUrl = process.env.DEALER_API_BASE_URL;
   *
   * @returns Array of normalized listing inputs
   */
  async fetchListings(): Promise<MarketListingInput[]> {
    // STUB: return empty until real source is connected
    console.log(`[DealerConnector:${this.sourceName}] fetchListings — stub, no data`);
    return [];
  }

  /**
   * Dealer networks generally do not expose sale prices.
   * Returns empty array by design.
   */
  async fetchSales(): Promise<MarketSaleInput[]> {
    return [];
  }

  /**
   * Normalize a raw dealer inventory item into MarketListingInput.
   *
   * TODO: Implement when source is connected.
   * Example raw dealer payload shape:
   * {
   *   make: "Ferrari",
   *   modelName: "SF90 Stradale",
   *   modelYear: 2023,
   *   retailPrice: 625000,
   *   odometerMiles: 1200,
   *   extColor: "Rosso Corsa",
   *   dealerCity: "Beverly Hills",
   *   dealerState: "CA",
   *   stockNumber: "FER-2023-001",
   *   listingUrl: "https://ferrari.com/..."
   * }
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalizeListing(raw: any): MarketListingInput | null {
    // STUB
    void raw;
    return null;
  }

  /**
   * Dealers don't publish sales — returns null by design.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalizeSale(raw: any): MarketSaleInput | null {
    void raw;
    return null;
  }
}
