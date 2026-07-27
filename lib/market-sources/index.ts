/**
 * lib/market-sources/index.ts
 *
 * Sprint 5.5 — Market Data Ingestion Framework
 *
 * Public API barrel. Import everything needed for market data ingestion
 * from this single entry point.
 *
 * Usage example (future cron job or admin script):
 *
 *   import { runConnector, AuctionConnector } from "@/lib/market-sources";
 *
 *   const result = await runConnector(new AuctionConnector("Bring a Trailer"));
 *   console.log(result);
 *
 * Adding a new source:
 *   1. Create a new connector in ./connectors/<name>.connector.ts
 *   2. Implement ISourceConnector (see types.ts)
 *   3. Export it from this barrel
 *   4. Call runConnector() from your ingestion script or cron
 */

// Types
export type {
  MarketListingInput,
  MarketSaleInput,
  IngestionResult,
  ISourceConnector,
  SourceType,
} from "./types";

// Model matching
export { resolveModel, batchResolveModels } from "./model-matcher";

// Ingestion engine
export {
  ingestListings,
  ingestSales,
  generateSnapshot,
  runConnector,
} from "./ingestion-engine";

// Connectors
export { AuctionConnector } from "./connectors/auction.connector";
export { DealerConnector } from "./connectors/dealer.connector";
export { MarketplaceConnector } from "./connectors/marketplace.connector";
export { BaTConnector } from "./connectors/bat.connector";
export { InventoryConnector } from "./connectors/inventory.connector";
