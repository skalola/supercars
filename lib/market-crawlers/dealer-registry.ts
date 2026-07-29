/**
 * lib/market-crawlers/dealer-registry.ts
 *
 * Authoritative registry of Ferrari and Lamborghini authorized dealerships.
 *
 * This file contains ONLY metadata — no crawling logic.
 * To add a new dealer: append an entry to FERRARI_DEALERS or LAMBORGHINI_DEALERS.
 * To disable a dealer: set active: false.
 *
 * The crawler factory in sources/authorized-dealers.ts reads this registry
 * and instantiates a PublicPageSource per active entry.
 */

export type DealerBrand = "Ferrari" | "Lamborghini";

export interface DealerSource {
  /** Display name stored in DB as the MarketSource name */
  name: string;
  brand: DealerBrand;
  city: string;
  state: string;
  /** Primary pre-owned / certified pre-owned inventory page URL */
  inventoryUrl: string;
  /**
   * Optional additional URLs for paginated or alternate inventory sections.
   * All URLs are crawled; detail links discovered from each.
   */
  additionalUrls?: string[];
  sourceType: "DEALER";
  active: boolean;
}

// ─── Ferrari Authorized Dealers ───────────────────────────────────────────────

export const FERRARI_DEALERS: DealerSource[] = [
  {
    name: "Ferrari of Beverly Hills",
    brand: "Ferrari",
    city: "Beverly Hills",
    state: "CA",
    inventoryUrl: "https://www.ferrariofbeverlyhills.com/pre-owned-inventory/",
    additionalUrls: [
      "https://www.ferrariofbeverlyhills.com/certified-pre-owned-ferrari/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Ferrari Silicon Valley",
    brand: "Ferrari",
    city: "Redwood City",
    state: "CA",
    inventoryUrl: "https://www.ferrarisiliconvalley.com/searchall.aspx",
    additionalUrls: [
      "https://www.ferrarisiliconvalley.com/searchall.aspx",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Ferrari of Los Angeles",
    brand: "Ferrari",
    city: "Los Angeles",
    state: "CA",
    inventoryUrl: "https://www.ferrarila.com/pre-owned/",
    additionalUrls: [
      "https://www.ferrarila.com/used-ferrari-for-sale/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Ferrari of Miami",
    brand: "Ferrari",
    city: "Miami",
    state: "FL",
    inventoryUrl: "https://www.ferrariofmiami.com/pre-owned/",
    additionalUrls: [
      "https://www.ferrariofmiami.com/certified-pre-owned/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Ferrari of Fort Lauderdale",
    brand: "Ferrari",
    city: "Fort Lauderdale",
    state: "FL",
    inventoryUrl: "https://www.ferrarioffortlauderdale.com/pre-owned-inventory/",
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Ferrari of Palm Beach",
    brand: "Ferrari",
    city: "West Palm Beach",
    state: "FL",
    inventoryUrl: "https://www.ferrariofpalmbeach.com/pre-owned-inventory/",
    additionalUrls: [
      "https://www.ferrariofpalmbeach.com/certified-pre-owned-inventory/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Ferrari of Houston",
    brand: "Ferrari",
    city: "Houston",
    state: "TX",
    inventoryUrl: "https://ferrariofhouston.com/pre-owned-inventory/",
    additionalUrls: [
      "https://ferrariofhouston.com/certified-pre-owned/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Ferrari of Dallas",
    brand: "Ferrari",
    city: "Dallas",
    state: "TX",
    inventoryUrl: "https://www.ferrariofdallas.com/pre-owned-inventory/",
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Ferrari of Atlanta",
    brand: "Ferrari",
    city: "Atlanta",
    state: "GA",
    inventoryUrl: "https://www.ferrariofatlanta.com/pre-owned-inventory/",
    additionalUrls: [
      "https://www.ferrariofatlanta.com/certified-pre-owned/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Perillo Ferrari Chicago",
    brand: "Ferrari",
    city: "Chicago",
    state: "IL",
    inventoryUrl: "https://www.perillomotorcars.com/ferrari/used-ferrari/",
    additionalUrls: [
      "https://www.perillomotorcars.com/pre-owned-inventory/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Ferrari of Long Island",
    brand: "Ferrari",
    city: "Plainview",
    state: "NY",
    inventoryUrl: "https://www.ferrariofthelongisland.com/pre-owned-inventory/",
    additionalUrls: [
      "https://www.ferrariofthelongisland.com/certified-pre-owned/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Ferrari of Greenwich",
    brand: "Ferrari",
    city: "Greenwich",
    state: "CT",
    inventoryUrl: "https://www.ferrariofgreenwich.com/pre-owned-inventory/",
    additionalUrls: [
      "https://www.ferrariofgreenwich.com/certified-pre-owned-ferrari/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Ferrari of Washington DC",
    brand: "Ferrari",
    city: "Tysons",
    state: "VA",
    inventoryUrl: "https://www.ferrariofwashington.com/pre-owned-inventory/",
    additionalUrls: [
      "https://www.ferrariofwashington.com/certified-pre-owned/",
    ],
    sourceType: "DEALER",
    active: true,
  },
];

// ─── Lamborghini Authorized Dealers ───────────────────────────────────────────

export const LAMBORGHINI_DEALERS: DealerSource[] = [
  {
    name: "Lamborghini Beverly Hills",
    brand: "Lamborghini",
    city: "Beverly Hills",
    state: "CA",
    inventoryUrl: "https://www.lamborghinibeverlyhills.com/pre-owned-lamborghini/",
    additionalUrls: [
      "https://www.lamborghinibeverlyhills.com/certified-pre-owned/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Lamborghini Newport Beach",
    brand: "Lamborghini",
    city: "Newport Beach",
    state: "CA",
    inventoryUrl: "https://www.lamborghininewportbeach.com/pre-owned/",
    additionalUrls: [
      "https://www.lamborghininewportbeach.com/certified-pre-owned-lamborghini/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Lamborghini Los Angeles",
    brand: "Lamborghini",
    city: "Los Angeles",
    state: "CA",
    inventoryUrl: "https://www.lamborghinilosangeles.com/pre-owned/",
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Lamborghini Miami",
    brand: "Lamborghini",
    city: "Miami",
    state: "FL",
    inventoryUrl: "https://www.lamborghinimiami.com/pre-owned/",
    additionalUrls: [
      "https://www.lamborghinimiami.com/certified-pre-owned/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Lamborghini Broward",
    brand: "Lamborghini",
    city: "Davie",
    state: "FL",
    inventoryUrl: "https://www.lamborghinibroward.com/pre-owned/",
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Lamborghini Palm Beach",
    brand: "Lamborghini",
    city: "West Palm Beach",
    state: "FL",
    inventoryUrl: "https://www.lamborghinipalmbeach.com/cars-for-sale-west-palm-beach-fl",
    additionalUrls: [
      "https://www.lamborghinipalmbeach.com/pre-owned/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Lamborghini Houston",
    brand: "Lamborghini",
    city: "Houston",
    state: "TX",
    inventoryUrl: "https://www.lamborghinihouston.com/pre-owned/",
    additionalUrls: [
      "https://www.lamborghinihouston.com/certified-pre-owned/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Lamborghini Dallas",
    brand: "Lamborghini",
    city: "Dallas",
    state: "TX",
    inventoryUrl: "https://www.lamborghinidallas.com/pre-owned/",
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Lamborghini Austin",
    brand: "Lamborghini",
    city: "Austin",
    state: "TX",
    inventoryUrl: "https://www.lamborghiniaustin.com/pre-owned/",
    additionalUrls: [
      "https://www.lamborghiniaustin.com/certified-pre-owned/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Lamborghini Atlanta",
    brand: "Lamborghini",
    city: "Atlanta",
    state: "GA",
    inventoryUrl: "https://www.lamborghiniatlanta.com/pre-owned/",
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Lamborghini Chicago",
    brand: "Lamborghini",
    city: "Chicago",
    state: "IL",
    inventoryUrl: "https://www.lamborghinichicago.com/pre-owned/",
    additionalUrls: [
      "https://www.lamborghinichicago.com/certified-pre-owned/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Lamborghini Manhattan",
    brand: "Lamborghini",
    city: "New York",
    state: "NY",
    inventoryUrl: "https://www.lamborghinimanhattan.com/pre-owned/",
    additionalUrls: [
      "https://www.lamborghinimanhattan.com/certified-pre-owned/",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Lamborghini Paramus",
    brand: "Lamborghini",
    city: "Paramus",
    state: "NJ",
    inventoryUrl: "https://www.lamborghiniparamus.com/cars-for-sale-paramus-nj",
    additionalUrls: [
      "https://www.lamborghiniparamus.com/pre-owned/",
    ],
    sourceType: "DEALER",
    active: true,
  },
];

// ─── Combined registry ─────────────────────────────────────────────────────

/** All active authorized dealers across both brands */
export const ALL_AUTHORIZED_DEALERS: DealerSource[] = [
  ...FERRARI_DEALERS,
  ...LAMBORGHINI_DEALERS,
].filter((d) => d.active);

/** Active dealers for a specific brand */
export function getDealersByBrand(brand: DealerBrand): DealerSource[] {
  return ALL_AUTHORIZED_DEALERS.filter((d) => d.brand === brand);
}
