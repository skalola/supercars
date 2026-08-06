/**
 * scripts/crawl-dealer-directory.ts
 *
 * Crawls public official dealer locator pages and
 * upserts national Dealer + Service Shop contacts into PartnerContact.
 *
 * Usage:
 *   npx ts-node scripts/crawl-dealer-directory.ts --make=Ferrari
 *   npx ts-node scripts/crawl-dealer-directory.ts --make=all
 */

import https from "node:https";
import { prisma } from "../lib/prisma";
import { upsertPartnerContact } from "../lib/fulfillment/partner-registry";
import { buildSalesEmailForWebsite } from "../lib/directory/contact-domain-policy";
import { MCLAREN_DEALERS } from "../lib/market-crawlers/dealer-registry";

type Brand = "Ferrari" | "Lamborghini" | "McLaren" | string;
type PartnerType = "DEALER" | "SERVICE_SHOP";

type CrawledContact = {
  brand: Brand;
  type: PartnerType;
  name: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  sourceDomain?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  marketSourceId?: string | null;
};

type ZipDetails = {
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
};

type McLarenDepartment = {
  available?: number | boolean | null;
  phone?: string | null;
  effective_address?: string | null;
  effective_latitude?: string | number | null;
  effective_longitude?: string | number | null;
};

const USER_AGENT = "Mozilla/5.0 (compatible; SUPERCARDASHDirectoryCrawler/0.1; +https://supercardash.vercel.app)";

type BrandCrawler = () => Promise<CrawledContact[]>;

const CRAWLERS: Record<string, BrandCrawler> = {
  Ferrari: crawlFerrariDealers,
  Lamborghini: crawlLamborghiniDealers,
  McLaren: crawlMcLarenDealers,
};

async function main() {
  console.log("==================================================");
  console.log("  SUPERCAR DASH Dealer Directory Crawl");
  console.log("==================================================\n");

  const args = process.argv.slice(2);
  const makeArg = args.find(a => a.startsWith("--make="))?.split("=")[1];

  if (!makeArg) {
    console.error("❌ Missing required argument: --make");
    console.error("Usage: npx ts-node scripts/crawl-dealer-directory.ts --make=Ferrari (or --make=all)");
    process.exit(1);
  }

  let contactsToProcess: CrawledContact[] = [];

  if (makeArg.toLowerCase() === "all") {
    console.log("Crawling ALL configured brands...");
    for (const [brand, crawler] of Object.entries(CRAWLERS)) {
      const brandContacts = await crawler();
      contactsToProcess.push(...brandContacts);
    }
  } else {
    // Find case-insensitive match
    const brandKey = Object.keys(CRAWLERS).find(k => k.toLowerCase() === makeArg.toLowerCase());
    
    if (!brandKey) {
      console.error(`❌ Unsupported make: ${makeArg}`);
      console.error(`Currently supported makes: ${Object.keys(CRAWLERS).join(", ")}`);
      console.error(`To add a new make, implement its crawler function and add it to the CRAWLERS map.`);
      process.exit(1);
    }

    console.log(`Crawling ${brandKey} official dealer locator...`);
    contactsToProcess = await CRAWLERS[brandKey]();
  }

  const contacts = dedupeContacts(contactsToProcess);
  let upserted = 0;

  console.log(`\nUpserting ${contacts.length} deduped contacts...`);
  for (const contact of contacts) {
    const fallbackEmail =
      contact.type === "DEALER" ? buildSalesEmailForWebsite(contact.website) : null;
    const email = contact.email || fallbackEmail;

    await upsertPartnerContact({
      name: contact.name,
      type: contact.type,
      email,
      phone: contact.phone || null,
      website: contact.website || null,
      sourceDomain: contact.sourceDomain || domainFromUrl(contact.website),
      makeSpecialization: contact.brand,
      location: formatLocation(contact),
      streetAddress: contact.streetAddress || null,
      city: contact.city || null,
      state: contact.state || null,
      postalCode: contact.postalCode || null,
      country: contact.country || "US",
      latitude: contact.latitude ?? null,
      longitude: contact.longitude ?? null,
      confidence: email ? "PUBLIC_SOURCE" : "UNRESOLVED_EMAIL",
      contactSource: "PUBLIC_WEBSITE",
      active: true,
    });
    upserted++;
  }

  console.log("\n==================================================");
  console.log(`  Deduped upserts:        ${upserted}`);
  console.log("==================================================");
}

