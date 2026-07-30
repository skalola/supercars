import { PublicPageSource } from "./public-page-source";

export class CuratedCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "Curated",
      sourceType: "DEALER",
      urls: [
        "https://www.wearecurated.com/inventory",
        "https://www.wearecurated.com/inventory?c5ad846e_page=2",
        "https://www.wearecurated.com/inventory?c5ad846e_page=3",
      ],
      discoverDetailLinks: true,
      detailLinkPatterns: [/\/inventory\/.+(?:ferrari|lamborghini|mclaren)/i],
      maxDetailPages: 120,
    });
  }
}
