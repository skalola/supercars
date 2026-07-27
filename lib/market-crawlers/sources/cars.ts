import { PublicPageSource } from "./public-page-source";
import type { CrawlPage } from "../types";

export class CarsDotComCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "Cars.com",
      sourceType: "MARKETPLACE",
      urls: [],
    });
  }

  override async crawlPages(): Promise<CrawlPage[]> {
    return [];
  }
}
