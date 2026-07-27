import { PublicPageSource } from "./public-page-source";

export class HighYieldSpecialistCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "High-yield Ferrari/Lamborghini specialist dealers",
      sourceType: "DEALER",
      urls: [
        "https://www.lamborghiniparamus.com/cars-for-sale-paramus-nj",
        "https://www.lamborghinipalmbeach.com/cars-for-sale-west-palm-beach-fl",
        "https://www.lamborghiniwashington.com/pre-owned-lamborghini-for-sale-sterling-va.html",
        "https://ferrariofcentralnj.com/pre-owned-inventory/",
        "https://ferrariofhouston.com/pre-owned-inventory/",
      ],
      discoverDetailLinks: true,
      maxDetailPages: 800,
    });
  }
}