async function crawlFerrariDealers(): Promise<CrawledContact[]> {
  console.log("Crawling Ferrari official dealer locator...");
  const html = await fetchText("https://www.ferraridealers.com/en-US");
  const nextData = extractNextData(html);
  const locatorRecords = findObjects(nextData).filter((obj) =>
    obj &&
    obj.countryCode === "US" &&
    typeof obj.name === "string" &&
    typeof obj.city === "string" &&
    typeof obj.urlsite === "string" &&
    obj.urlsite
  );

  const contacts: CrawledContact[] = [];
  const seenUrls = new Set<string>();

  for (const record of locatorRecords) {
    const baseUrl = normalizeFerrariBaseUrl(String(record.urlsite));
    if (!baseUrl || seenUrls.has(baseUrl)) continue;
    seenUrls.add(baseUrl);

    const details = await fetchFerrariDetails(baseUrl);
    if (details.length > 0) {
      contacts.push(...details);
      continue;
    }

    const city = cleanCity(String(record.city));
    const state = cleanString(record.stateOrProvince);
    contacts.push({
      brand: "Ferrari",
      type: "DEALER",
      name: cleanString(record.name) || "Ferrari Dealer",
      website: baseUrl,
      sourceDomain: domainFromUrl(baseUrl),
      city,
      state,
      country: "US",
    });
    contacts.push({
      brand: "Ferrari",
      type: "SERVICE_SHOP",
      name: `${cleanString(record.name) || "Ferrari Dealer"} Service`,
      website: baseUrl,
      sourceDomain: domainFromUrl(baseUrl),
      city,
      state,
      country: "US",
    });
  }

  console.log(`  Found ${contacts.length} Ferrari dealer/service contacts.`);
  return contacts;
}

async function fetchFerrariDetails(baseUrl: string): Promise<CrawledContact[]> {
  const candidates = [
    `${baseUrl.replace(/\/$/, "")}/contact-us`,
    `${baseUrl.replace(/\/$/, "")}/contacts`,
    `${baseUrl.replace(/\/$/, "")}/about-us`,
  ];

  for (const url of candidates) {
    try {
      const html = await fetchText(url);
      const nextData = extractNextData(html);
      const records = findObjects(nextData).filter((obj) =>
        obj &&
        typeof obj.name === "string" &&
        typeof obj.type === "string" &&
        (obj.type === "Showroom" || obj.type === "Service") &&
        (obj.country === "US" || obj.countryCode === "US")
      );

      if (records.length === 0) continue;

      const contacts = records.map((record): CrawledContact => {
        const type = record.type === "Service" ? "SERVICE_SHOP" : "DEALER";
        const name = cleanString(record.localName || record.name) || "Ferrari Dealer";
        const zip = cleanString(record.localZipCode || record.zipCode);

        return {
          brand: "Ferrari",
          type,
          name: type === "SERVICE_SHOP" && !/\bservice\b/i.test(name) ? `${name} Service` : name,
          email: cleanEmail(record.email),
          phone: cleanPhone(record.tel),
          website: cleanString(record.website) || baseUrl,
          sourceDomain: domainFromUrl(cleanString(record.website) || baseUrl),
          streetAddress: cleanString(record.localSteetAddress1 || record.steetAddress1),
          city: cleanCity(cleanString(record.localCity || record.city)),
          state: cleanString(record.localStateCountry || record.stateCountry),
          postalCode: zip,
          country: "US",
          latitude: null,
          longitude: null,
        };
      });

      return await hydrateMissingCoordinates(contacts);
    } catch {
      // Try the next public detail URL candidate.
    }
  }

  return [];
}

