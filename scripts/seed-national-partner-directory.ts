/**
 * scripts/seed-national-partner-directory.ts
 *
 * Seeds the public PartnerContact directory from curated fulfillment partner
 * registries. Emails are intentionally left null unless already present in the
 * database, so fulfillment outreach still obeys the zero-guessed-email rule.
 *
 * Usage:
 *   npm run seed-national-directory
 */

import { ALL_AUTHORIZED_DEALERS } from "../lib/market-crawlers/dealer-registry";
import { upsertPartnerContact } from "../lib/fulfillment/partner-registry";
import { prisma } from "../lib/prisma";

const nationalTransporters = [
  {
    name: "Reliable Carriers",
    phone: "+1-800-521-6393",
    website: "https://www.reliablecarriers.com",
    location: "Canton, MI",
  },
  {
    name: "Intercity Lines",
    phone: "+1-800-221-3936",
    website: "https://intercitylines.com",
    location: "Warren, MA",
  },
  {
    name: "Horseless Carriage Carriers",
    phone: "+1-800-631-7796",
    website: "https://horselesscarriage.com",
    location: "Paterson, NJ",
  },
  {
    name: "Plycar Automotive Logistics",
    phone: "+1-888-655-2664",
    website: "https://www.plycar.com",
    location: "Kings Park, NY",
  },
  {
    name: "Passport Transport",
    phone: "+1-866-582-3185",
    website: "https://passporttransport.com",
    location: "Lebanon, MO",
  },
  {
    name: "JP Logistics & Motorsports",
    phone: "+1-888-861-6317",
    website: "https://jplogistics.net",
    location: "Sun Valley, CA",
  },
];

const nationalInsurers = [
  {
    name: "Hagerty",
    phone: "+1-877-922-9701",
    website: "https://www.hagerty.com",
    location: "Traverse City, MI",
  },
  {
    name: "Grundy Insurance",
    phone: "+1-888-647-8639",
    website: "https://www.grundy.com",
    location: "Horsham, PA",
  },
  {
    name: "American Collectors Insurance",
    phone: "+1-800-360-2277",
    website: "https://americancollectors.com",
    location: "Cherry Hill, NJ",
  },
  {
    name: "Chubb Collector Car Insurance",
    phone: "+1-866-227-9648",
    website: "https://www.chubb.com/us-en/individuals-families/products/vehicles/collector-car-insurance.html",
    location: "Whitehouse Station, NJ",
  },
  {
    name: "PURE Programs Collector Vehicle",
    phone: "+1-888-813-7873",
    website: "https://www.pureprograms.com",
    location: "White Plains, NY",
  },
];

async function main() {
  let count = 0;

  for (const dealer of ALL_AUTHORIZED_DEALERS) {
    await upsertPartnerContact({
      name: dealer.name,
      type: "DEALER",
      email: null,
      phone: null,
      website: getOrigin(dealer.inventoryUrl),
      sourceDomain: getDomain(dealer.inventoryUrl),
      makeSpecialization: dealer.brand,
      location: `${dealer.city}, ${dealer.state}`,
      confidence: "PUBLIC_SOURCE",
      contactSource: "PUBLIC_WEBSITE",
    });
    count++;

    await upsertPartnerContact({
      name: `${dealer.name} Service`,
      type: "SERVICE_SHOP",
      email: null,
      phone: null,
      website: getOrigin(dealer.inventoryUrl),
      sourceDomain: getDomain(dealer.inventoryUrl),
      makeSpecialization: dealer.brand,
      location: `${dealer.city}, ${dealer.state}`,
      confidence: "PUBLIC_SOURCE",
      contactSource: "PUBLIC_WEBSITE",
    });
    count++;
  }

  for (const transporter of nationalTransporters) {
    await upsertPartnerContact({
      ...transporter,
      type: "TRANSPORTER",
      email: null,
      makeSpecialization: "ALL",
      confidence: "PUBLIC_SOURCE",
      contactSource: "PUBLIC_WEBSITE",
      sourceDomain: getDomain(transporter.website),
      coverage: "NATIONAL",
    });
    count++;
  }

  for (const insurer of nationalInsurers) {
    await upsertPartnerContact({
      ...insurer,
      type: "INSURER",
      email: null,
      makeSpecialization: "ALL",
      confidence: "PUBLIC_SOURCE",
      contactSource: "PUBLIC_WEBSITE",
      sourceDomain: getDomain(insurer.website),
      coverage: "NATIONAL",
    });
    count++;
  }

  console.log(`Seeded/updated ${count} national directory partner contacts.`);
}

function getOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

main()
  .catch((error) => {
    console.error("National partner directory seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
