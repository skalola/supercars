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

type Brand = "Ferrari" | "Lamborghini" | string;
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
};

type ZipDetails = {
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
};

const USER_AGENT = "Mozilla/5.0 (compatible; SUPERCARDASHDirectoryCrawler/0.1; +https://supercardash.vercel.app)";

type BrandCrawler = () => Promise<CrawledContact[]>;

const CRAWLERS: Record<string, BrandCrawler> = {
  Ferrari: crawlFerrariDealers,
  Lamborghini: crawlLamborghiniDealers,
  // Add new brands here in the future (e.g. McLaren: crawlMcLarenDealers)
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
    await upsertPartnerContact({
      name: contact.name,
      type: contact.type,
      email: contact.email || null,
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
      confidence: contact.email ? "PUBLIC_SOURCE" : "UNRESOLVED_EMAIL",
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
    const dealerName = cleanString(record.dealerName) || "Lamborghini Dealer";
    const city = cleanString(record.siteData?.city?.value?.[0]);
    const stateZip = parseLamborghiniStateZip(record.addressLoc || record.address || "", contactsMap.get("zipCode"));
    const officialProfileUrl = `https://www.lamborghini.com${record.url || "/en-en/dealerships"}`;

    return {
      brand: "Lamborghini",
      type,
      name: type === "SERVICE_SHOP" ? `${dealerName} Service` : dealerName,
      email: cleanEmail(contactsMap.get("email")),
      phone: cleanPhone(contactsMap.get("phone")),
      website: officialProfileUrl,
      sourceDomain: domainFromUrl(officialProfileUrl),
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