async function crawlLamborghiniDealers(): Promise<CrawledContact[]> {
  console.log("Crawling Lamborghini official dealer locator...");
  const html = await fetchText("https://www.lamborghini.com/en-en/dealerships");
  const nextData = extractNextData(html);
  const records = findObjects(nextData).filter((obj) =>
    obj &&
    obj.country?.code === "US" &&
    typeof obj.dealerName === "string" &&
    typeof obj.siteCategory?.code === "string" &&
    (obj.siteCategory.code === "SALES" || obj.siteCategory.code === "SERVICE")
  );

  const contacts = records.map((record): CrawledContact => {
    const contactsMap = new Map<string, string>();
    for (const item of Array.isArray(record.siteData?.contacts) ? record.siteData.contacts : []) {
      if (typeof item?.key === "string" && Array.isArray(item.value) && item.value[0]) {
        contactsMap.set(item.key, String(item.value[0]));
      }
    }

    const type: PartnerType = record.siteCategory.code === "SERVICE" ? "SERVICE_SHOP" : "DEALER";
    const officialProfileUrl = `https://www.lamborghini.com${record.url || "/en-en/dealerships"}`;
    const dealerName = normalizeLamborghiniDealerName(cleanString(record.dealerName), record.url) || "Lamborghini Dealer";
    const city = cleanString(record.siteData?.city?.value?.[0]) || inferCityFromDealerName(dealerName);
    const stateZip = parseLamborghiniStateZip(record.addressLoc || record.address || "", contactsMap.get("zipCode"));
    const dealerWebsite =
      cleanString(contactsMap.get("organizationWebSite")) ||
      inferLamborghiniDealerWebsite(dealerName) ||
      websiteFromEmail(contactsMap.get("email")) ||
      officialProfileUrl;
    const sourceDomain = domainFromUrl(dealerWebsite);
    const officialEmail = cleanEmail(contactsMap.get("email"));
    const fallbackEmail = buildSalesEmailForWebsite(dealerWebsite);
    const email = emailBelongsToDomain(officialEmail, sourceDomain) ? officialEmail : fallbackEmail || officialEmail;

    return {
      brand: "Lamborghini",
      type,
      name: type === "SERVICE_SHOP" ? `${dealerName} Service` : dealerName,
      email,
      phone: cleanPhone(contactsMap.get("phone")),
      website: dealerWebsite,
      sourceDomain: sourceDomain && !isManufacturerLocatorDomain(sourceDomain) ? sourceDomain : null,
      streetAddress: cleanString(record.addressInt || record.address),
      city,
      state: stateZip.state,
      postalCode: stateZip.postalCode,
      country: "US",
      latitude: numberOrNull(record.latitude),
      longitude: numberOrNull(record.longitude),
    };
  });

  const hydratedContacts = await hydrateMissingCoordinates(contacts);
  console.log(`  Found ${hydratedContacts.length} Lamborghini dealer/service contacts.`);
  return hydratedContacts;
}

async function crawlMcLarenDealers(): Promise<CrawledContact[]> {
  console.log("Crawling McLaren official retailer locator...");
  try {
    const data = await fetchJson<{
      retailers?: Array<{
        id?: number | string;
        name?: string;
        address?: string;
        url?: string;
        retailer_page_link?: string;
        preowned_link?: string | null;
        retailer_id?: string | null;
        latitude?: string | number | null;
        longitude?: string | number | null;
        departments?: {
          sales?: McLarenDepartment | null;
          service?: McLarenDepartment | null;
        };
      }>;
    }>("https://cms.production.aws.mclaren.com/api/retailers?country=USA", {
      Origin: "https://www.mclaren.com",
      Referer: "https://www.mclaren.com/cars/us_en/retailers",
    });

    const contacts = (data.retailers || []).flatMap((retailer): CrawledContact[] => {
      const dealerName = normalizeMcLarenDealerName(retailer.name);
      const parsedAddress = parseUsAddress(retailer.address || "");
      const website = inferMcLarenDealerWebsite(dealerName) || cleanString(retailer.retailer_page_link || retailer.url);
      const sourceDomain = domainFromUrl(website);
      const email = buildSalesEmailForWebsite(website);
      const latitude = numberOrNull(retailer.departments?.sales?.effective_latitude) ?? numberOrNull(retailer.latitude);
      const longitude = numberOrNull(retailer.departments?.sales?.effective_longitude) ?? numberOrNull(retailer.longitude);
      const baseContact = {
        brand: "McLaren",
        email,
        website,
        sourceDomain: sourceDomain && !isManufacturerLocatorDomain(sourceDomain) ? sourceDomain : null,
        streetAddress: cleanString(retailer.departments?.sales?.effective_address) || cleanString(retailer.address),
        city: parsedAddress.city,
        state: parsedAddress.state,
        postalCode: parsedAddress.postalCode,
        country: "US",
        latitude,
        longitude,
      };
      const sourceId = cleanString(retailer.retailer_id) || cleanString(retailer.id);
      const output: CrawledContact[] = [];

      if (retailer.departments?.sales?.available) {
        output.push({
          ...baseContact,
          type: "DEALER",
          name: dealerName,
          phone: cleanPhone(retailer.departments.sales.phone),
          marketSourceId: sourceId ? `mclaren-retailer:${sourceId}:sales` : null,
        });
      }

      if (retailer.departments?.service?.available) {
        output.push({
          ...baseContact,
          type: "SERVICE_SHOP",
          name: `${dealerName} Service`,
          phone: cleanPhone(retailer.departments.service.phone),
          streetAddress: cleanString(retailer.departments.service.effective_address) || baseContact.streetAddress,
          latitude: numberOrNull(retailer.departments.service.effective_latitude) ?? baseContact.latitude,
          longitude: numberOrNull(retailer.departments.service.effective_longitude) ?? baseContact.longitude,
          marketSourceId: sourceId ? `mclaren-retailer:${sourceId}:service` : null,
        });
      }

      return output;
    });

    const hydratedContacts = await hydrateMissingCoordinates(contacts);
    console.log(`  Found ${hydratedContacts.length} McLaren dealer/service contacts from official CMS.`);
    return hydratedContacts;
  } catch (error) {
    console.warn("  McLaren official CMS unavailable; falling back to local registry.", error instanceof Error ? error.message : error);
  }

  console.log("Crawling McLaren official retailer locator fallback registry...");
  const contacts = MCLAREN_DEALERS.flatMap((dealer): CrawledContact[] => {
    const baseUrl = dealer.inventoryUrl ? originFromUrl(dealer.inventoryUrl) : null;
    const email = buildSalesEmailForWebsite(baseUrl);
    const common = {
      brand: "McLaren",
      email,
      website: baseUrl,
      sourceDomain: domainFromUrl(baseUrl),
      city: dealer.city,
      state: dealer.state,
      country: "US",
    };

    return [
      {
        ...common,
        type: "DEALER",
        name: dealer.name,
      },
      {
        ...common,
        type: "SERVICE_SHOP",
        name: `${dealer.name} Service`,
      },
    ];
  });

  console.log(`  Found ${contacts.length} McLaren dealer/service contacts.`);
  return contacts;
}

