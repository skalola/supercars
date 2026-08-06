import type {
  CrawlPage,
  CrawlerSourceType,
  PublicInventorySource,
  RawCrawlerListing,
} from "../types";
import https from "node:https";
import { normalizeListing } from "../normalizer";
import { extractVINFromText, extractVINsFromText } from "../vin-extractor";
import { normalizeSupportedMake, supportedMakePattern, SUPPORTED_MAKES } from "@/lib/supported-makes";

type PublicPageSourceOptions = {
  sourceName: string;
  sourceType: CrawlerSourceType;
  urls: string[];
  discoverDetailLinks?: boolean;
  detailLinkPatterns?: RegExp[];
  maxDetailPages?: number;
};

const DEFAULT_HEADERS = {
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
  "referer": "https://www.google.com/",
};

const SUPPORTED_MAKE_PATTERN = supportedMakePattern();

export class PublicPageSource implements PublicInventorySource {
  readonly sourceName: string;
  readonly sourceType: CrawlerSourceType;
  private readonly urls: string[];
  private readonly discoverDetailLinks: boolean;
  private readonly detailLinkPatterns: RegExp[];
  private readonly maxDetailPages: number;

  constructor(options: PublicPageSourceOptions) {
    this.sourceName = options.sourceName;
    this.sourceType = options.sourceType;
    this.urls = options.urls;
    this.discoverDetailLinks = options.discoverDetailLinks ?? false;
    this.detailLinkPatterns = options.detailLinkPatterns ?? [
      /ferrari/i,
      /lamborghini/i,
      /mclaren|mcclaren/i,
      /vehicle-details/i,
      /\/inventory\/.+/i,
      /\/vehicles\/.+/i,
    ];
    this.maxDetailPages = options.maxDetailPages ?? 80;
  }

  async crawlPages(): Promise<CrawlPage[]> {
    const pages: CrawlPage[] = [];

    for (const url of this.urls) {
      const page = await this.fetchPage(url);
      if (page) pages.push(page);
    }

    if (!this.discoverDetailLinks) return pages;

    const detailUrls = Array.from(
      new Set(
        pages.flatMap((page) =>
          extractPageLinks(page.html, page.url).filter((url) =>
            this.detailLinkPatterns.some((pattern) => pattern.test(url))
          )
        )
      )
    )
      .filter((url) => !this.urls.includes(url))
      .slice(0, this.maxDetailPages);

    for (const url of detailUrls) {
      const page = await this.fetchPage(url);
      if (page) pages.push(page);
    }

    return pages;
  }

  extractListings(page: CrawlPage): RawCrawlerListing[] {
    return dedupeRawListings([
      ...this.extractVehicleItemListings(page),
      ...this.extractJsonLdListings(page),
      ...this.extractEmbeddedVinListings(page),
    ]);
  }

  extractVIN(raw: RawCrawlerListing): string | null {
    return extractVINFromText([raw.vin, raw.title, raw.url].filter(Boolean).join(" "));
  }

  normalizeListing(raw: RawCrawlerListing) {
    return normalizeListing({ ...raw, vin: this.extractVIN(raw) });
  }

  private extractJsonLdListings(page: CrawlPage): RawCrawlerListing[] {
    const listings: RawCrawlerListing[] = [];
    const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    const matches = page.html.matchAll(scriptPattern);

    for (const match of matches) {
      const text = decodeHtml(stripTags(match[1])).trim();
      for (const item of parseJsonCandidates(text)) {
        for (const node of flattenJsonLd(item)) {
          const raw = this.rawFromJsonNode(node, page.url);
          if (raw) listings.push(raw);
        }
      }
    }

    return listings;
  }

  private extractVehicleItemListings(page: CrawlPage): RawCrawlerListing[] {
    const listings: RawCrawlerListing[] = [];
    const cardPattern = /<div\b[^>]*class=["'][^"']*\bvehicle-item\b[^"']*["'][^>]*>[\s\S]*?(?=<div\b[^>]*class=["'][^"']*\bvehicle-item\b|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>|$)/gi;
    const cards = page.html.match(cardPattern) ?? [];

