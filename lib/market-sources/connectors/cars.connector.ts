import type {
  NormalizedExternalListing,
  IExternalInventoryConnector,
} from "./external-inventory";

export class CarsConnector implements IExternalInventoryConnector {
  readonly sourceName = "Cars.com";

  private rawItems = [
    {
      id: "cars-lst-001",
      vin: "ZHWUA4ZHXJLA07777", // Valid 17-character VIN — Lamborghini Aventador
      year: 2018,
      make: "Lamborghini",
      model: "Aventador S",
      price: 369900,
      mileage: 6200,
      seller: "Gold Coast Auto Gallery",
      url: "https://www.cars.com/vehicledetail/lamborghini-aventador-s-001",
      images: ["https://images.unsplash.com/photo-1544829099-b9a0c07fad1a"],
      color: "Nero Nemesis",
    },
    {
      id: "cars-lst-002",
      vin: "BADVIN123", // Invalid VIN — must be skipped
      year: 2016,
      make: "Ferrari",
      model: "488 GTB",
      price: 219000,
      mileage: 12500,
      seller: "Dallas Exotic Cars",
      url: "https://www.cars.com/vehicledetail/ferrari-488-gtb-002",
      images: ["https://images.unsplash.com/photo-1583121274602-3e2820c69888"],
      color: "Bianco Avus",
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
