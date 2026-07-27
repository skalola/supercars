import { PublicPageSource } from "./public-page-source";

export class BeverlyHillsCarClubCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "Beverly Hills Car Club",
      sourceType: "DEALER",
      urls: [
        "https://www.beverlyhillscarclub.com/inventory.htm",
        "https://www.beverlyhillscarclub.com/rssfeed.php",
      ],
      discoverDetailLinks: true,
      maxDetailPages: 120,
    });
  }
}