    for (const card of cards) {
      const vin = extractVINFromText(card);
      if (!vin || !SUPPORTED_MAKE_PATTERN.test(card)) continue;

      const href = pickAttribute(card, "href", /class=["'][^"']*\bjs-vehicle-item-link\b[^"']*["']/i)
        ?? pickVehicleDetailHref(card, page.url)
        ?? pickFirstHref(card);
      const url = href ? absolutize(href, page.url) : null;
      if (!isLikelyVehicleDetailUrl(url)) continue;
      const titleFromUrl = inferVehicleTitleFromUrl(url);
      const plainText = compactWhitespace(decodeHtml(stripTags(card)));
      const title = titleFromUrl.title ?? plainText.slice(0, 220);

      listings.push({
        sourceName: this.sourceName,
        sourceType: this.sourceType,
        pageUrl: page.url,
        url,
        externalListingId: pickDataAttribute(card, "vuid") ?? idFromUrl(url),
        title,
        vin,
        year: titleFromUrl.year ?? inferYearFromText(plainText),
        make: titleFromUrl.make ?? inferMakeFromText(plainText),
        model: titleFromUrl.model ?? inferModelText(plainText),
        trim: titleFromUrl.trim ?? inferTrimFromText(plainText),
        price: inferPriceFromText(plainText),
        mileage: inferMileageFromText(plainText),
        color: inferColorFromText(plainText),
        location: titleFromUrl.location,
        dealerName: null,
        dealerWebsite: null,
        images: extractImageUrls(card, page.url),
      });
    }

    return listings;
  }

  private extractEmbeddedVinListings(page: CrawlPage): RawCrawlerListing[] {
    const listings: RawCrawlerListing[] = [];
    const vinMatches = extractVINsFromText(page.html);
    const pageHeroImages = vinMatches.length === 1 ? extractPageHeroImages(page.html, page.url) : [];

    for (const vin of vinMatches) {
      const index = page.html.toUpperCase().indexOf(vin);
      const contextHtml = page.html.slice(Math.max(0, index - 6000), index + 6000);
      const context = decodeHtml(stripTags(contextHtml));
      const url = isLikelyVehicleDetailUrl(page.url)
        ? page.url
        : findClosestVehicleDetailHref(page.html, index, page.url);
      if (!url) continue;

      const titleFromUrl = inferVehicleTitleFromUrl(url);
      if (!SUPPORTED_MAKE_PATTERN.test(context) && !titleFromUrl.make) continue;

      listings.push({
        sourceName: this.sourceName,
        sourceType: this.sourceType,
        pageUrl: page.url,
        url,
        externalListingId: null,
        title: titleFromUrl.title ?? compactWhitespace(context.slice(0, 500)),
        vin,
        year: titleFromUrl.year ?? inferYearFromText(context),
        make: titleFromUrl.make ?? inferMakeFromText(context),
        model: titleFromUrl.model ?? inferModelText(context),
        trim: titleFromUrl.trim ?? inferTrimFromText(context),
        price: inferPriceFromText(context),
        mileage: inferMileageFromText(context),
        color: inferColorFromText(context),
        location: titleFromUrl.location,
        dealerName: null,
        dealerWebsite: null,
        images: Array.from(new Set([...extractImageUrls(contextHtml, page.url), ...pageHeroImages])),
      });
    }

    return listings;
  }

  private rawFromJsonNode(node: Record<string, unknown>, pageUrl: string): RawCrawlerListing | null {
    const searchable = JSON.stringify(node);
    if (!SUPPORTED_MAKE_PATTERN.test(searchable)) return null;

    const vin = pickString(node, ["vehicleIdentificationNumber", "vin", "serialNumber"]) ?? extractVINFromText(searchable);
    if (!vin) return null;

    const offers = asRecord(node.offers);
    const brand = asRecord(node.brand);
    const seller = asRecord(offers?.seller) ?? asRecord(node.seller);

    return {
      sourceName: this.sourceName,
      sourceType: this.sourceType,
      pageUrl,
      url: pickString(node, ["url", "@id"]) ?? pickString(offers, ["url"]),
      externalListingId: pickString(node, ["sku", "productID", "identifier", "@id"]),
      title: pickString(node, ["name", "headline", "description"]),
      vin,
      year: pickYear(node, ["vehicleModelDate", "modelDate", "productionDate"]) ?? inferYearFromText(searchable),
      make: pickString(node, ["manufacturer", "make"]) ?? pickString(brand, ["name"]) ?? inferMakeFromText(searchable),
      model: pickString(node, ["model", "vehicleModel"]) ?? inferModelText(searchable),
      trim: pickString(node, ["trim", "vehicleTrim", "vehicleConfiguration"]) ?? inferTrimFromText(searchable),
      price: pickNumber(offers, ["price", "lowPrice"]),
      mileage: pickNumber(node, ["mileageFromOdometer", "mileage"]),
      color: pickString(node, ["color", "vehicleInteriorColor", "vehicleExteriorColor"]),
      location: pickString(node, ["availableAtOrFrom", "areaServed"]),
      dealerName: pickString(seller, ["name"]),
      dealerWebsite: pickString(seller, ["url", "sameAs", "@id"]) ?? pickString(node, ["sellerUrl", "dealerUrl"]),
      images: pickImages(node).map((image) => absolutize(image, pageUrl)).filter((image): image is string => Boolean(image)),
    };
  }

  private async fetchPage(url: string): Promise<CrawlPage | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, {
        headers: DEFAULT_HEADERS,
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        return null;
      }

      return {
        url: response.url || url,
        html: await response.text(),
        fetchedAt: new Date(),
      };
    } catch (error) {
      try {
        return await this.fetchPageWithInsecureTlsFallback(url);
      } catch {
        console.warn(`[${this.sourceName}] Failed to fetch ${url}:`, error instanceof Error ? error.message : error);
        return null;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchPageWithInsecureTlsFallback(url: string, redirectCount = 0): Promise<CrawlPage | null> {
    if (redirectCount > 3) return null;

    return new Promise((resolve, reject) => {
      const request = https.get(url, {
        headers: DEFAULT_HEADERS,
        rejectUnauthorized: false,
      }, (response) => {
        const statusCode = response.statusCode || 0;
        const location = response.headers.location;
        if (statusCode >= 300 && statusCode < 400 && location) {
          response.resume();
          const redirectedUrl = new URL(location, url).toString();
          this.fetchPageWithInsecureTlsFallback(redirectedUrl, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        const contentType = String(response.headers["content-type"] || "");
        if (statusCode >= 400 || (!contentType.includes("text/html") && !contentType.includes("application/xhtml"))) {
          response.resume();
          resolve(null);
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            url,
            html: Buffer.concat(chunks).toString("utf8"),
            fetchedAt: new Date(),
          });
        });
      }).on("error", reject);

      request.setTimeout(10000, () => {
        request.destroy(new Error("TLS fallback request timed out"));
      });
    });
  }
}

function parseJsonCandidates(text: string): unknown[] {
  try {
    return [JSON.parse(text)];
  } catch {
    return [];
  }
}

function flattenJsonLd(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  const record = asRecord(value);
  if (!record) return [];

  const about = asRecord(record.about);
  const offers = asRecord(record.offers);
  const aboutOffers = asRecord(about?.offers);
  const item = asRecord(record.item);
  return [
    record,
    ...flattenJsonLd(record["@graph"]),
    ...flattenJsonLd(record.itemListElement),
    ...flattenJsonLd(record.itemOffered),
    ...flattenJsonLd(offers?.itemOffered),
    ...flattenJsonLd(about),
    ...flattenJsonLd(aboutOffers),
    ...flattenJsonLd(aboutOffers?.itemOffered),
    ...flattenJsonLd(item?.item),
  ];
}

function dedupeRawListings(listings: RawCrawlerListing[]): RawCrawlerListing[] {
  const seen = new Set<string>();
  return listings.filter((listing) => {
    const key = [listing.vin, listing.url ?? listing.externalListingId ?? listing.title].filter(Boolean).join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function pickString(record: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return decodeHtml(value.trim());
    if (typeof value === "number") return String(value);
    const nested = asRecord(value);
    if (nested) {
      const nestedValue = pickString(nested, ["name", "value", "@id"]);
      if (nestedValue) return nestedValue;
    }
  }
  return null;
}

function pickNumber(record: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
    }
    const nested = asRecord(value);
    if (nested) {
      const nestedValue = pickNumber(nested, ["value"]);
      if (nestedValue) return nestedValue;
    }
  }
  return null;
}

function pickYear(record: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && value >= 1980 && value <= 2039) return value;
    if (typeof value === "string") {
      const year = inferYearFromText(value);
      if (year) return year;
    }
  }
  return null;
}

