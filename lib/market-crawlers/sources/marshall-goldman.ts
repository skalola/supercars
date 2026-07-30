import { PublicPageSource } from "./public-page-source";
import type { CrawlPage, RawCrawlerListing } from "../types";
import { SUPPORTED_MAKES } from "@/lib/supported-makes";

interface MarshallGoldmanApiVehicle {
  id: string;
  type: string;
  sold: string;
  stockno: string;
  vin: string;
  year: string;
  make: string;
  location: string;
  model: string;
  trim: string;
  mileage: string;
  ext_color: string;
  int_color: string;
  body: string;
  image_exists: string;
  pending_sale: string;
  price: string;
  discount_price: string;
  image_link: string;
  url_link: string;
  vehicle_name: string;
}

export class MarshallGoldmanCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "Marshall Goldman",
      sourceType: "DEALER",
      urls: ["https://www.marshallgoldman.com/api/cars/"],
    });
  }

  override async crawlPages(): Promise<CrawlPage[]> {
    try {
      const res = await fetch("https://www.marshallgoldman.com/api/cars/", {
        headers: {
          "accept": "application/json",
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!res.ok) {
        console.warn(`[Marshall Goldman] API returned status ${res.status}`);
        return [];
      }

      const html = await res.text();
      return [
        {
          url: "https://www.marshallgoldman.com/api/cars/",
          html,
          fetchedAt: new Date(),
        },
      ];
    } catch (error) {
      console.warn(
        "[Marshall Goldman] Failed to fetch API:",
        error instanceof Error ? error.message : error
      );
      return [];
    }
  }

  override extractListings(page: CrawlPage): RawCrawlerListing[] {
    try {
      const data = JSON.parse(page.html) as MarshallGoldmanApiVehicle[];
      if (!Array.isArray(data)) return [];

      const activeExotics = data.filter(
        (v) =>
          v &&
          typeof v === "object" &&
          (SUPPORTED_MAKES as readonly string[]).includes(v.make) &&
          v.sold === "Available"
      );

      return activeExotics.map((v) => {
        const cleanTrim = v.trim ? v.trim.replace(/^[-\s]+/, "").trim() : null;
        const price =
          Number(v.price) > 0
            ? Math.round(Number(v.price))
            : Number(v.discount_price) > 0
            ? Math.round(Number(v.discount_price))
            : null;

        return {
          sourceName: this.sourceName,
          sourceType: this.sourceType,
          pageUrl: page.url,
          url: v.url_link ? `https://www.marshallgoldman.com${v.url_link}` : null,
          externalListingId: v.stockno || v.id,
          title: v.vehicle_name || null,
          vin: v.vin || null,
          year: v.year ? Number(v.year) : null,
          make: v.make || null,
          model: v.model || null,
          trim: cleanTrim || null,
          price,
          mileage: v.mileage ? Math.round(Number(v.mileage)) : null,
          color: v.ext_color || null,
          location: v.location || null,
          dealerName: `Marshall Goldman ${v.location || ""}`.trim(),
          images: v.image_link ? [v.image_link] : [],
        };
      });
    } catch (error) {
      console.warn(
        "[Marshall Goldman] Failed to parse listings:",
        error instanceof Error ? error.message : error
      );
      return [];
    }
  }
}
