export interface NormalizedExternalListing {
  source: string;
  externalId: string;
  vin: string | null;
  year: number;
  make: string;
  model: string;
  price: number | null;
  mileage: number | null;
  seller: string | null;
  url: string | null;
  images: string[];
  color?: string | null;
}

export interface IExternalInventoryConnector {
  sourceName: string;
  fetchListings(): Promise<NormalizedExternalListing[]>;
  normalizeListing(raw: any): NormalizedExternalListing | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Bring a Trailer Inventory Connector
// ──────────────────────────────────────────────────────────────────────────────
export class BaTInventoryConnector implements IExternalInventoryConnector {
  readonly sourceName = "Bring a Trailer";

  // Dummy raw data simulation
  private rawItems = [
    {
      id: "bat-lst-001",
      vin: "ZHWUF4ZFXLLA13558", // Match existing Huracan
      year: 2020,
      make: "Lamborghini",
      model: "Huracan EVO",
      price: 235000,
      mileage: 14200,
      seller: "Private Seller",
      url: "https://bringatrailer.com/listing/2020-lamborghini-huracan-evo-1",
      images: ["https://images.unsplash.com/photo-1544829099-b9a0c07fad1a"],
    },
    {
      id: "bat-lst-002",
      vin: "ZFF68AHA6E0209999", // New Ferrari 458 VIN
      year: 2014,
      make: "Ferrari",
      model: "458 Italia",
      price: 215000,
      mileage: 18500,
      seller: "Ferrari Los Angeles",
      url: "https://bringatrailer.com/listing/2014-ferrari-458-italia-1",
      images: ["https://images.unsplash.com/photo-1583121274602-3e2820c69888"],
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
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// DuPont Registry Inventory Connector
// ──────────────────────────────────────────────────────────────────────────────
export class DuPontInventoryConnector implements IExternalInventoryConnector {
  readonly sourceName = "DuPont Registry";

  private rawItems = [
    {
      id: "dupont-lst-001",
      vin: "ZHWUF4ZFXLLA13558", // Match existing Huracan
      year: 2020,
      make: "Lamborghini",
      model: "Huracan EVO",
      price: 249000,
      mileage: 12500,
      seller: "Prestige Imports Miami",
      url: "https://dupontregistry.com/autos/listing/2020-lamborghini-huracan-evo",
      images: ["https://images.unsplash.com/photo-1544829099-b9a0c07fad1a"],
    },
    {
      id: "dupont-lst-002",
      vin: null, // No VIN - match by specifications fallback
      year: 2018,
      make: "Ferrari",
      model: "488 GTB",
      price: 275000,
      mileage: 6200,
      seller: "Midwest Exotic Cars",
      url: "https://dupontregistry.com/autos/listing/2018-ferrari-488-gtb",
      images: ["https://images.unsplash.com/photo-1583121274602-3e2820c69888"],
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
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Ferrari Dealer Inventory Connector
// ──────────────────────────────────────────────────────────────────────────────
export class FerrariDealerConnector implements IExternalInventoryConnector {
  readonly sourceName = "Ferrari dealer inventory";

  private rawItems = [
    {
      id: "ferrari-dealer-001",
      vin: "ZFF68AHA6E0209999", // Match BaT imported 458
      year: 2014,
      make: "Ferrari",
      model: "458 Italia",
      price: 220000,
      mileage: 18520,
      seller: "Ferrari Beverly Hills",
      url: "https://dealer.ferrari.com/beverlyhills/inventory/2014-ferrari-458",
      images: ["https://images.unsplash.com/photo-1583121274602-3e2820c69888"],
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
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Lamborghini Dealer Inventory Connector
// ──────────────────────────────────────────────────────────────────────────────
export class LamborghiniDealerConnector implements IExternalInventoryConnector {
  readonly sourceName = "Lamborghini dealer inventory";

  private rawItems = [
    {
      id: "lambo-dealer-001",
      vin: "ZHWUF4ZFXLLA13558", // Match existing Huracan
      year: 2020,
      make: "Lamborghini",
      model: "Huracan EVO",
      price: 239900,
      mileage: 12550,
      seller: "Lamborghini Miami",
      url: "https://dealer.lamborghini.com/miami/inventory/2020-lambo-huracan",
      images: ["https://images.unsplash.com/photo-1544829099-b9a0c07fad1a"],
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
    };
  }
}
