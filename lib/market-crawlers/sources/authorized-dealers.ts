/**
 * lib/market-crawlers/sources/authorized-dealers.ts
 *
 * Crawler factory for authorized supported-make dealerships.
 *
 * Reads the dealer registry and creates one PublicPageSource per active dealer.
 * No scraping logic lives here — all extraction is handled by PublicPageSource.
 *
 * Adding a new dealer: edit dealer-registry.ts only.
 */

import { ALL_AUTHORIZED_DEALERS, type DealerSource } from "../dealer-registry";
import { PublicPageSource } from "./public-page-source";
import { OfficialPreOwnedCrawler } from "./official-preowned";
import type { PublicInventorySource } from "../types";
import type { SupportedMake } from "@/lib/supported-makes";
import { prisma } from "@/lib/prisma";
import { SUPPORTED_MAKES } from "@/lib/supported-makes";

/**
 * Pattern used by detail-link discovery.
 * Matches common inventory/vehicle detail URL shapes across dealership platforms.
 */
const DEALER_DETAIL_LINK_PATTERNS: RegExp[] = [
  /ferrari/i,
  /lamborghini/i,
  /mclaren|mcclaren/i,
  /\/inventory\/.+/i,
  /\/vehicles?\/.+/i,
  /\/vehicle-details\/.+/i,
  /\/pre-owned\/.+/i,
  /\/used\/.+/i,
  /\/new\/.+/i,
  /\/certified\/.+/i,
  /for-sale.*\.(?:htm|html)$/i,
  /\/listing\/.+/i,
  /\/detail\/.+/i,
  /\/car\/.+/i,
];

function dealerDetailPageLimit() {
  const configured = Number(process.env.DEALER_CRAWLER_MAX_DETAIL_PAGES);
  return Number.isFinite(configured) && configured > 0 ? Math.round(configured) : 35;
}

function createSourceForDealer(dealer: DealerSource): PublicInventorySource {
  const urls = [
    dealer.inventoryUrl,
    ...(dealer.additionalUrls ?? []),
  ];

  return new PublicPageSource({
    sourceName: dealer.name,
    sourceType: dealer.sourceType,
    urls,
    discoverDetailLinks: true,
    detailLinkPatterns: DEALER_DETAIL_LINK_PATTERNS,
    maxDetailPages: dealerDetailPageLimit(),
  });
}

type DirectoryDealerSource = {
  name: string;
  brand: SupportedMake;
  city: string | null;
  state: string | null;
  website: string;
};

function createSourceForDirectoryDealer(dealer: DirectoryDealerSource): PublicInventorySource {
  return new PublicPageSource({
    sourceName: dealer.name,
    sourceType: "DEALER",
    urls: buildDealerInventoryUrls(dealer),
    discoverDetailLinks: true,
    detailLinkPatterns: DEALER_DETAIL_LINK_PATTERNS,
    maxDetailPages: dealerDetailPageLimit(),
  });
}

