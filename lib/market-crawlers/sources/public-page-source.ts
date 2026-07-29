import type {
  CrawlPage,
  CrawlerSourceType,
  PublicInventorySource,
  RawCrawlerListing,
} from "../types";
import { normalizeListing } from "../normalizer";
import { extractVINFromText, extractVINsFromText } from "../vin-extractor";

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
      if (!vin || !/ferrari|lamborghini/i.test(card)) continue;

      const href = pickAttribute(card, "href", /class=["'][^"']*\bjs-vehicle-item-link\b[^"']*["']/i)
        ?? pickFirstHref(card);
      const url = href ? absolutize(href, page.url) : null;
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

    for (const vin of vinMatches) {
      const index = page.html.toUpperCase().indexOf(vin);
      const context = decodeHtml(stripTags(page.html.slice(Math.max(0, index - 2500), index + 2500)));
      const titleFromUrl = inferVehicleTitleFromUrl(page.url);
      if (!/ferrari|lamborghini/i.test(context) && !titleFromUrl.make) continue;

      listings.push({
        sourceName: this.sourceName,
        sourceType: this.sourceType,
        pageUrl: page.url,
        url: closestHref(page.html, index, page.url),
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
        images: [],
      });
    }

    return listings;
  }

  private rawFromJsonNode(node: Record<string, unknown>, pageUrl: string): RawCrawlerListing | null {
    const searchable = JSON.stringify(node);
    if (!/ferrari|lamborghini/i.test(searchable)) return null;

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
      images: pickImages(node),
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
      console.warn(`[${this.sourceName}] Failed to fetch ${url}:`, error instanceof Error ? error.message : error);
      return null;
    } finally {
      clearTimeout(timeout);
    }
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

  const graph = record["@graph"];
  const itemList = record.itemListElement;
  return [
    record,
    ...flattenJsonLd(graph),
    ...flattenJsonLd(itemList),
    ...flattenJsonLd(asRecord(record.item)?.item),
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
  return url.match(/(?:id-|id=)([A-Za-z0-9_-]+)/i)?.[1] ?? null;
}

function extractImageUrls(html: string, pageUrl: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/(?:src|data-src|srcset|data-srcset)=["']([^"']+)["']/gi)) {
    const candidates = match[1].split(",").map((part) => part.trim().split(/\s+/)[0]);
    for (const candidate of candidates) {
      const absolute = absolutize(candidate, pageUrl);
      if (absolute && /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(absolute)) urls.add(absolute);
    }
  }
  return Array.from(urls);
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
  if (!token) return null;
  if (/ferrari/i.test(token)) return "Ferrari";
  if (/lamborghini/i.test(token)) return "Lamborghini";
  return null;
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
  if (/ferrari/i.test(text)) return "Ferrari";
  if (/lamborghini/i.test(text)) return "Lamborghini";
  return null;
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
  "F12berlinetta", "F12", "Berlinetta Boxer", "Berlinetta", "Mondial", "F80", "Monza SP1/SP2", "Monza", "348", "456", "360 Modena", "360", "Dino 246 GT/GTS", "Dino", "288 GTO", "288", "GTO", "166 Inter", "250 GT Series", "250 GTO", "275 GTB", "365 GTB/4 Daytona"
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
  const match = compact.match(/\b(?:Ferrari|Lamborghini)\s+([A-Z0-9][A-Za-z0-9 -]{1,40})/);
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

function closestHref(html: string, index: number, pageUrl: string): string | null {
  const context = html.slice(Math.max(0, index - 3000), index + 500);
  const hrefs = Array.from(context.matchAll(/href=["']([^"']+)["']/gi));
  const last = hrefs.at(-1)?.[1];
  if (!last) return null;
  try {
    return new URL(last, pageUrl).toString();
  } catch {
    return null;
  }
}
