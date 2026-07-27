/**
 * lib/market-sources/connectors/marketplace.connector.ts
 *
 * Sprint 5.5 — Marketplace Source Connector (Stub)
 *
 * Implements ISourceConnector for peer-to-peer / broker marketplaces such as:
 *   - DuPont Registry
 *   - AutoTrader (exotic/luxury segment)
 *   - Cars & Bids
 *   - ClassicCars.com
 *
 * HOW TO ACTIVATE:
 *   1. Add the marketplace source to the MarketSource table (name must match sourceName).
 *   2. Implement fetchListings() to call the marketplace API or feed.
 *   3. Implement fetchSales() if the marketplace publishes sold listings.
 *   4. Implement normalizeListing() / normalizeSale() to map the raw payload.
 *   5. Import and call runConnector(new MarketplaceConnector()) from a cron job.
 *
 * IMPORTANT:
 *   - Most marketplaces offer a listings API for registered partners.
 *   - Store API keys in environment variables only.
 *   - Marketplace prices include dealer markup and may differ from auction results.
 */

import type {
  ISourceConnector,
  MarketListingInput,
  MarketSaleInput,
} from "../types";

export class MarketplaceConnector implements ISourceConnector {
  readonly sourceName: string;
  readonly sourceType = "MARKETPLACE" as const;

  /**
   * @param sourceName Must exactly match a MarketSource.name record in the DB,
   *                   e.g. "DuPont Registry"
   */
  constructor(sourceName = "DuPont Registry") {
    this.sourceName = sourceName;
  }

  /**
   * Fetch active marketplace listings.
   *
   * TODO: Replace stub with real implementation.
   * Example integrations:
   *   - DuPont Registry Dealer API: https://developers.dupontregistry.com/
   *   - Cars & Bids RSS / JSON feed
   *   - AutoTrader Partner API
   *
   * Configuration:
   *   const apiKey = process.env.MARKETPLACE_API_KEY;
   *
   * @returns Array of normalized listing inputs
   */
  async fetchListings(): Promise<MarketListingInput[]> {
    // STUB: return empty until real source is connected
    console.log(`[MarketplaceConnector:${this.sourceName}] fetchListings — stub, no data`);
    return [];
  }

  /**
   * Fetch completed sales from the marketplace.
   *
   * TODO: Implement if the marketplace exposes a "sold" endpoint.
   * Many do not; in that case leave this returning [].
   *
   * @returns Array of normalized sale inputs
   */
  async fetchSales(): Promise<MarketSaleInput[]> {
    // STUB: return empty until real source is connected
    console.log(`[MarketplaceConnector:${this.sourceName}] fetchSales — stub, no data`);
    return [];
  }

  /**
   * Normalize a raw marketplace listing payload into MarketListingInput.
   *
   * TODO: Implement when source is connected.
   * Example raw DuPont Registry payload shape:
   * {
   *   make: "Lamborghini",
   *   model: "Huracan LP 610-4",
   *   year: 2016,
   *   askingPrice: 219900,
   *   mileage: 8200,
   *   color: "Giallo Orion",
   *   city: "Miami",
   *   state: "FL",
   *   dealer: "Prestige Imports",
   *   url: "https://www.dupontregistry.com/autos/..."
   * }
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalizeListing(raw: any): MarketListingInput | null {
    // STUB
    void raw;
    return null;
  }

  /**
   * Normalize a raw marketplace sold record into MarketSaleInput.
   *
   * TODO: Implement when source exposes sold data.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalizeSale(raw: any): MarketSaleInput | null {
    // STUB
    void raw;
    return null;
  }
}