async function hydrateMissingCoordinates(contacts: CrawledContact[]) {
  return Promise.all(contacts.map(async (contact) => {
    const hasCoordinates = contact.latitude !== null && contact.latitude !== undefined && contact.longitude !== null && contact.longitude !== undefined;
    const hasLocationParts = Boolean(contact.city && contact.state);

    if (hasCoordinates && hasLocationParts) {
      return contact;
    }

    if (!contact.postalCode) return contact;

    const coordinates = await geocodeZip(contact.postalCode);
    return {
      ...contact,
      latitude: contact.latitude ?? coordinates?.latitude ?? null,
      longitude: contact.longitude ?? coordinates?.longitude ?? null,
      city: contact.city || coordinates?.city || null,
      state: contact.state || coordinates?.state || null,
    };
  }));
}

const zipCache = new Map<string, ZipDetails | null>();

async function geocodeZip(zip: string) {
  const cleanZip = cleanPostalCode(zip);
  if (!cleanZip) return null;
  if (zipCache.has(cleanZip)) return zipCache.get(cleanZip) || null;

  try {
    const response = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(cleanZip)}`, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      zipCache.set(cleanZip, null);
      return null;
    }
    const data = await response.json() as {
      places?: Array<{
        "place name"?: string;
        "state abbreviation"?: string;
        latitude?: string;
        longitude?: string;
      }>;
    };
    const place = data.places?.[0];
    const latitude = numberOrNull(place?.latitude);
    const longitude = numberOrNull(place?.longitude);
    const result = latitude !== null && longitude !== null
      ? {
          city: cleanString(place?.["place name"]),
          state: cleanString(place?.["state abbreviation"]),
          latitude,
          longitude,
        }
      : null;
    zipCache.set(cleanZip, result);
    return result;
  } catch {
    zipCache.set(cleanZip, null);
    return null;
  }
}

function dedupeContacts(contacts: CrawledContact[]) {
  const seen = new Map<string, CrawledContact>();

  for (const contact of contacts) {
    // Rely on geospatial match if present, otherwise normalize address components
    const locKey = (contact.latitude && contact.longitude)
      ? `${contact.latitude.toFixed(4)},${contact.longitude.toFixed(4)}`
      : `${normalize(contact.streetAddress || "")}|${normalize(contact.city || "")}|${normalize(contact.state || "")}`;

    const key = [
      contact.brand,
      contact.type,
      normalizeName(contact.name),
      locKey,
    ].join("|");

    const existing = seen.get(key);
    if (!existing || scoreContact(contact) > scoreContact(existing)) {
      seen.set(key, contact);
    }
  }

  return Array.from(seen.values());
}

function scoreContact(contact: CrawledContact) {
  let score = 0;
  if (contact.email) score += 20;
  if (contact.phone) score += 10;
  if (contact.streetAddress) score += 8;
  if (contact.latitude !== null && contact.latitude !== undefined) score += 5;
  return score;
}

function extractNextData(html: string) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Missing __NEXT_DATA__ payload");
  return JSON.parse(decodeHtml(match[1]));
}

function findObjects(value: unknown, output: any[] = []): any[] {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) findObjects(item, output);
    return output;
  }

  output.push(value);
  for (const nested of Object.values(value)) {
    findObjects(nested, output);
  }
  return output;
}

async function fetchText(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    if (response.ok && !text.includes("Human Verification")) return text;
  } catch {
    // Fall back to Node HTTPS below for official dealer pages with strict cert chains.
  }

  return fetchTextInsecure(url);
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept": "application/json",
      ...headers,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function fetchTextInsecure(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { "user-agent": USER_AGENT },
      rejectUnauthorized: false,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if ((response.statusCode || 0) >= 400 || text.includes("Human Verification")) {
          reject(new Error(`Fetch failed for ${url}: ${response.statusCode}`));
          return;
        }
        resolve(text);
      });
    }).on("error", reject);
  });
}

function normalizeFerrariBaseUrl(url: string) {
  const cleaned = url.trim().replace(/\/$/, "");
  if (!cleaned) return null;
  if (/ferraridealers\.com$/i.test(new URL(cleaned).hostname)) return cleaned;
  return cleaned;
}

function parseLamborghiniStateZip(address: string, zip?: string | null) {
  const zipState = zip?.match(/\b([A-Z]{2})\s*-\s*(\d{5})\b/);
  if (zipState) return { state: zipState[1], postalCode: zipState[2] };

  const stateZip = address.match(/\b([A-Z]{2})\s*-\s*(\d{5})\b/);
  if (stateZip) return { state: stateZip[1], postalCode: stateZip[2] };

  return { state: null, postalCode: cleanPostalCode(zip) };
}

function formatLocation(contact: CrawledContact) {
  const cityState = [contact.city, contact.state].filter(Boolean).join(", ");
  return [contact.streetAddress, [cityState, contact.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
}

function cleanString(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function cleanCity(value: unknown) {
  return cleanString(value)?.replace(/\s+USA$/i, "") || null;
}

function cleanEmail(value: unknown) {
  const match = typeof value === "string" ? value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) : null;
  return match?.[0]?.toLowerCase() || null;
}

function cleanPhone(value: unknown) {
  return cleanString(value);
}

function cleanPostalCode(value: unknown) {
  if (typeof value !== "string") return null;
  return value.match(/\b\d{5}\b/)?.[0] || null;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function domainFromUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function originFromUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function websiteFromEmail(value?: string | null) {
  const email = cleanEmail(value);
  if (!email) return null;
  const domain = email.split("@")[1];
  if (!domain || isGenericEmailDomain(domain)) return null;
  return `https://www.${domain}`;
}

