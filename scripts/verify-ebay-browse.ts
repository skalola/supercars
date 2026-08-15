import { searchEbayOffersForFerrariPart } from "../lib/ebay/browse.server";

async function main() {
  try {
    const offers = await searchEbayOffersForFerrariPart({
      partId: "verification",
      partName: "oil filter",
      manufacturer: "Ferrari OEM",
      categorySlug: "maintenance-service",
      compatibleModels: ["458 Italia"],
      limit: 3,
    });
    console.log("success: true");
    console.log(`eligible_offers: ${offers.length}`);
    console.log(`affiliate_urls: ${offers.filter((offer) => Boolean(offer.affiliateUrl)).length}`);
  } catch (error) {
    console.log("success: false");
    console.log(`reason: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}

void main();
