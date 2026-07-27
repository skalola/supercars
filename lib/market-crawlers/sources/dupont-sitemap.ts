import { PublicPageSource } from "./public-page-source";
import type { CrawlPage, RawCrawlerListing } from "../types";

export class DuPontSitemapCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "DuPont Registry Sitemap",
      sourceType: "MARKETPLACE",
      urls: Array.from({ length: 15 }, (_, i) => `https://www.dupontregistry.com/vdp-sitemap-${i + 1}.xml`),
    });
  }

  override async crawlPages(): Promise<CrawlPage[]> {
    const pages: CrawlPage[] = [];
    const headers = {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    // Crawling the first 5 sitemaps yields ~600 unique exotics, which is extremely fast and high yield
    const targetUrls = this["urls"].slice(0, 5);

    for (const url of targetUrls) {
      try {
        const res = await fetch(url, { headers });
        if (res.ok) {
          const html = await res.text();
          pages.push({
            url,
            html,
            fetchedAt: new Date(),
          });
        }
      } catch (error) {
        console.warn(`[DuPont Sitemap] Failed to fetch sitemap ${url}:`, error);
      }
    }

    return pages;
  }

  override extractListings(page: CrawlPage): RawCrawlerListing[] {
    const listings: RawCrawlerListing[] = [];
    const urls = page.html.match(/https:\/\/[^\s<>\"]+/g) || [];
    const matches = urls.filter((u) => /dupontregistry\.com\/car\/(ferrari|lamborghini)\//i.test(u));

    for (const url of matches) {
      try {
        const parts = url.split("/");
        // URL Format: https://www.dupontregistry.com/car/ferrari/f430--spider/2006/ZFFEW59A760147584/262758
        const make = parts[4] ? parts[4].charAt(0).toUpperCase() + parts[4].slice(1).toLowerCase() : null;
        const rawModel = parts[5] ? parts[5].replace(/--/g, " ").trim() : null;
        const year = parts[6] ? Number(parts[6]) : null;
        const vin = parts[7] || null;
        const externalId = parts[8] || null;

        if (vin && vin.length === 17 && !vin.includes("-")) {
          listings.push({
            sourceName: this.sourceName,
            sourceType: this.sourceType,
            pageUrl: page.url,
            url,
            externalListingId: externalId,
            title: `${year || ""} ${make || ""} ${rawModel || ""}`.trim() || null,
            vin,
            year,
            make,
            model: rawModel,
            trim: null,
            price: null,
            mileage: null,
            color: null,
            location: null,
            dealerName: null,
            images: [],
          });
        }
      } catch {
        // Skip malformed entries
      }
    }

    return listings;
  }
}