function inferLamborghiniDealerWebsite(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/^lamborghini\s+/i, "")
    .replace(/\bn\.?j\.?\b/g, "nj")
    .replace(/\bst\.?\b/g, "st")
    .replace(/[^a-z0-9]+/g, "");
  if (!slug) return null;
  return `https://www.lamborghini${slug}.com`;
}

function normalizeMcLarenDealerName(name?: string | null) {
  const trimmed = cleanString(name) || "Dealer";
  return /^mclaren\s+/i.test(trimmed) ? trimmed : `McLaren ${trimmed}`;
}

function inferMcLarenDealerWebsite(name: string) {
  const known = MCLAREN_DEALERS.find((dealer) => normalizeName(dealer.name) === normalizeName(name));
  const knownOrigin = known?.inventoryUrl ? originFromUrl(known.inventoryUrl) : null;
  if (knownOrigin) return knownOrigin;

  const slug = name
    .toLowerCase()
    .replace(/^mclaren\s+/i, "")
    .replace(/[^a-z0-9]+/g, "");
  if (!slug) return null;
  return `https://www.mclaren${slug}.com`;
}

function normalizeLamborghiniDealerName(name?: string | null, officialPath?: string | null) {
  const slug = typeof officialPath === "string" ? officialPath.match(/\/(lamborghini-[a-z0-9.-]+)(?:#|$|\/)/i)?.[1] : null;
  if (slug && (!name || /^lamborghini[a-z]/i.test(name))) {
    return titleCaseDealerSlug(slug);
  }
  if (!name) return null;
  if (/^lamborghini[a-z]/i.test(name)) {
    return titleCaseDealerSlug(name.replace(/^lamborghini/i, "lamborghini-"));
  }
  return name;
}

function titleCaseDealerSlug(slug: string) {
  return slug
    .replace(/^lamborghini[-\s]*/i, "")
    .replace(/\bn[-.]?j\b/gi, "nj")
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "nj") return "N.J.";
      if (lower === "st") return "St.";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ")
    .replace(/^/, "Lamborghini ");
}

function inferCityFromDealerName(name: string) {
  const city = name.replace(/^Lamborghini\s+/i, "").replace(/\s+N\.J\.$/i, "").trim();
  return city || null;
}

function parseUsAddress(address: string) {
  const cleaned = cleanString(address) || "";
  const postalCode = cleaned.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1] || null;
  const stateMatch = cleaned.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC)\b[\s,.]*(?:\d{5})?$/i);
  const fullStateMatch = cleaned.match(/\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Iowa|Idaho|Illinois|Indiana|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\s+\d{5}$/i);
  const state = stateMatch?.[1]?.toUpperCase() || stateNameToCode(fullStateMatch?.[1]) || null;
  const beforeState = stripTrailingStateAndZip(cleaned, state, fullStateMatch?.[1]);
  const city = cleanString(extractCityFromAddressPrefix(beforeState));
  return { city, state, postalCode };
}

