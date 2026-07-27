import type {
  NormalizedExternalListing,
  IExternalInventoryConnector,
} from "./external-inventory";

export class McLarenConnector implements IExternalInventoryConnector {
  readonly sourceName = "McLaren Dealer Network";

  private rawItems = [
    {
      id: "mclaren-dealership-lst-001",
      vin: "SBM11DCA6HW009999", // Valid 17-character VIN — McLaren 720S
      year: 2018,
      make: "McLaren",
      model: "720S",
      price: 259000,
      mileage: 9400,
      seller: "McLaren Philadelphia",
      url: "https://preowned.mclaren.com/autos/listing/mclaren-720s-philadelphia",
      images: ["https://images.unsplash.com/photo-1580273916550-e323be2ae537"],
      color: "McLaren Orange",
    },
    {
      id: "mclaren-dealership-lst-002",
      vin: null, // Invalid/missing VIN — must be skipped
      year: 2021,
      make: "McLaren",
      model: "Artura",
      price: 215000,
      mileage: 2300,
      seller: "McLaren Beverly Hills",
      url: "https://preowned.mclaren.com/autos/listing/mclaren-artura-beverly-hills",
      images: ["https://images.unsplash.com/photo-1580273916550-e323be2ae537"],
      color: "Flux Green",
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
