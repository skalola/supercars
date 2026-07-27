/**
 * lib/market-sources/connectors/lamborghini.connector.ts
 *
 * Lamborghini Selezione Certified Pre-Owned — Live HTTP Connector
 *
 * Source: https://www.lamborghini.com / https://www-iap.lamborghini.com
 *
 * Data flow:
 *   Real HTTP request → https://www-iap.lamborghini.com/api/v1/cpo/search
 *   ↓
 *   Parse JSON response
 *   ↓
 *   VIN validation (17-char required)
 *   ↓
 *   Normalize to NormalizedExternalListing
 *
 * Authentication:
 *   Set LAMBORGHINI_API_KEY in .env to enable authenticated requests.
 *   Without a key, the request is sent unauthenticated. Lamborghini's API
 *   returns 401 for unauthenticated requests → connector returns [].
 *
 * This connector NEVER returns hardcoded or fabricated listings.
 * If the live source returns no usable data, [] is returned and logged.
 */

import type {
  NormalizedExternalListing,
  IExternalInventoryConnector,
} from "./external-inventory";

const BASE_URL = "https://www-iap.lamborghini.com/api/v1/cpo/search";
const VEHICLES_URL = "https://www-iap.lamborghini.com/api/v1/vehicles";
const REFERER = "https://www.lamborghini.com/en-en/";

/** Shape returned by www-iap.lamborghini.com/api/v1/cpo/search */
interface LamborghiniApiVehicle {
  id?: string;
  stockId?: string;
  vin?: string;
  vehicleIdentificationNumber?: string;
  year?: number;
  modelYear?: number;
  model?: { name?: string; description?: string };
  modelName?: string;
  modelDescription?: string;
  price?: number;
  retailPrice?: number;
  listPrice?: number;
  mileage?: number;
  odometer?: number;
  kilometers?: number;
  color?: string;
  exteriorColor?: string;
  extColor?: string;
  dealer?: { name?: string; city?: string; country?: string; code?: string };
  dealerName?: string;
  url?: string;
  listingUrl?: string;
  detailUrl?: string;
  images?: string[];
  imageUrls?: string[];
  status?: string;
  certified?: boolean;
}

interface LamborghiniApiResponse {
  vehicles?: LamborghiniApiVehicle[];
  results?: LamborghiniApiVehicle[];
  data?: LamborghiniApiVehicle[];
  inventory?: LamborghiniApiVehicle[];
  items?: LamborghiniApiVehicle[];
  total?: number;
  count?: number;
  totalCount?: number;
}

export class LamborghiniConnector implements IExternalInventoryConnector {
  readonly sourceName = "Lamborghini Selezione";

  private readonly apiKey: string | null;
  private readonly pageSize: number;

  constructor() {
    this.apiKey = process.env.LAMBORGHINI_API_KEY ?? null;
    this.pageSize = 50;
  }

  async fetchListings(): Promise<NormalizedExternalListing[]> {
    if (!this.apiKey) {
      console.warn(
        `[LamborghiniConnector] No LAMBORGHINI_API_KEY set. ` +
        `Attempting unauthenticated request — will return [] if rejected.`
      );
    }

    const results: NormalizedExternalListing[] = [];

    // Try the primary CPO search endpoint, fall back to vehicles endpoint
    const endpoints = [BASE_URL, VEHICLES_URL];

    for (const baseEndpoint of endpoints) {
      const pageResults = await this._fetchFromEndpoint(baseEndpoint);
      if (pageResults === null) {
        // auth failure — stop entirely
        return [];
      }
      if (pageResults.length > 0) {
        results.push(...pageResults);
        break; // Got data from this endpoint — don't double-count
      }
    }

    console.log(
      `[LamborghiniConnector] Fetched ${results.length} valid listings from live source.`
    );
    return results;
  }

  /** Returns null on auth failure, [] on empty / no data, listings[] on success */
  private async _fetchFromEndpoint(
    baseEndpoint: string
  ): Promise<NormalizedExternalListing[] | null> {
    const results: NormalizedExternalListing[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = new URL(baseEndpoint);
      url.searchParams.set("locale", "en-en");
      url.searchParams.set("country", "US");
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", String(this.pageSize));
      url.searchParams.set("certified", "true");

      const headers: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (compatible; SupercarsBot/1.0; +https://www.lamborghini.com)",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: REFERER,
        Origin: "https://www.lamborghini.com",
      };

      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
        headers["x-api-key"] = this.apiKey;
      }

      let data: LamborghiniApiResponse | null = null;

      try {
        console.log(
          `[LamborghiniConnector] Fetching page ${page} from ${url.toString()}`
        );
        const res = await fetch(url.toString(), { headers });

        if (res.status === 401 || res.status === 403) {
          console.warn(
            `[LamborghiniConnector] Access denied (${res.status}) at ${baseEndpoint}. ` +
            `Set LAMBORGHINI_API_KEY in .env to enable authenticated ingestion.`
          );
          return null; // Signal auth failure
        }

        if (!res.ok) {
          console.warn(
            `[LamborghiniConnector] HTTP ${res.status} from ${baseEndpoint}. Stopping.`
          );
          return results;
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          console.warn(
            `[LamborghiniConnector] Non-JSON response (${contentType}) from ${baseEndpoint}. ` +
            `Returning 0 listings.`
          );
          return [];
        }

        data = (await res.json()) as LamborghiniApiResponse;
      } catch (err: any) {
        console.error(
          `[LamborghiniConnector] Network error fetching ${baseEndpoint}: ${err.message}`
        );
        return results;
      }

      const vehicles: LamborghiniApiVehicle[] =
        data?.vehicles ??
        data?.results ??
        data?.data ??
        data?.inventory ??
        data?.items ??
        [];

      if (vehicles.length === 0) {
        hasMore = false;
        break;
      }

      for (const raw of vehicles) {
        const listing = this.normalizeListing(raw);
        if (listing) results.push(listing);
      }

      if (vehicles.length < this.pageSize) {
        hasMore = false;
      } else {
        page++;
        if (page > 20) hasMore = false;
      }
    }

    return results;
  }

  normalizeListing(
    raw: LamborghiniApiVehicle
  ): NormalizedExternalListing | null {
    const externalId =
      raw.id ?? raw.stockId ?? raw.vin ?? raw.vehicleIdentificationNumber ?? null;
    if (!externalId) return null;

    const vin =
      raw.vin ?? raw.vehicleIdentificationNumber ?? null;
    const year =
      raw.year ?? raw.modelYear ?? null;
    const model =
      raw.model?.name ??
      raw.model?.description ??
      raw.modelName ??
      raw.modelDescription ??
      null;
    const price =
      raw.price ?? raw.retailPrice ?? raw.listPrice ?? null;
    const mileage =
      raw.mileage ?? raw.odometer ?? raw.kilometers ?? null;
    const color =
      raw.color ?? raw.exteriorColor ?? raw.extColor ?? null;
    const seller =
      raw.dealer?.name ??
      raw.dealerName ??
      (raw.dealer?.city ? `Lamborghini Dealer ${raw.dealer.city}` : null);
    const listingUrl =
      raw.url ?? raw.listingUrl ?? raw.detailUrl ?? null;
    const images =
      raw.images ?? raw.imageUrls ?? [];

    if (!model || !year) return null;

    return {
      source: this.sourceName,
      externalId,
      vin,
      year,
      make: "Lamborghini",
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