function stripTrailingStateAndZip(address: string, state: string | null, fullState?: string | null) {
  let output = address.replace(/\s+\d{5}(?:-\d{4})?\s*$/, "").trim();
  if (state) {
    output = output.replace(new RegExp(`\\b${state}\\b[\\s,.]*$`, "i"), "").trim();
  }
  if (fullState) {
    output = output.replace(new RegExp(`\\b${escapeRegExp(fullState)}\\b[\\s,.]*$`, "i"), "").trim();
  }
  return output.replace(/[,\s]+$/, "");
}

function extractCityFromAddressPrefix(value: string) {
  const commaCity = value.split(",").map((part) => part.trim()).filter(Boolean).pop();
  const cleanedCommaCity = cleanupCityCandidate(commaCity);
  if (cleanedCommaCity) return cleanedCommaCity;

  const suffixMatch = value.match(/\b(?:Road|Rd\.?|Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Highway|Hwy|Court|Ct\.?|Pike|Place|Pl\.?|Route)\b[.,]?\s+(.+)$/i);
  if (suffixMatch?.[1]) return cleanupCityCandidate(suffixMatch[1]);

  return null;
}

function cleanupCityCandidate(value?: string | null) {
  const cleaned = cleanString(value)
    ?.replace(/^\d+\s+(?:north|south|east|west)\s+/i, "")
    .replace(/^(?:dr\.?|drive|rd\.?|road|st\.?|street|ave\.?|avenue|blvd\.?|boulevard)\s+/i, "")
    .trim();
  if (!cleaned || /^\d/.test(cleaned)) return null;
  return cleaned;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stateNameToCode(value?: string | null) {
  if (!value) return null;
  const states: Record<string, string> = {
    alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", iowa: "IA", idaho: "ID", illinois: "IL", indiana: "IN", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  };
  return states[value.toLowerCase()] || null;
}

function emailBelongsToDomain(email: string | null, domain: string | null) {
  if (!email || !domain) return false;
  return email.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
}

function isManufacturerLocatorDomain(domain: string) {
  return /(^|\.)lamborghini\.com$/i.test(domain) || /(^|\.)ferraridealers\.com$/i.test(domain) || /(^|\.)mclaren\.com$/i.test(domain);
}

function isGenericEmailDomain(domain: string) {
  return /gmail\.com|yahoo\.com|icloud\.com|outlook\.com|hotmail\.com|aol\.com/i.test(domain);
}

function normalizeName(value: string) {
  return value.toLowerCase()
    .replace(/\b(of|the|inc|llc|corp|co|dealership|auto|motors)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9@.]+/g, "");
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

main()
  .catch((error) => {
    console.error("Dealer directory crawl failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
