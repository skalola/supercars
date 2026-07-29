export type AllowedCrawlerMake = "Ferrari" | "Lamborghini";

export type CrawlerSourceType = "DEALER" | "MARKETPLACE";

export type CrawlPage = {
  url: string;
  html: string;
  fetchedAt: Date;
};

export type RawCrawlerListing = {
  sourceName: string;
  sourceType: CrawlerSourceType;
  pageUrl: string;
  url: string | null;
  externalListingId: string | null;
  title: string | null;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  price: number | null;
  mileage: number | null;
  color: string | null;
  location: string | null;
  dealerName: string | null;
  dealerWebsite?: string | null;
  images: string[];
};

export type NormalizedCrawlerListing = {
  sourceName: string;
  sourceType: CrawlerSourceType;
  sourceKey: string;
  externalListingId: string;
  vin: string;
  year: number;
  make: AllowedCrawlerMake;
  model: string;
  trim: string | null;
  price: number | null;
  mileage: number | null;
  color: string | null;
  location: string | null;
  dealerName: string | null;
  dealerWebsite: string | null;
  url: string;
  images: string[];
};

export type CrawlerSourceResult = {
  sourceName: string;
  pagesFetched: number;
  rawListings: number;
  normalizedListings: number;
  ingestedListings: number;
  skipped: string[];
};

export type InventoryCrawlResult = {
  startedAt: string;
  finishedAt: string;
  sources: CrawlerSourceResult[];
  totals: {
    pagesFetched: number;
    normalizedListings: number;
    createdVehicles: number;
    updatedVehicles: number;
    createdListings: number;
    updatedListings: number;
    skipped: number;
  };
};

export interface PublicInventorySource {
  readonly sourceName: string;
  readonly sourceType: CrawlerSourceType;

  crawlPages(): Promise<CrawlPage[]>;
  extractListings(page: CrawlPage): RawCrawlerListing[];
  extractVIN(raw: RawCrawlerListing): string | null;
  normalizeListing(raw: RawCrawlerListing): NormalizedCrawlerListing | null;
}
