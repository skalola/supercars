import { PublicPageSource } from "./public-page-source";
import type { CrawlPage } from "../types";

export class CNCMotorsCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "CNC Motors",
      sourceType: "DEALER",
      urls: [],
    });
  }

  override async crawlPages(): Promise<CrawlPage[]> {
    return [];
  }
}
