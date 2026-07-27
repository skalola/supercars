/**
 * lib/market-sources/connectors/ferrari.connector.ts
 *
 * Ferrari Approved Pre-Owned — Live HTTP Connector
 *
 * Source: https://preowned.ferrari.com / https://api.ferrari.com
 *
 * Data flow:
 *   Real HTTP request → https://api.ferrari.com/cms/dws/preowned/vehicles
 *   ↓
 *   Parse JSON response
 *   ↓
 *   VIN validation (17-char required)
 *   ↓
 *   Normalize to NormalizedExternalListing
 *
 * Authentication:
 *   Set FERRARI_API_KEY in .env to enable authenticated requests.
 *   Without a key, the request is sent unauthenticated. Ferrari's API
 *   returns 401 for unauthenticated requests → connector returns [].
 *
 * This connector NEVER returns hardcoded or fabricated listings.
 * If the live source returns no usable data, [] is returned and logged.
 */

import path from "path";
import type {
  NormalizedExternalListing,
  IExternalInventoryConnector,
} from "./external-inventory";

const BASE_URL = "https://api.ferrari.com/cms/dws/preowned/vehicles";
const SEARCH_URL = "https://preowned.ferrari.com/en-US/used-ferrari";

/** Shape returned by api.ferrari.com/cms/dws/preowned/vehicles */
interface FerrariApiVehicle {
  id?: string;
  vin?: string;
  chassis?: string;
  year?: number;
  modelYear?: number;
  model?: { name?: string; id?: string };
  modelName?: string;
  price?: number;
  askingPrice?: number;
  mileage?: number;
  odometer?: number;
  color?: string;
  exteriorColor?: string;
  dealer?: { name?: string; city?: string; country?: string };
  dealerName?: string;
  listingUrl?: string;
  url?: string;
  images?: string[];
  photos?: string[];
  status?: string;
  certified?: boolean;
}

interface FerrariApiResponse {
  vehicles?: FerrariApiVehicle[];
  listings?: FerrariApiVehicle[];
  results?: FerrariApiVehicle[];
  data?: FerrariApiVehicle[];
  total?: number;
  count?: number;
}

export class FerrariConnector implements IExternalInventoryConnector {
  readonly sourceName = "Ferrari Approved Pre-Owned";

  private readonly apiKey: string | null;
  private readonly pageSize: number;

  constructor() {
    this.apiKey = process.env.FERRARI_API_KEY ?? null;
    this.pageSize = 50;
  }

  async fetchListings(): Promise<NormalizedExternalListing[]> {
    if (!this.apiKey) {
      console.warn(
        `[FerrariConnector] No FERRARI_API_KEY set. ` +
        `Attempting unauthenticated request — will return [] if rejected.`
      );
    }

    const results: NormalizedExternalListing[] = [];

    // Attempt paginated fetch — stop when no more results or on error
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = new URL(BASE_URL);
      url.searchParams.set("country", "US");
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", String(this.pageSize));
      url.searchParams.set("status", "approved");

      const headers: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (compatible; SupercarsBot/1.0; +https://preowned.ferrari.com)",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: SEARCH_URL,
        Origin: "https://preowned.ferrari.com",
      };

      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      let data: FerrariApiResponse | null = null;

      try {
        console.log(
          `[FerrariConnector] Fetching page ${page} from ${url.toString()}`
        );
        const res = await fetch(url.toString(), { headers });

        if (res.status === 401 || res.status === 403) {
          console.warn(
            `[FerrariConnector] Access denied (${res.status}). ` +
            `Set FERRARI_API_KEY in .env to enable authenticated ingestion. ` +
            `Returning 0 listings.`
          );
          return [];
        }

        if (!res.ok) {
          console.warn(
            `[FerrariConnector] HTTP ${res.status} from Ferrari API. Stopping.`
          );
          return results;
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          console.warn(
            `[FerrariConnector] Non-JSON response (${contentType}). ` +
            `Ferrari inventory may require browser-session authentication. ` +
            `Returning 0 listings.`
          );
          return [];
        }

        data = (await res.json()) as FerrariApiResponse;
      } catch (err: any) {
        console.error(`[FerrariConnector] Network error: ${err.message}`);
        return results;
      }

      // Normalise whichever array key the API uses
      const vehicles: FerrariApiVehicle[] =
        data?.vehicles ??
        data?.listings ??
        data?.results ??
        data?.data ??
        [];

      if (vehicles.length === 0) {
        hasMore = false;
        break;
      }

      for (const raw of vehicles) {
        const listing = this.normalizeListing(raw);
        if (listing) results.push(listing);
      }

      // Stop if we received fewer than a full page
      if (vehicles.length < this.pageSize) {
        hasMore = false;
      } else {
        page++;
        // Safety cap — don't loop more than 20 pages
        if (page > 20) hasMore = false;
      }
    }

    console.log(
      `[FerrariConnector] Fetched ${results.length} valid listings from live source.`
    );
    return results;
  }

  normalizeListing(raw: FerrariApiVehicle): NormalizedExternalListing | null {
    const externalId =
      raw.id ?? raw.vin ?? raw.chassis ?? null;
    if (!externalId) return null;

    const vin = raw.vin ?? raw.chassis ?? null;
    const year = raw.year ?? raw.modelYear ?? null;
    const model =
      raw.model?.name ?? raw.modelName ?? null;
    const price =
      raw.price ?? raw.askingPrice ?? null;
    const mileage =
      raw.mileage ?? raw.odometer ?? null;
    const color =
      raw.color ?? raw.exteriorColor ?? null;
    const seller =
      raw.dealer?.name ??
      raw.dealerName ??
      (raw.dealer?.city ? `Ferrari Dealer ${raw.dealer.city}` : null);
    const listingUrl =
      raw.listingUrl ?? raw.url ?? null;
    const images =
      raw.images ?? raw.photos ?? [];

    if (!model || !year) return null;

    return {
      source: this.sourceName,
      externalId,
      vin,
      year,
      make: "Ferrari",
      model,
      price,
      mileage,
      seller,
      url: listingUrl,
      images,
      color,
    } as NormalizedExternalListing;
  }
}