function pickImages(record: Record<string, unknown>): string[] {
  const value = record.image;
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractPageLinks(html: string, pageUrl: string): string[] {
  return [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => absolutize(decodeHtml(match[1]), pageUrl))
    .filter((url): url is string => Boolean(url))
    .filter((url) => {
      try {
        const parsed = new URL(url);
        const page = new URL(pageUrl);
        return parsed.origin === page.origin;
      } catch {
        return false;
      }
    });
}

function pickAttribute(html: string, attribute: string, tagNeedle: RegExp): string | null {
  const tagPattern = /<a\b[^>]*>/gi;
  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0];
    if (!tagNeedle.test(tag)) continue;
    const attr = tag.match(new RegExp(`${attribute}=["']([^"']+)["']`, "i"));
    if (attr?.[1]) return decodeHtml(attr[1]);
  }
  return null;
}

function pickFirstHref(html: string): string | null {
  const match = html.match(/href=["']([^"']+)["']/i);
  return match?.[1] ? decodeHtml(match[1]) : null;
}

function pickVehicleDetailHref(html: string, pageUrl: string): string | null {
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const url = absolutize(decodeHtml(match[1]), pageUrl);
    if (isLikelyVehicleDetailUrl(url)) return url;
  }
  return null;
}

function pickDataAttribute(html: string, name: string): string | null {
  const match = html.match(new RegExp(`data-${name}=["']([^"']+)["']`, "i"));
  return match?.[1] ? decodeHtml(match[1]) : null;
}

