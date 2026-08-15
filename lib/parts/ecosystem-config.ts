export const PART_BRAND_TYPES = [
  "OEM",
  "FACTORY_PERFORMANCE",
  "PREMIUM_PERFORMANCE",
  "AFTERMARKET",
  "VALUE_REPLACEMENT",
  "GENERIC",
  "TUNER",
  "TIRE",
  "WHEEL",
  "SERVICE_PART",
  "OTHER",
] as const;

export const PREFERRED_BRAND_RELATIONSHIPS = [
  "FACTORY",
  "FACTORY_PERFORMANCE",
  "OEM_APPROVED",
  "PERFORMANCE_PREFERRED",
  "AFTERMARKET",
  "SPECIALIST",
] as const;

export const PARTNER_AFFILIATE_STATUSES = [
  "NOT_CONTACTED",
  "OUTREACH",
  "PENDING",
  "APPROVED",
  "ACTIVE",
  "PAUSED",
  "REJECTED",
] as const;

export const PART_OFFER_PROVIDER_TYPES = [
  "EBAY",
  "SCUDERIA",
  "DIRECT_MANUFACTURER",
  "DIRECT_AFFILIATE",
  "AUTHORIZED_RETAILER",
  "OTHER_MARKETPLACE",
] as const;

export type PartBrandType = typeof PART_BRAND_TYPES[number];
export type PreferredBrandRelationship = typeof PREFERRED_BRAND_RELATIONSHIPS[number];
export type PartnerAffiliateStatus = typeof PARTNER_AFFILIATE_STATUSES[number];
export type PartOfferProviderType = typeof PART_OFFER_PROVIDER_TYPES[number];

export type EcosystemBrandFixture = {
  name: string;
  slug: string;
  brandType: PartBrandType;
  relationshipType: PreferredBrandRelationship;
  priority: number;
  categorySlugs?: string[];
  componentSlugs?: string[];
  providerCode?: string;
  affiliateStatus?: PartnerAffiliateStatus;
  affiliateEnabled?: boolean;
  officialCatalogUrl?: string;
};

export type ManufacturerEcosystemFixture = {
  makeSlug: string;
  productionEnabled: boolean;
  brands: EcosystemBrandFixture[];
};

