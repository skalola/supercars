import { PublicPageSource } from "./public-page-source";
import type { CrawlPage, RawCrawlerListing } from "../types";

export class CarsDotComCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "Cars.com",
      sourceType: "MARKETPLACE",
      discoverDetailLinks: true,
      detailLinkPatterns: [/\/vehicledetail\//i, /\/vehicle\//i],
      maxDetailPages: 120,
      urls: [
        "https://www.cars.com/shopping/results/?makes[]=ferrari",
        "https://www.cars.com/shopping/results/?makes[]=lamborghini",
        "https://www.cars.com/shopping/results/?makes[]=mclaren",
      ],
    });
  }

  extractListings(page: CrawlPage): RawCrawlerListing[] {
    const listings = super.extractListings(page);
    if (!/cars\.com\/vehicledetail\//i.test(page.url)) return listings;

    const dealer = extractCarsDotComDealer(page.html, page.url);
    return listings.map((listing) => ({
      ...listing,
      dealerName: listing.dealerName || dealer.name,
      dealerWebsite: listing.dealerWebsite || dealer.website,
      location: listing.location || dealer.location,
    }));
  }
}

function extractCarsDotComDealer(html: string, pageUrl: string) {
  const decoded = decodeHtml(html);
  const text = stripTags(decoded).replace(/\s+/g, " ").trim();

  return {
    name:
      pickJsonString(decoded, ["seller_name", "dealer_name", "dealerName", "sellerName"]) ||
      pickNearLabel(text, /Seller's Notes\s+([A-Z0-9][A-Za-z0-9 &'.,-]{2,80}?)(?:\s+\d|\s+\(|\s+Contact|\s+Dealer|\s+Visit)/i) ||
      pickNearLabel(text, /Dealer\s+([A-Z0-9][A-Za-z0-9 &'.,-]{2,80}?)(?:\s+\d|\s+\(|\s+Contact|\s+Visit)/i),
    website:
      pickJsonUrl(decoded, ["dealerWebsite", "dealer_website", "sellerWebsite", "website"], pageUrl) ||
      pickWebsiteLink(decoded, pageUrl),
    location: pickNearLabel(text, /\b([A-Z][A-Za-z .'-]+,\s+[A-Z]{2})\b/),
  };
}

function pickJsonString(html: string, keys: string[]) {
  for (const key of keys) {
    const match = html.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i"));
    const value = cleanText(match?.[1]);
    if (value) return value;
  }
  return null;
}

function pickJsonUrl(html: string, keys: string[], pageUrl: string) {
  for (const key of keys) {
    const match = html.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i"));
    const url = absolutize(match?.[1], pageUrl);
    if (url && !/cars\.com$/i.test(new URL(url).hostname)) return new URL(url).origin;
  }
  return null;
}

function pickWebsiteLink(html: string, pageUrl: string) {
  for (const match of html.matchAll(/href=["']([^"']+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi)) {
    const label = stripTags(match[2] || "");
    if (!/website|dealer site|visit/i.test(label)) continue;
    const url = absolutize(match[1], pageUrl);
    if (!url) continue;
    const parsed = new URL(url);
    if (!/(^|\.)cars\.com$/i.test(parsed.hostname)) return parsed.origin;
  }
  return null;
}

function pickNearLabel(text: string, pattern: RegExp) {
  return cleanText(text.match(pattern)?.[1]);
}

function absolutize(value: string | undefined, pageUrl: string) {
  if (!value) return null;
  const cleaned = decodeHtml(value).replace(/\\\//g, "/").trim();
  if (!cleaned || /^(mailto:|tel:|javascript:|#)/i.test(cleaned)) return null;
  try {
    const parsed = new URL(cleaned, pageUrl);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function cleanText(value: string | undefined) {
  if (!value) return null;
  const cleaned = decodeHtml(value).replace(/\s+/g, " ").trim();
  if (!cleaned || /^(dealer|seller|cars\.com)$/i.test(cleaned)) return null;
  return cleaned.length <= 120 ? cleaned : null;
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ");
}

function decodeHtml(value: string) {
  return value
    .replace(/\\u002F/g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
