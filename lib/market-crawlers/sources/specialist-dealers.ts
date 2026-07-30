import { PublicPageSource } from "./public-page-source";

function specialistUrls(): string[] {
  const configured = process.env.SPECIALIST_DEALER_INVENTORY_URLS;
  if (configured) {
    return configured
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean);
  }

  return [
    "https://ferrarisanfrancisco.com/pre-owned-inventory/",
    "https://www.lamborghinihouston.com/searchused.aspx",
    "https://www.lamborghinipalmbeach.com/inventory",
    "https://www.lamborghinisandiego.com/used-inventory/",
    "https://www.ogaracoach.com/used-inventory/",
    "https://www.mclarencharlotte.com/used-vehicles/",
    "https://www.mclarenphl.com/used-inventory/index.htm",
    "https://www.mclarenhouston.com/used-vehicles/",
  ];
}

export class SpecialistDealerCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "Supported supercar specialist dealers",
      sourceType: "DEALER",
      discoverDetailLinks: true,
      maxDetailPages: 500,
      urls: specialistUrls(),
    });
  }
}