function absolutize(url: string | null, pageUrl: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, pageUrl).toString();
  } catch {
    return null;
  }
}

function idFromUrl(url: string | null): string | null {
  if (!url) return null;
  return url.match(/(?:id-|id=)([A-Za-z0-9_-]+)/i)?.[1]
    ?? url.match(/-([a-f0-9]{32})\.htm/i)?.[1]
    ?? null;
}

function findClosestVehicleDetailHref(html: string, index: number, pageUrl: string): string | null {
  const context = html.slice(Math.max(0, index - 10000), index + 10000);
  const hrefs = Array.from(context.matchAll(/href=["']([^"']+)["']/gi))
    .map((match) => absolutize(decodeHtml(match[1]), pageUrl))
    .filter((url): url is string => Boolean(url && isLikelyVehicleDetailUrl(url)));

  if (hrefs.length > 0) return hrefs.at(-1) ?? hrefs[0];

  return pickVehicleDetailHref(html, pageUrl);
}

function isLikelyVehicleDetailUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (/\/cars-for-sale\/vehicle\/\d+/i.test(path)) return true;
    if (/\/vehicledetail\//i.test(path)) return true;
    if (/\/car\/(?:ferrari|lamborghini|mclaren)\//i.test(path)) return true;
    if (/\/(?:new|used|certified|pre-owned)\/(?:ferrari|lamborghini|mclaren)\//i.test(path)) return true;
    if (/(?:ferrari|lamborghini|mclaren).+for-sale.+\.(?:htm|html)$/i.test(path)) return true;
    if (/\/vehicle-details\/.+/i.test(path)) return true;
    if (/\/inventory\/.+(?:vin|stock|vehicle|detail|listing)/i.test(path)) return true;
    if (/\/(?:used|new)-.+\.(?:htm|html)$/i.test(path) && SUPPORTED_MAKE_PATTERN.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

function extractImageUrls(html: string, pageUrl: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/(?:src|data-src|srcset|data-srcset)=["']([^"']+)["']/gi)) {
    const candidates = match[1].split(",").map((part) => part.trim().split(/\s+/)[0]);
    for (const candidate of candidates) {
      const absolute = absolutize(decodeHtml(candidate), pageUrl);
      if (absolute && isUsefulVehicleImageUrl(absolute)) urls.add(absolute);
    }
  }
  return Array.from(urls);
}

function extractPageHeroImages(html: string, pageUrl: string): string[] {
  const images = new Set<string>();
  for (const match of html.matchAll(/<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi)) {
    const content = match[0].match(/\bcontent=["']([^"']+)["']/i)?.[1];
    const absolute = absolutize(decodeHtml(content ?? ""), pageUrl);
    if (absolute && isUsefulVehicleImageUrl(absolute)) images.add(absolute);
  }
  return Array.from(images);
}

function isUsefulVehicleImageUrl(value: string): boolean {
  if (!/\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(value)) return false;
  return !/placeholder|logo|icon|favicon|spinner|loading|avatar|profile|badge|sprite|transparent|blank/i.test(value);
}

function inferVehicleTitleFromUrl(url: string | null): {
  title: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  location: string | null;
} {
  if (!url) return { title: null, year: null, make: null, model: null, trim: null, location: null };

  const path = new URL(url).pathname;
  const slug = path.split("/").filter(Boolean).at(-1) ?? "";
  const decoded = decodeURIComponent(slug).replace(/--/g, "-");
  const tokens = decoded.split("-").filter(Boolean);
  const yearIndex = tokens.findIndex((token) => /^(19[8-9]\d|20[0-3]\d)$/.test(token));
  if (yearIndex < 0) return { title: null, year: null, make: null, model: null, trim: null, location: null };

  const year = Number(tokens[yearIndex]);
  const make = normalizeMakeToken(tokens[yearIndex + 1]);
  if (!make) return { title: null, year, make: null, model: null, trim: null, location: null };

  const afterMake = tokens.slice(yearIndex + 2);
  const stopIndex = afterMake.findIndex((token) =>
    /^(west|palm|beach|fl|ca|ny|tx|miami|los|angeles|san|francisco|id|\d+)$/i.test(token)
  );
  const modelTokens = (stopIndex >= 0 ? afterMake.slice(0, stopIndex) : afterMake).filter(Boolean);
  const model = modelTokens[0] ? titleCase(modelTokens[0]) : null;
  const trim = modelTokens.length > 1 ? modelTokens.slice(1).map(titleCase).join(" ") : null;
  const title = [year, make, model, trim].filter(Boolean).join(" ");

  return {
    title: title || null,
    year,
    make,
    model,
    trim,
    location: stopIndex >= 0 ? titleCase(afterMake.slice(stopIndex).filter((token) => !/^id|\d+$/i.test(token)).join(" ")) : null,
  };
}

function normalizeMakeToken(token: string | undefined): string | null {
  return normalizeSupportedMake(token);
}

function titleCase(value: string): string {
  return value
    .split(/\s+|-/)
    .filter(Boolean)
    .map((part) => part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function inferYearFromText(text: string): number | null {
  const match = text.match(/\b(19[8-9]\d|20[0-3]\d)\b/);
  return match ? Number(match[1]) : null;
}

function inferMakeFromText(text: string): string | null {
  return normalizeSupportedMake(text);
}

const KNOWN_MODELS = [
  // Lamborghini
  "Aventador", "Huracan", "Huracán", "Urus", "Gallardo", "Murcielago", "Murciélago", 
  "Revuelto", "Diablo", "Countach", "Centenario", "Veneno", "Sian", "Sián", "Temerario",
  "Miura", "Espada", "Islero", "Jarama", "Urraco", "Silhouette", "Jalpa", "LM002",
  "Reventon", "Sesto Elemento", "Essenza SCV12", "Lanzador", "350 GT", "400 GT",
  // Ferrari
  "Roma", "Portofino", "California", "SF90 Stradale", "SF90", "296 GTB/GTS", "296", "812 Superfast", "812", "488 GTB", "488", "458 Italia", "458", "F8 Tributo", "F8", "F50", "F40", "LaFerrari", "Enzo", "Daytona SP3", "Daytona", 
  "Testarossa", "Purosangue", "12Cilindri", "GTC4Lusso", "GTC4", "550 Maranello", "550", "575M Maranello", "575", "512", "308 GTB/GTS", "308", "328 GTB/GTS", "328",
  "F12berlinetta", "F12", "Berlinetta Boxer", "Berlinetta", "Mondial", "F80", "Monza SP1/SP2", "Monza", "348", "456", "360 Modena", "360", "Dino 246 GT/GTS", "Dino", "288 GTO", "288", "GTO", "166 Inter", "250 GT Series", "250 GTO", "275 GTB", "365 GTB/4 Daytona",
  // McLaren
  "Artura", "W1", "GTS", "GT", "750S Spider", "750S", "765LT Spider", "765LT", "720S Spider", "720S", "675LT Spider", "675LT",
  "650S Spider", "650S", "625C", "600LT Spider", "600LT", "570S Spider", "570S", "570GT", "540C", "12C Spider", "MP4-12C", "12C",
  "P1", "Senna", "Speedtail", "Elva", "Sabre", "Solus GT", "620R", "F1"
];

const SORTED_MODELS = [...KNOWN_MODELS].sort((a, b) => b.length - a.length);

function inferModelText(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  for (const model of SORTED_MODELS) {
    const modelLower = model.toLowerCase();
    
    // Skip location false positives
    if (modelLower === "california") {
      if (!lowerText.includes("ferrari california") && !lowerText.includes("california t") && !lowerText.includes("california 2+2")) {
        continue;
      }
    }
    if (modelLower === "roma") {
      if (!lowerText.includes("ferrari roma") && !lowerText.includes("roma base") && !lowerText.includes("roma spider") && !lowerText.includes("roma coupe")) {
        continue;
      }
    }
    if (modelLower === "monza") {
      if (!lowerText.includes("monza sp") && !lowerText.includes("ferrari monza")) {
        continue;
      }
    }
    if (modelLower === "daytona") {
      if (!lowerText.includes("ferrari daytona") && !lowerText.includes("daytona sp3") && !lowerText.includes("365 gtb/4 daytona")) {
        continue;
      }
    }

    const regex = new RegExp(`\\b${modelLower}\\b`, "i");
    if (regex.test(lowerText)) {
      return model;
    }
  }

  const compact = compactWhitespace(text);
  const makeAlternates = SUPPORTED_MAKES.join("|");
  const match = compact.match(new RegExp(`\\b(?:${makeAlternates})\\s+([A-Z0-9][A-Za-z0-9 -]{1,40})`, "i"));
  return match ? match[1].trim() : null;
}

function inferTrimFromText(text: string): string | null {
  const compact = compactWhitespace(text);
  const match = compact.match(/\b(?:trim|style)\s*:?\s*([A-Za-z0-9 +.-]{2,30})\b/i);
  return match ? match[1].trim() : null;
}

function inferPriceFromText(text: string): number | null {
  const match = text.match(/\$\s?([0-9][0-9,.]{3,})/);
  return match ? Number(match[1].replace(/[^0-9]/g, "")) : null;
}

function inferMileageFromText(text: string): number | null {
  const match = text.match(/\b([0-9][0-9,]{2,})\s*(?:mi|miles|mileage)\b/i);
  return match ? Number(match[1].replace(/[^0-9]/g, "")) : null;
}

function inferColorFromText(text: string): string | null {
  const match = text.match(/\b(?:exterior color|color)\s*:?\s*([A-Za-z ]{3,30})\b/i);
  return match ? compactWhitespace(match[1]) : null;
}
