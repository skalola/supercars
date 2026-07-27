import { PublicPageSource } from "./public-page-source";
import type { CrawlPage } from "../types";

export class EuropeanCollectiblesCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "European Collectibles",
      sourceType: "DEALER",
      urls: [],
    });
  }

  override async crawlPages(): Promise<CrawlPage[]> {
    return [];
  }
}
