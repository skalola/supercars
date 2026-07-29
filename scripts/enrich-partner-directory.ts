/**
 * scripts/enrich-partner-directory.ts
 *
 * Crawls active PartnerContact websites and fills missing public contact fields:
 * city, state, postal code, street address, email, phone, and coordinates.
 *
 * This enrichment pass only patches missing data by default. It does not guess
 * email addresses and it does not create new partner records.
 *
 * Usage:
 *   npm run enrich-partner-directory
 *   npm run enrich-partner-directory -- --limit 25
 *   npm run enrich-partner-directory -- --dry-run
 *   npm run enrich-partner-directory -- --location-only
 */

import https from "node:https";
import { prisma } from "../lib/prisma";
import { isValidEmail } from "../lib/fulfillment/partner-registry";
import { ALL_AUTHORIZED_DEALERS } from "../lib/market-crawlers/dealer-registry";

type ExtractedContact = {
  sourceUrl?: string;
  email?: string | null;
  phone?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type ZipDetails = {
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
};

const USER_AGENT = "Mozilla/5.0 (compatible; SUPERCARDASHDirectoryEnricher/0.1; +https://supercardash.vercel.app)";
const CONTACT_PATHS = [
  "",
  "contact-us",
  "contact",
  "contact.htm",
  "contact-us.htm",
  "locations",
  "about-us",
  "dealership/contact.htm",
  "dealership/staff.htm",
  "service",
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const contacts = await prisma.partnerContact.findMany({
    where: {
      active: true,
      website: { not: null },
      OR: args.locationOnly
        ? [
            { city: null },
            { state: null },
            { postalCode: null },
            { streetAddress: null },
            { latitude: null },
            { longitude: null },
          ]
        : [
            { city: null },
            { state: null },
            { email: null },
            { phone: null },
            { postalCode: null },
            { streetAddress: null },
            { latitude: null },
            { longitude: null },
          ],
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    take: args.limit,
  });

  console.log("==================================================");
  console.log("  SUPERCAR DASH Partner Directory Enrichment");
  console.log("==================================================");
  console.log(`Mode: ${args.dryRun ? "dry run" : "update missing fields"}${args.locationOnly ? " (location only)" : ""}`);
  console.log(`Contacts with missing website-backed data: ${contacts.length}\n`);

  let updated = 0;
  let inspected = 0;
  let unchanged = 0;

  for (const contact of contacts) {
    inspected++;
    const trustedFallback = getTrustedLocationFallback(contact.name, contact.website);
    const canUseTrustedOnly = args.locationOnly && Boolean(trustedFallback.city && trustedFallback.state);
    const extracted = canUseTrustedOnly ? {} : await enrichFromWebsite(contact.website!, contact.name);
    const hydrated = await hydrateFromPostalCode(mergeExtracted(extracted, trustedFallback));
    const data = buildMissingFieldUpdate(contact, hydrated);

    if (Object.keys(data).length === 0) {
      unchanged++;
      console.log(`SKIP ${contact.type} | ${contact.name} | no stronger public data found`);
      continue;
    }

    updated++;
    console.log(`${args.dryRun ? "DRY " : "UPDT"} ${contact.type} | ${contact.name} | ${Object.keys(data).join(", ")} | ${hydrated.sourceUrl || contact.website}`);

    if (!args.dryRun) {
      await prisma.partnerContact.update({
        where: { id: contact.id },
        data,
      });
    }
  }

  console.log("\n==================================================");
  console.log(`  Inspected: ${inspected}`);
  console.log(`  Updated:   ${updated}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log("==================================================");
}

function parseArgs(args: string[]) {
  const limitIndex = args.indexOf("--limit");
  const parsedLimit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined;
  return {
    dryRun: args.includes("--dry-run"),
    locationOnly: args.includes("--location-only"),
    limit: Number.isFinite(parsedLimit) && parsedLimit! > 0 ? parsedLimit : undefined,
  };
}

const trustedLocationFallbacks = buildTrustedLocationFallbacks();

function buildTrustedLocationFallbacks() {
  const map = new Map<string, ExtractedContact>();

  for (const dealer of ALL_AUTHORIZED_DEALERS) {
    const domain = domainFromUrl(dealer.inventoryUrl);
    const location = { city: dealer.city, state: dealer.state };
    map.set(normalizeKey(dealer.name), location);
    map.set(normalizeKey(`${dealer.name} Service`), location);
    if (domain) map.set(`domain:${domain}`, location);
  }

  for (const seeded of [
    { name: "Plycar Automotive Logistics", city: "Kings Park", state: "NY" },
    { name: "Chubb Collector Car Insurance", city: "Whitehouse Station", state: "NJ" },
  ]) {
    map.set(normalizeKey(seeded.name), { city: seeded.city, state: seeded.state });
  }

  return map;
}

function getTrustedLocationFallback(name: string, website?: string | null): ExtractedContact {
  const direct = trustedLocationFallbacks.get(normalizeKey(name));
  if (direct) return direct;

  const serviceBase = name.replace(/\s+Service$/i, "");
  const serviceMatch = trustedLocationFallbacks.get(normalizeKey(serviceBase));
  if (serviceMatch) return serviceMatch;

  const domain = domainFromUrl(website);
  return domain ? trustedLocationFallbacks.get(`domain:${domain}`) || {} : {};
}

async function enrichFromWebsite(website: string, partnerName: string): Promise<ExtractedContact> {
  const urls = buildCandidateUrls(website);
  let best: ExtractedContact = {};

  for (const url of urls) {
    try {
      const html = await fetchText(url);
      const extracted = extractContactDetails(html, url, partnerName);
      if (scoreExtracted(extracted) > scoreExtracted(best)) {
        best = extracted;
      }
      if (scoreExtracted(best) >= 45) break;
    } catch {
      // Try the next likely public contact page.
    }
  }

  return best;
}

function buildCandidateUrls(website: string) {
  try {
    const parsed = new URL(website);
    const root = `${parsed.protocol}//${parsed.host}`;
    const basePath = parsed.pathname.replace(/\/$/, "");
    const bases = Array.from(new Set([root, basePath ? `${root}${basePath}` : root]));

    return Array.from(new Set(
      bases.flatMap((base) =>
        CONTACT_PATHS.map((path) => path ? `${base}/${path}` : base),
      ),
    ));
  } catch {
    return [];
  }
}

function extractContactDetails(html: string, sourceUrl: string, partnerName: string): ExtractedContact {
  const fromStructuredData = extractStructuredData(html);
  const fromNextData = extractNextDataObjects(html);
  const text = htmlToText(html);
  const fromText = extractFromText(text, partnerName);

  return mergeExtracted(
    { sourceUrl },
    fromStructuredData,
    fromNextData,
    fromText,
  );
}

function extractStructuredData(html: string): ExtractedContact {
  let extracted: ExtractedContact = {};
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

  for (const match of scripts) {
    const raw = decodeHtml(stripCdata(match[1]));
    try {
      const parsed = JSON.parse(raw);
      for (const obj of findObjects(parsed)) {
        extracted = mergeExtracted(extracted, extractFromObject(obj));
      }
    } catch {
      // Some sites ship malformed JSON-LD. Text extraction still covers them.
    }
  }

  return extracted;
}

function extractNextDataObjects(html: string): ExtractedContact {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return {};

  try {
    const parsed = JSON.parse(decodeHtml(match[1]));
    let extracted: ExtractedContact = {};
    for (const obj of findObjects(parsed)) {
      extracted = mergeExtracted(extracted, extractFromObject(obj));
    }
    return extracted;
  } catch {
    return {};
  }
}

function extractFromObject(obj: Record<string, unknown>): ExtractedContact {
  const address = asObject(obj.address) || asObject(obj.location) || null;
  const latitude = numberOrNull(obj.latitude ?? obj.lat ?? asObject(obj.geo)?.latitude);
  const longitude = numberOrNull(obj.longitude ?? obj.lng ?? obj.lon ?? asObject(obj.geo)?.longitude);

  const fromAddressString = parseAddressString(
    cleanString(obj.address) ||
    cleanString(obj.addressLoc) ||
    cleanString(obj.fullAddress) ||
    cleanString(obj.location),
  );

  return mergeExtracted(fromAddressString, {
    email: cleanEmail(obj.email ?? obj.mail ?? obj.contactEmail),
    phone: cleanPhone(obj.telephone ?? obj.phone ?? obj.tel ?? obj.contactPhone),
    streetAddress: cleanString(
      address?.streetAddress ??
      address?.street ??
      address?.address1 ??
      obj.streetAddress ??
      obj.addressInt ??
      obj.street,
    ),
    city: cleanCity(address?.addressLocality ?? address?.city ?? obj.city ?? obj.localCity),
    state: cleanState(address?.addressRegion ?? address?.state ?? obj.state ?? obj.region),
    postalCode: cleanPostalCode(address?.postalCode ?? address?.zipCode ?? obj.postalCode ?? obj.zipCode),
    latitude,
    longitude,
  });
}

function extractFromText(text: string, partnerName: string): ExtractedContact {
  const address = parseAddressString(text);
  const cityFromName = extractCityFromName(partnerName, text);

  return mergeExtracted(address, {
    email: cleanEmail(text),
    phone: cleanPhone(text),
    city: address.city || cityFromName,
  });
}

function parseAddressString(value?: string | null): ExtractedContact {
  if (!value) return {};
  const normalized = value.replace(/\s+/g, " ").trim();
  const cityStateZip = normalized.match(/\b([A-Z][A-Za-z.' -]{1,48}?),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/);
  const stateZip = normalized.match(/\b([A-Z]{2})\s*(?:-|,)?\s*(\d{5})(?:-\d{4})?\b/);

  return {
    city: cleanCity(cityStateZip?.[1]),
    state: cleanState(cityStateZip?.[2] || stateZip?.[1]),
    postalCode: cleanPostalCode(cityStateZip?.[3] || stateZip?.[2]),
    streetAddress: extractStreetAddressBeforeCity(normalized, cityStateZip?.[0]),
  };
}

function extractStreetAddressBeforeCity(text: string, cityStateZip?: string) {
  if (!cityStateZip) return null;
  const index = text.indexOf(cityStateZip);
  if (index < 0) return null;

  const before = text.slice(Math.max(0, index - 120), index).trim();
  const street = before.match(/\b\d{1,6}\s+[A-Za-z0-9.'# -]{4,80}$/);
  return cleanString(street?.[0]);
}

function extractCityFromName(name: string, pageText: string) {
  const cleanedName = name
    .replace(/\b(Ferrari|Lamborghini|Service|Authorized|Dealer|of|at|The)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const candidates = cleanedName.match(/[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2}/g) || [];
  const lowerText = pageText.toLowerCase();

  for (const candidate of candidates.reverse()) {
    if (candidate.length >= 3 && !isGenericNameToken(candidate) && lowerText.includes(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return null;
}

async function hydrateFromPostalCode(contact: ExtractedContact) {
  if (!contact.postalCode) return contact;
  const zip = await geocodeZip(contact.postalCode);
  if (!zip) return contact;

  return {
    ...contact,
    city: contact.city || zip.city,
    state: contact.state || zip.state,
    latitude: contact.latitude ?? zip.latitude,
    longitude: contact.longitude ?? zip.longitude,
  };
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
          state: cleanState(place?.["state abbreviation"]),
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

function buildMissingFieldUpdate(existing: {
  email: string | null;
  phone: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  location: string | null;
  confidence: string;
}, extracted: ExtractedContact) {
  const data: Record<string, unknown> = {};

  if (isBlank(existing.email) && isValidEmail(extracted.email)) data.email = extracted.email!.trim().toLowerCase();
  if (isBlank(existing.phone) && extracted.phone) data.phone = extracted.phone;
  if (isBlank(existing.streetAddress) && extracted.streetAddress) data.streetAddress = extracted.streetAddress;
  if (isBlank(existing.city) && extracted.city) data.city = extracted.city;
  if (isBlank(existing.state) && extracted.state) data.state = extracted.state;
  if (isBlank(existing.postalCode) && extracted.postalCode) data.postalCode = extracted.postalCode;
  if (isBlank(existing.country)) data.country = "US";
  if (existing.latitude === null && extracted.latitude !== null && extracted.latitude !== undefined) data.latitude = extracted.latitude;
  if (existing.longitude === null && extracted.longitude !== null && extracted.longitude !== undefined) data.longitude = extracted.longitude;

  const finalLocation = formatLocation({
    streetAddress: String(data.streetAddress || existing.streetAddress || ""),
    city: String(data.city || existing.city || ""),
    state: String(data.state || existing.state || ""),
    postalCode: String(data.postalCode || existing.postalCode || ""),
  });
  if (isBlank(existing.location) && finalLocation) data.location = finalLocation;

  if (data.email) {
    data.contactStatus = "RESOLVED";
    data.confidence = existing.confidence === "VERIFIED" ? "VERIFIED" : "PUBLIC_SOURCE";
  }
  if (Object.keys(data).length > 0) {
    data.lastVerifiedAt = new Date();
  }

  return data;
}

function mergeExtracted(...items: ExtractedContact[]): ExtractedContact {
  return items.reduce<ExtractedContact>((merged, item) => ({
    sourceUrl: merged.sourceUrl || item.sourceUrl,
    email: merged.email || item.email,
    phone: merged.phone || item.phone,
    streetAddress: merged.streetAddress || item.streetAddress,
    city: merged.city || item.city,
    state: merged.state || item.state,
    postalCode: merged.postalCode || item.postalCode,
    latitude: merged.latitude ?? item.latitude,
    longitude: merged.longitude ?? item.longitude,
  }), {});
}

function scoreExtracted(item: ExtractedContact) {
  let score = 0;
  if (isValidEmail(item.email)) score += 20;
  if (item.phone) score += 10;
  if (item.city) score += 8;
  if (item.state) score += 8;
  if (item.postalCode) score += 6;
  if (item.streetAddress) score += 6;
  if (item.latitude !== null && item.latitude !== undefined) score += 4;
  if (item.longitude !== null && item.longitude !== undefined) score += 4;
  return score;
}

async function fetchText(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    const text = await response.text();
    if (response.ok && !isBotBlock(text)) return text;
  } catch {
    // Fall back to Node HTTPS for older dealer sites with strict cert chains.
  }

  return fetchTextInsecure(url);
}

async function fetchTextInsecure(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { "user-agent": USER_AGENT },
      rejectUnauthorized: false,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if ((response.statusCode || 0) >= 400 || isBotBlock(text)) {
          reject(new Error(`Fetch failed for ${url}: ${response.statusCode}`));
          return;
        }
        resolve(text);
      });
    });

    request.setTimeout(12_000, () => {
      request.destroy(new Error(`Fetch timed out for ${url}`));
    });
    request.on("error", reject);
  });
}

function isBotBlock(text: string) {
  return /Human Verification|Access Denied|enable javascript and cookies/i.test(text);
}

function findObjects(value: unknown, output: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) findObjects(item, output);
    return output;
  }

  output.push(value as Record<string, unknown>);
  for (const nested of Object.values(value)) {
    findObjects(nested, output);
  }
  return output;
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function stripCdata(value: string) {
  return value.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "").trim();
}

function formatLocation(contact: {
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}) {
  const cityState = [contact.city, contact.state].filter(Boolean).join(", ");
  return [contact.streetAddress, [cityState, contact.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ") || null;
}

function cleanEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return matches
    .map((email) => email.toLowerCase())
    .find((email) =>
      isValidEmail(email) &&
      !/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(email) &&
      !/^(privacy|legal|abuse|support)@/i.test(email),
    ) || null;
}

function cleanPhone(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/(?:\+1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/);
  return match?.[0]?.replace(/\s+/g, " ").trim() || null;
}

function cleanString(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = decodeHtml(value).replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function cleanCity(value: unknown) {
  const cleaned = cleanString(value)
    ?.replace(/\s+USA$/i, "")
    .replace(/,\s*Puerto Rico$/i, "")
    .trim() || null;
  if (!cleaned || /\d|@|\.com/i.test(cleaned) || isGenericNameToken(cleaned)) return null;
  return cleaned.length <= 64 ? cleaned : null;
}

function cleanState(value: unknown) {
  const cleaned = cleanString(value)?.toUpperCase();
  if (!cleaned) return null;
  if (cleaned === "PUERTO RICO") return "PR";
  const match = cleaned.match(/\b[A-Z]{2}\b/);
  return match?.[0] || null;
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

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isBlank(value?: string | null) {
  return !value || value.trim().length === 0;
}

function isGenericNameToken(value: string) {
  return /^(insurance|collector|vehicle|vehicles|motors|motorcars|automotive|logistics|carriers|service|services|sales|contact|inventory)$/i.test(value.trim());
}

function decodeHtml(value: string) {
  return value
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, " ")
    .replace(/&nbsp;/g, " ");
}

main()
  .catch((error) => {
    console.error("Partner directory enrichment failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
