/**
 * lib/market-crawlers/dealer-registry.ts
 *
 * Authoritative registry of supported authorized dealerships.
 *
 * This file contains ONLY metadata — no crawling logic.
 * To add a new dealer: append an entry to the matching brand array.
 * To disable a dealer: set active: false.
 *
 * The crawler factory in sources/authorized-dealers.ts reads this registry
 * and instantiates a PublicPageSource per active entry.
 */

import type { SupportedMake } from "@/lib/supported-makes";

export type DealerBrand = SupportedMake;

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
    name: "Foreign Cars Italia Charlotte",
    brand: "Ferrari",
    city: "Charlotte",
    state: "NC",
    inventoryUrl: "https://charlotte.ferraridealers.com/en-US/r/used-ferrari/f",
    additionalUrls: [
      "https://charlotte.ferraridealers.com/en-US/ferrari-certified-pre-owned",
    ],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "Foreign Cars Italia Greensboro",
    brand: "Ferrari",
    city: "Greensboro",
    state: "NC",
    inventoryUrl: "https://greensboro.ferraridealers.com/en-US/r/used-ferrari/f",
    additionalUrls: [
      "https://greensboro.ferraridealers.com/en-US/ferrari-certified-pre-owned",
    ],
    sourceType: "DEALER",
    active: true,
  },
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

// ─── McLaren Authorized Dealers ──────────────────────────────────────────────

export const MCLAREN_DEALERS: DealerSource[] = [
  {
    name: "McLaren Charlotte",
    brand: "McLaren",
    city: "Charlotte",
    state: "NC",
    inventoryUrl: "https://www.mclarencharlotte.com/used-vehicles/",
    additionalUrls: ["https://www.mclarencharlotte.com/new-vehicles/"],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "McLaren Philadelphia",
    brand: "McLaren",
    city: "West Chester",
    state: "PA",
    inventoryUrl: "https://www.mclarenphl.com/used-inventory/index.htm",
    additionalUrls: ["https://www.mclarenphl.com/new-inventory/index.htm"],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "McLaren Beverly Hills",
    brand: "McLaren",
    city: "Beverly Hills",
    state: "CA",
    inventoryUrl: "https://www.mclarenbeverlyhills.com/used-vehicles/",
    additionalUrls: ["https://www.mclarenbeverlyhills.com/new-vehicles/"],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "McLaren Newport Beach",
    brand: "McLaren",
    city: "Newport Beach",
    state: "CA",
    inventoryUrl: "https://www.mclarennewportbeach.com/used-vehicles/",
    additionalUrls: ["https://www.mclarennewportbeach.com/new-vehicles/"],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "McLaren San Francisco",
    brand: "McLaren",
    city: "San Francisco",
    state: "CA",
    inventoryUrl: "https://www.mclarensanfrancisco.com/used-vehicles/",
    additionalUrls: ["https://www.mclarensanfrancisco.com/new-vehicles/"],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "McLaren Dallas",
    brand: "McLaren",
    city: "Dallas",
    state: "TX",
    inventoryUrl: "https://www.mclarendallas.com/used-vehicles/",
    additionalUrls: ["https://www.mclarendallas.com/new-vehicles/"],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "McLaren Houston",
    brand: "McLaren",
    city: "Houston",
    state: "TX",
    inventoryUrl: "https://www.mclarenhouston.com/used-vehicles/",
    additionalUrls: ["https://www.mclarenhouston.com/new-vehicles/"],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "McLaren Scottsdale",
    brand: "McLaren",
    city: "Scottsdale",
    state: "AZ",
    inventoryUrl: "https://www.mclarenscottsdale.com/used-vehicles/",
    additionalUrls: ["https://www.mclarenscottsdale.com/new-vehicles/"],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "McLaren Chicago",
    brand: "McLaren",
    city: "Chicago",
    state: "IL",
    inventoryUrl: "https://www.mclarenchicago.com/used-vehicles/",
    additionalUrls: ["https://www.mclarenchicago.com/new-vehicles/"],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "McLaren Boston",
    brand: "McLaren",
    city: "Norwell",
    state: "MA",
    inventoryUrl: "https://www.mclarenboston.com/used-vehicles/",
    additionalUrls: ["https://www.mclarenboston.com/new-vehicles/"],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "McLaren Tampa Bay",
    brand: "McLaren",
    city: "Clearwater",
    state: "FL",
    inventoryUrl: "https://www.mclarentampabay.com/used-vehicles/",
    additionalUrls: ["https://www.mclarentampabay.com/new-vehicles/"],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "McLaren Miami",
    brand: "McLaren",
    city: "Miami",
    state: "FL",
    inventoryUrl: "https://www.mclarenmiami.com/used-vehicles/",
    additionalUrls: ["https://www.mclarenmiami.com/new-vehicles/"],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "McLaren North Jersey",
    brand: "McLaren",
    city: "Ramsey",
    state: "NJ",
    inventoryUrl: "https://www.mclarennorthjersey.com/used-vehicles/",
    additionalUrls: ["https://www.mclarennorthjersey.com/new-vehicles/"],
    sourceType: "DEALER",
    active: true,
  },
  {
    name: "McLaren Denver",
    brand: "McLaren",
    city: "Highlands Ranch",
    state: "CO",
    inventoryUrl: "https://www.mclarendenver.com/used-vehicles/",
    additionalUrls: ["https://www.mclarendenver.com/new-vehicles/"],
    sourceType: "DEALER",
    active: true,
  },
];

// ─── Combined registry ─────────────────────────────────────────────────────

/** All active authorized dealers across supported brands */
export const ALL_AUTHORIZED_DEALERS: DealerSource[] = [
  ...FERRARI_DEALERS,
  ...LAMBORGHINI_DEALERS,
  ...MCLAREN_DEALERS,
].filter((d) => d.active);

/** Active dealers for a specific brand */
export function getDealersByBrand(brand: DealerBrand): DealerSource[] {
  return ALL_AUTHORIZED_DEALERS.filter((d) => d.brand === brand);
}
