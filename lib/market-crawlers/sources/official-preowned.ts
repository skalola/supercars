import { PublicPageSource } from "./public-page-source";

const OFFICIAL_PREOWNED_DETAIL_LINK_PATTERNS: RegExp[] = [
  /preowned\.ferrari\.com\/.+\/(?:used-ferrari|auto|detail|vehicle|car)\//i,
  /preowned\.lamborghini\.com\/.+\/(?:vehicle|detail|car|pre-owned)\//i,
  /preowned\.mclaren\.com\/.+\/vehicles?\//i,
  /\/(?:used|pre-owned|certified).*(?:ferrari|lamborghini|mclaren)/i,
  /(?:ferrari|lamborghini|mclaren).*(?:used|pre-owned|certified)/i,
];

export class OfficialPreOwnedCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "Official brand preowned networks",
      sourceType: "DEALER",
      urls: [
        "https://preowned.ferrari.com/en-US/r/north-america/used-ferrari/usa/rfc",
        "https://preowned.lamborghini.com/",
        "https://preowned.mclaren.com/",
      ],
      discoverDetailLinks: true,
      detailLinkPatterns: OFFICIAL_PREOWNED_DETAIL_LINK_PATTERNS,
      maxDetailPages: Number(process.env.OFFICIAL_PREOWNED_MAX_DETAIL_PAGES || 80),
    });
  }
}