export const MANUFACTURER_ECOSYSTEM_FIXTURES: ManufacturerEcosystemFixture[] = [
  {
    makeSlug: "ferrari",
    productionEnabled: true,
    brands: [
      { name: "Ferrari", slug: "ferrari", brandType: "OEM", relationshipType: "FACTORY", priority: 1, providerCode: "SCUDERIA", affiliateStatus: "PENDING", officialCatalogUrl: "https://www.scuderiacarparts.com/part-finder/ferrari" },
      { name: "Novitec", slug: "novitec", brandType: "AFTERMARKET", relationshipType: "PERFORMANCE_PREFERRED", priority: 20, categorySlugs: ["air-induction", "exhaust-emissions", "ecu-electronics", "aerodynamics", "body-exterior", "performance-packages"] },
      { name: "Capristo", slug: "capristo", brandType: "AFTERMARKET", relationshipType: "PERFORMANCE_PREFERRED", priority: 20, categorySlugs: ["exhaust-emissions", "performance-packages"] },
      { name: "Akrapovic", slug: "akrapovic", brandType: "AFTERMARKET", relationshipType: "PERFORMANCE_PREFERRED", priority: 20, categorySlugs: ["exhaust-emissions"] },
      { name: "Brembo", slug: "brembo", brandType: "AFTERMARKET", relationshipType: "OEM_APPROVED", priority: 20, categorySlugs: ["brakes"] },
      { name: "Michelin", slug: "michelin", brandType: "TIRE", relationshipType: "OEM_APPROVED", priority: 20, categorySlugs: ["wheels-tires"] },
      { name: "Pirelli", slug: "pirelli", brandType: "TIRE", relationshipType: "OEM_APPROVED", priority: 20, categorySlugs: ["wheels-tires"] },
    ],
  },
  {
    makeSlug: "lamborghini",
    productionEnabled: false,
    brands: [
      { name: "Lamborghini Accessori Originali", slug: "lamborghini-accessori-originali", brandType: "OEM", relationshipType: "FACTORY", priority: 1 },
      { name: "Novitec", slug: "novitec", brandType: "AFTERMARKET", relationshipType: "PERFORMANCE_PREFERRED", priority: 20, categorySlugs: ["exhaust-emissions"] },
      { name: "Akrapovic", slug: "akrapovic", brandType: "AFTERMARKET", relationshipType: "PERFORMANCE_PREFERRED", priority: 20, categorySlugs: ["exhaust-emissions"] },
      { name: "Capristo", slug: "capristo", brandType: "AFTERMARKET", relationshipType: "PERFORMANCE_PREFERRED", priority: 20, categorySlugs: ["exhaust-emissions"] },
      { name: "Brembo", slug: "brembo", brandType: "AFTERMARKET", relationshipType: "OEM_APPROVED", priority: 20, categorySlugs: ["brakes"] },
      { name: "Pirelli", slug: "pirelli", brandType: "TIRE", relationshipType: "OEM_APPROVED", priority: 20, categorySlugs: ["wheels-tires"] },
    ],
  },
  {
    makeSlug: "mclaren",
    productionEnabled: false,
    brands: [
      { name: "McLaren Genuine", slug: "mclaren-genuine", brandType: "OEM", relationshipType: "FACTORY", priority: 1 },
      { name: "MSO", slug: "mso", brandType: "FACTORY_PERFORMANCE", relationshipType: "FACTORY_PERFORMANCE", priority: 5, categorySlugs: ["aerodynamics", "body-exterior"] },
      { name: "Akrapovic", slug: "akrapovic", brandType: "AFTERMARKET", relationshipType: "PERFORMANCE_PREFERRED", priority: 20, categorySlugs: ["exhaust-emissions"] },
      { name: "Novitec", slug: "novitec", brandType: "AFTERMARKET", relationshipType: "PERFORMANCE_PREFERRED", priority: 20, categorySlugs: ["exhaust-emissions", "aerodynamics"] },
    ],
  },
  {
    makeSlug: "nissan",
    productionEnabled: false,
    brands: [
      { name: "NISMO", slug: "nismo", brandType: "FACTORY_PERFORMANCE", relationshipType: "FACTORY_PERFORMANCE", priority: 5 },
      { name: "Injen", slug: "injen", brandType: "TUNER", relationshipType: "PERFORMANCE_PREFERRED", priority: 20, categorySlugs: ["air-induction"] },
      { name: "AEM", slug: "aem", brandType: "TUNER", relationshipType: "PERFORMANCE_PREFERRED", priority: 20, categorySlugs: ["air-induction", "ecu-electronics", "fuel-system"] },
    ],
  },
];

export function getManufacturerEcosystemFixture(makeSlug: string) {
  return MANUFACTURER_ECOSYSTEM_FIXTURES.find((fixture) => fixture.makeSlug === makeSlug) ?? null;
}

export function getFixturePreferredBrands(makeSlug: string, categorySlug: string, componentSlug?: string | null) {
  const fixture = getManufacturerEcosystemFixture(makeSlug);
  if (!fixture) return [];
  return fixture.brands
    .filter((brand) => {
      if (brand.componentSlugs?.length) return Boolean(componentSlug && brand.componentSlugs.includes(componentSlug));
      return !brand.categorySlugs?.length || brand.categorySlugs.includes(categorySlug);
    })
    .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name));
}

export function buildPreferredBrandScopeKey(input: {
  makeSlug: string;
  brandSlug: string;
  categorySlug?: string | null;
  componentSlug?: string | null;
}) {
  return [input.makeSlug, input.brandSlug, input.categorySlug || "*", input.componentSlug || "*"].join(":");
}
