import { PublicPageSource } from "./public-page-source";
import type { CrawlPage, RawCrawlerListing } from "../types";

const AUTOTRADER_MAKES = ["ferrari", "lamborghini", "mclaren"];
const FIRST_RECORDS = [0, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250];

export class AutoTraderCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "AutoTrader",
      sourceType: "MARKETPLACE",
      discoverDetailLinks: true,
      detailLinkPatterns: [/\/cars-for-sale\/vehicle\/\d+/i],
      maxDetailPages: 120,
      urls: AUTOTRADER_MAKES.flatMap((make) =>
        FIRST_RECORDS.map((firstRecord) =>
          firstRecord === 0
            ? `https://www.autotrader.com/cars-for-sale/${make}`
            : `https://www.autotrader.com/cars-for-sale/${make}?firstRecord=${firstRecord}`,
        ),
      ),
    });
  }

  extractListings(page: CrawlPage): RawCrawlerListing[] {
    const listings = super.extractListings(page);
    if (!isAutoTraderVehicleDetailUrl(page.url)) return listings;

    const dealer = extractAutoTraderDealer(page.html, page.url);
    
    // Discard the listing if we couldn't find an external dealer website
    if (!dealer.website) {
      console.log(`[AutoTrader] Discarding listing ${page.url} - no external dealer website found.`);
      return [];
    }

    return listings.map((listing) => ({
      ...listing,
      url: dealer.website, // Use the dealer's website instead of AutoTrader
      externalListingId: listing.externalListingId || autoTraderIdFromUrl(page.url),
      dealerName: listing.dealerName || dealer.name,
      dealerWebsite: listing.dealerWebsite || dealer.website,
      location: listing.location || dealer.location,
    }));
  }
}

function isAutoTraderVehicleDetailUrl(url: string) {
  return /autotrader\.com\/cars-for-sale\/vehicle\/\d+/i.test(url);
}

function canonicalAutoTraderVehicleUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function autoTraderIdFromUrl(url: string) {
  return url.match(/\/vehicle\/(\d+)/i)?.[1] ?? null;
}

function extractAutoTraderDealer(html: string, pageUrl: string) {
  const decoded = decodeHtml(html);
  const text = stripTags(decoded).replace(/\s+/g, " ").trim();

  const website =
    pickDealerUrlFromJson(decoded, pageUrl) ||
    pickDealerWebsiteFromLinks(decoded, pageUrl);
  const name =
    pickDealerNameFromJson(decoded) ||
    pickDealerNameNearLabels(text) ||
    null;
  const location = pickLocationNearDealerText(text);

  return { name, website, location };
}

function pickDealerNameFromJson(html: string) {
  const patterns = [
    /"sellerName"\s*:\s*"([^"]+)"/i,
    /"dealerName"\s*:\s*"([^"]+)"/i,
    /"ownerName"\s*:\s*"([^"]+)"/i,
    /"name"\s*:\s*"([^"]+)"\s*,\s*"sellerType"\s*:\s*"Dealer"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = cleanDealerText(match?.[1]);
    if (value) return value;
  }

  return null;
}

function pickDealerUrlFromJson(html: string, pageUrl: string) {
  const patterns = [
    /"dealerWebsite"\s*:\s*"([^"]+)"/i,
    /"website"\s*:\s*"([^"]+)"/i,
    /"sellerWebsite"\s*:\s*"([^"]+)"/i,
    /"ownerWebsite"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const url = absolutizeDealerUrl(match?.[1], pageUrl);
    if (url && !isAutoTraderUrl(url)) return originFromUrl(url);
  }

  return null;
}

function pickDealerWebsiteFromLinks(html: string, pageUrl: string) {
  for (const match of html.matchAll(/href=["']([^"']+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi)) {
    const label = stripTags(match[2] || "").toLowerCase();
    if (!/(dealer website|visit website|view website|website)/i.test(label)) continue;
    const url = absolutizeDealerUrl(match[1], pageUrl);
    if (url && !isAutoTraderUrl(url)) return originFromUrl(url);
  }

  for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'\s<>]+/gi)) {
    const url = absolutizeDealerUrl(match[0], pageUrl);
    if (url && !isAutoTraderUrl(url) && !isBlockedUtilityUrl(url)) return originFromUrl(url);
  }

  return null;
}

function pickDealerNameNearLabels(text: string) {
  const patterns = [
    /Dealer Information\s+([A-Z0-9][A-Za-z0-9 &'.,-]{2,80}?)(?:\s+\d|\s+\(|\s+Visit|\s+Contact|\s+Dealer|\s+Get)/i,
    /Seller Comments\s+.*?Dealer Information\s+([A-Z0-9][A-Za-z0-9 &'.,-]{2,80}?)(?:\s+\d|\s+\(|\s+Visit|\s+Contact|\s+Dealer|\s+Get)/i,
    /Listed by\s+([A-Z0-9][A-Za-z0-9 &'.,-]{2,80}?)(?:\s+\d|\s+\(|\s+Visit|\s+Contact|\s+Dealer|\s+Get)/i,
  ];

  for (const pattern of patterns) {
    const value = cleanDealerText(text.match(pattern)?.[1]);
    if (value) return value;
  }

  return null;
}

function pickLocationNearDealerText(text: string) {
  const match = text.match(/\b([A-Z][A-Za-z .'-]+,\s+[A-Z]{2})\b/);
  return match?.[1] || null;
}

function absolutizeDealerUrl(value: string | undefined, pageUrl: string) {
  if (!value) return null;
  const cleaned = decodeHtml(value)
    .replace(/\\\//g, "/")
    .replace(/^"+|"+$/g, "")
    .trim();
  if (!cleaned || /^(mailto:|tel:|javascript:|#)/i.test(cleaned)) return null;

  try {
    const parsed = new URL(cleaned, pageUrl);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function isAutoTraderUrl(url: string) {
  try {
    return /(^|\.)autotrader\.com$/i.test(new URL(url).hostname);
  } catch {
    return true;
  }
}

function isBlockedUtilityUrl(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return /google|gstatic|doubleclick|facebook|schema\.org|w3\.org|cloudfront|akamai/i.test(hostname);
  } catch {
    return true;
  }
}

function originFromUrl(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function cleanDealerText(value: string | undefined) {
  if (!value) return null;
  const cleaned = decodeHtml(value)
    .replace(/\\u0026/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^(dealer|seller|private seller|autotrader)$/i.test(cleaned)) return null;
  if (/ferrari|lamborghini|motor|auto|cars|exotic|imports|fleet|collection|gallery|dealer/i.test(cleaned)) {
    return cleaned.slice(0, 100);
  }
  return cleaned.length >= 4 && cleaned.length <= 80 ? cleaned : null;
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
