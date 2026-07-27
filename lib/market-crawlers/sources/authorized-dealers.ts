/**
 * lib/market-crawlers/sources/authorized-dealers.ts
 *
 * Crawler factory for authorized Ferrari and Lamborghini dealerships.
 *
 * Reads the dealer registry and creates one PublicPageSource per active dealer.
 * No scraping logic lives here — all extraction is handled by PublicPageSource.
 *
 * Adding a new dealer: edit dealer-registry.ts only.
 */

import { ALL_AUTHORIZED_DEALERS, type DealerSource } from "../dealer-registry";
import { PublicPageSource } from "./public-page-source";
import type { PublicInventorySource } from "../types";

/**
 * Pattern used by detail-link discovery.
 * Matches common inventory/vehicle detail URL shapes across dealership platforms.
 */
const DEALER_DETAIL_LINK_PATTERNS: RegExp[] = [
  /ferrari/i,
  /lamborghini/i,
  /\/inventory\/.+/i,
  /\/vehicles?\/.+/i,
  /\/vehicle-details\/.+/i,
  /\/pre-owned\/.+/i,
  /\/used\/.+/i,
  /\/certified\/.+/i,
  /\/listing\/.+/i,
  /\/detail\/.+/i,
  /\/car\/.+/i,
];

function createSourceForDealer(dealer: DealerSource): PublicInventorySource {
  const urls = [
    dealer.inventoryUrl,
    ...(dealer.additionalUrls ?? []),
  ];

  return new PublicPageSource({
    sourceName: dealer.name,
    sourceType: dealer.sourceType,
    urls,
    discoverDetailLinks: true,
    detailLinkPatterns: DEALER_DETAIL_LINK_PATTERNS,
    // Each dealer may have 10–80 vehicles; allow up to 120 detail pages per source.
    maxDetailPages: 120,
  });
}

/**
 * Returns one PublicPageSource per active authorized dealer (both brands).
 * Used by crawl-dealer-inventory.ts.
 */
export function createAuthorizedDealerSources(): PublicInventorySource[] {
  return ALL_AUTHORIZED_DEALERS.map(createSourceForDealer);
}

/**
 * Returns sources for a specific brand only.
 */
export function createAuthorizedDealerSourcesByBrand(
  brand: "Ferrari" | "Lamborghini"
): PublicInventorySource[] {
  return ALL_AUTHORIZED_DEALERS
    .filter((d) => d.brand === brand)
    .map(createSourceForDealer);
}