export async function createAuthorizedDealerSourcesFromDirectory(): Promise<PublicInventorySource[]> {
  const contacts = await prisma.partnerContact.findMany({
    where: {
      active: true,
      type: "DEALER",
      website: { not: null },
      makeSpecialization: { in: [...SUPPORTED_MAKES] },
      NOT: [
        { website: { contains: ".example.", mode: "insensitive" } },
        { website: { contains: "example.org", mode: "insensitive" } },
        { website: { contains: "example.com", mode: "insensitive" } },
        { name: { contains: "Sprint", mode: "insensitive" } },
        { name: { contains: "Test", mode: "insensitive" } },
        { name: { contains: "Transaction Center", mode: "insensitive" } },
        { name: { contains: "Financial Settlement", mode: "insensitive" } },
        { name: { contains: "Admin Ops", mode: "insensitive" } },
      ],
    },
    select: {
      name: true,
      website: true,
      city: true,
      state: true,
      makeSpecialization: true,
      updatedAt: true,
    },
    orderBy: [{ makeSpecialization: "asc" }, { state: "asc" }, { city: "asc" }, { name: "asc" }],
  });

  const deduped = new Map<string, DirectoryDealerSource & { score: number }>();
  for (const contact of contacts) {
    const brand = normalizeDirectoryMake(contact.makeSpecialization);
    const website = contact.website ? normalizeDealerWebsite(contact.website) : null;
    if (!brand || !website) continue;

    const domain = domainFromUrl(website);
    const key = `${brand}:${shouldDedupeDirectoryDealerByDomain(brand, domain) ? domain : `${normalizeName(contact.name)}:${normalizeName(contact.city || "")}:${contact.state || ""}`}`;
    const score = scoreDirectoryDealer(contact);
    const existing = deduped.get(key);
    if (!existing || score > existing.score) {
      deduped.set(key, {
        name: contact.name,
        brand,
        city: contact.city,
        state: contact.state,
        website,
        score,
      });
    }
  }

  const directorySources = Array.from(deduped.values()).map(createSourceForDirectoryDealer);
  const mclarenPreownedSources = await createMcLarenOfficialPreownedSources();
  return [new OfficialPreOwnedCrawler(), ...directorySources, ...mclarenPreownedSources];
}

/**
 * Returns one PublicPageSource per active authorized dealer (both brands).
 * Used by crawl-dealer-inventory.ts.
 */
export function createAuthorizedDealerSources(): PublicInventorySource[] {
  return ALL_AUTHORIZED_DEALERS.map(createSourceForDealer);
}

/**
 * Returns sources for a specific brand only.
 */
export function createAuthorizedDealerSourcesByBrand(
  brand: SupportedMake
): PublicInventorySource[] {
  return ALL_AUTHORIZED_DEALERS
    .filter((d) => d.brand === brand)
    .map(createSourceForDealer);
}

