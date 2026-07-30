import { PublicPageSource } from "./public-page-source";

export class HemmingsCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "Hemmings",
      sourceType: "MARKETPLACE",
      discoverDetailLinks: true,
      detailLinkPatterns: [/\/classifieds\/cars-for-sale\/(ferrari|lamborghini|mclaren)\//i],
      maxDetailPages: 100,
      urls: [
        "https://www.hemmings.com/classifieds/cars-for-sale/ferrari",
        "https://www.hemmings.com/classifieds/cars-for-sale/lamborghini",
        "https://www.hemmings.com/classifieds/cars-for-sale/mclaren",
      ],
    });
  }
}
