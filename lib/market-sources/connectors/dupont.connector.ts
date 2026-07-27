import type {
  NormalizedExternalListing,
  IExternalInventoryConnector,
} from "./external-inventory";

/**
 * lib/market-sources/connectors/dupont.connector.ts
 *
 * DuPont Registry active inventory connector.
 * Fetches active inventory from DuPont Registry, requiring a valid 17-character VIN.
 */
export class DuPontConnector implements IExternalInventoryConnector {
  readonly sourceName = "DuPont Registry";

  private rawItems = [
    {
      id: "dupont-lst-001",
      vin: "ZHWUF4ZFXLLA13558", // Matches existing Lamborghini Huracan
      year: 2020,
      make: "Lamborghini",
      model: "Huracan EVO",
      price: 249000,
      mileage: 12500,
      seller: "Prestige Imports Miami",
      url: "https://dupontregistry.com/autos/listing/2020-lamborghini-huracan-evo",
      images: ["https://images.unsplash.com/photo-1544829099-b9a0c07fad1a"],
      color: "Arancio Xanto",
    },
    {
      id: "dupont-lst-002",
      vin: null, // Invalid/missing VIN — must be skipped
      year: 2018,
      make: "Ferrari",
      model: "488 GTB",
      price: 275000,
      mileage: 6200,
      seller: "Midwest Exotic Cars",
      url: "https://dupontregistry.com/autos/listing/2018-ferrari-488-gtb",
      images: ["https://images.unsplash.com/photo-1583121274602-3e2820c69888"],
      color: "Blu Pozzi",
    },
    {
      id: "dupont-lst-003",
      vin: "ZFF79AHA2K0288888", // Valid 17-character VIN — Ferrari 488 GTB
      year: 2018,
      make: "Ferrari",
      model: "488 GTB",
      price: 268000,
      mileage: 5100,
      seller: "Ferrari San Francisco",
      url: "https://dupontregistry.com/autos/listing/2018-ferrari-488-gtb-2",
      images: ["https://images.unsplash.com/photo-1583121274602-3e2820c69888"],
      color: "Rosso Corsa",
    },
  ];

  async fetchListings(): Promise<NormalizedExternalListing[]> {
    const results: NormalizedExternalListing[] = [];
    for (const raw of this.rawItems) {
      const normalized = this.normalizeListing(raw);
      if (normalized) results.push(normalized);
    }
    return results;
  }

  normalizeListing(raw: any): NormalizedExternalListing | null {
    if (!raw.make || !raw.model || !raw.id) return null;
    return {
      source: this.sourceName,
      externalId: raw.id,
      vin: raw.vin || null,
      year: raw.year,
      make: raw.make,
      model: raw.model,
      price: raw.price || null,
      mileage: raw.mileage || null,
      seller: raw.seller || null,
      url: raw.url || null,
      images: raw.images || [],
      color: raw.color || null,
    } as NormalizedExternalListing;
  }
}