async function createMcLarenOfficialPreownedSources(): Promise<PublicInventorySource[]> {
  try {
    const response = await fetch("https://cms.production.aws.mclaren.com/api/retailers?country=USA", {
      headers: {
        "accept": "application/json",
        "origin": "https://www.mclaren.com",
        "referer": "https://www.mclaren.com/cars/us_en/retailers",
        "user-agent": "Mozilla/5.0 (compatible; SUPERCARDASHInventoryCrawler/0.1; +https://supercardash.vercel.app)",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return [];
    const data = await response.json() as {
      retailers?: Array<{
        name?: string;
        preowned_link?: string | null;
      }>;
    };

    return (data.retailers || [])
      .filter((retailer) => retailer.preowned_link)
      .map((retailer) => new PublicPageSource({
        sourceName: normalizeMcLarenSourceName(retailer.name),
        sourceType: "DEALER",
        urls: [retailer.preowned_link!],
        discoverDetailLinks: true,
        detailLinkPatterns: DEALER_DETAIL_LINK_PATTERNS,
        maxDetailPages: dealerDetailPageLimit(),
      }));
  } catch {
    return [];
  }
}

function buildDealerInventoryUrls(dealer: DirectoryDealerSource) {
  const base = dealer.website.replace(/\/$/, "");
  const host = domainFromUrl(base) || "";
  const registryHint = findRegistryHint(dealer);
  const hintedUrls = registryHint ? [registryHint.inventoryUrl, ...(registryHint.additionalUrls ?? [])] : [];

  if (/ferraridealers\.com$/i.test(host)) {
    return uniqueUrls([...hintedUrls, `${base}/r/used-ferrari/f`, `${base}/ferrari-certified-pre-owned`]);
  }

  if (dealer.brand === "Ferrari") {
    return uniqueUrls([
      ...hintedUrls,
      `${base}/pre-owned-inventory/`,
      `${base}/pre-owned/`,
      `${base}/used-ferrari/`,
      `${base}/certified-pre-owned/`,
      `${base}/certified-pre-owned-ferrari/`,
      `${base}/searchall.aspx`,
    ]);
  }

  if (dealer.brand === "Lamborghini") {
    return uniqueUrls([
      ...hintedUrls,
      `${base}/pre-owned/`,
      `${base}/pre-owned-lamborghini/`,
      `${base}/used-lamborghini/`,
      `${base}/certified-pre-owned/`,
      `${base}/certified-pre-owned-lamborghini/`,
      `${base}/cars-for-sale-${slugify(dealer.city || dealer.name)}-${String(dealer.state || "").toLowerCase()}`,
    ]);
  }

  return uniqueUrls([
    ...hintedUrls,
    `${base}/used-vehicles/`,
    `${base}/pre-owned-vehicles/`,
    `${base}/new-vehicles/`,
    `${base}/used-inventory/index.htm`,
    `${base}/new-inventory/index.htm`,
  ]);
}

function findRegistryHint(dealer: DirectoryDealerSource) {
  const dealerName = normalizeName(dealer.name);
  const dealerDomain = domainFromUrl(dealer.website);
  return ALL_AUTHORIZED_DEALERS.find((candidate) => {
    if (candidate.brand !== dealer.brand) return false;
    const candidateName = normalizeName(candidate.name);
    const candidateDomain = domainFromUrl(candidate.inventoryUrl);
    return (
      dealerName === candidateName ||
      (candidateDomain && dealerDomain && candidateDomain === dealerDomain) ||
      (candidate.city.toLowerCase() === String(dealer.city || "").toLowerCase() && candidate.state === dealer.state)
    );
  });
}

function uniqueUrls(urls: string[]) {
  return Array.from(new Set(urls));
}

function normalizeDirectoryMake(value: string | null): SupportedMake | null {
  const text = String(value || "").toLowerCase();
  return SUPPORTED_MAKES.find((make) => make.toLowerCase() === text) || null;
}

function normalizeDealerWebsite(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (/ferraridealers\.com$/i.test(host)) {
      const localeMatch = url.pathname.match(/^\/[a-z]{2}-[A-Z]{2}\b/);
      return `${url.origin}${localeMatch?.[0] || "/en-US"}`;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isManufacturerLocatorDomain(domain: string) {
  return /(^|\.)lamborghini\.com$/i.test(domain) ||
    /(^|\.)preowned\.lamborghini\.com$/i.test(domain) ||
    /(^|\.)ferraridealers\.com$/i.test(domain) ||
    /(^|\.)preowned\.ferrari\.com$/i.test(domain) ||
    /(^|\.)mclaren\.com$/i.test(domain) ||
    /(^|\.)preowned\.mclaren\.com$/i.test(domain);
}

function shouldDedupeDirectoryDealerByDomain(brand: SupportedMake, domain: string | null) {
  if (!domain || isManufacturerLocatorDomain(domain)) return false;
  if (isGenericOrRedirectDomain(domain)) return false;
  if (brand === "Ferrari" && !/ferrari/i.test(domain)) return false;
  if (brand === "Lamborghini" && !/lamborghini/i.test(domain)) return false;
  if (brand === "McLaren" && !/mclaren/i.test(domain)) return false;
  return true;
}

function isGenericOrRedirectDomain(domain: string) {
  return /(^|\.)google\.com$/i.test(domain) || /(^|\.)goo\.gl$/i.test(domain);
}

function normalizeMcLarenSourceName(value?: string | null) {
  const name = String(value || "").trim() || "Dealer";
  return /^mclaren\s+/i.test(name) ? name : `McLaren ${name}`;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function scoreDirectoryDealer(contact: { email?: string | null; city?: string | null; state?: string | null; updatedAt?: Date }) {
  let score = 0;
  if (contact.email) score += 20;
  if (contact.city) score += 5;
  if (contact.state) score += 5;
  if (contact.updatedAt) score += Math.min(5, Math.floor(contact.updatedAt.getTime() / 1_000_000_000_000));
  return score;
}
