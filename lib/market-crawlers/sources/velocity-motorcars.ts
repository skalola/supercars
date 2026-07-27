import { PublicPageSource } from "./public-page-source";
import type { CrawlPage } from "../types";

export class VelocityMotorcarsCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "Velocity Motorcars",
      sourceType: "DEALER",
      urls: [],
    });
  }

  override async crawlPages(): Promise<CrawlPage[]> {
    return [];
  }
}
