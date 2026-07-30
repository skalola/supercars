import { prisma } from "@/lib/prisma";
import { upsertPartnerContact, type PartnerType } from "@/lib/fulfillment/partner-registry";

type KnownContact = {
  sourceName: string;
  name: string;
  type: PartnerType;
  email: string;
  phone: string;
  website: string;
  sourceDomain: string;
  makeSpecialization: string;
  location: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  confidence: "PUBLIC_SOURCE" | "MANUAL_REVIEW";
};

const knownContacts: KnownContact[] = [
  {
    sourceName: "Foreign Cars Italia Charlotte",
    name: "Foreign Cars Italia Charlotte",
    type: "DEALER",
    email: "sales@foreigncarsitaliacharlotte.com",
    phone: "(704) 755-3233",
    website: "https://charlotte.ferraridealers.com/en-US",
    sourceDomain: "charlotte.ferraridealers.com",
    makeSpecialization: "Ferrari",
    location: "Charlotte, NC",
    streetAddress: "416 Tyvola Road",
    city: "Charlotte",
    state: "NC",
    postalCode: "28217",
    latitude: 35.1795,
    longitude: -80.8867,
    confidence: "PUBLIC_SOURCE",
  },
  {
    sourceName: "Foreign Cars Italia Charlotte",
    name: "Foreign Cars Italia Charlotte Service",
    type: "SERVICE_SHOP",
    email: "mbernstein@foreigncarscharlotte.com",
    phone: "(704) 610-4975",
    website: "https://www.foreigncarscharlotte.com/service-department",
    sourceDomain: "foreigncarscharlotte.com",
    makeSpecialization: "Ferrari",
    location: "Charlotte, NC",
    streetAddress: "400 Tyvola Road",
    city: "Charlotte",
    state: "NC",
    postalCode: "28217",
    latitude: 35.1802,
    longitude: -80.8873,
    confidence: "MANUAL_REVIEW",
  },
  {
    sourceName: "Foreign Cars Italia Greensboro",
    name: "Foreign Cars Italia Greensboro",
    type: "DEALER",
    email: "sales@foreigncarsitalia.com",
    phone: "(336) 252-5588",
    website: "https://greensboro.ferraridealers.com/en-US",
    sourceDomain: "greensboro.ferraridealers.com",
    makeSpecialization: "Ferrari",
    location: "Greensboro, NC",
    streetAddress: "5603 Roanne Way",
    city: "Greensboro",
    state: "NC",
    postalCode: "27409",
    latitude: 36.0726,
    longitude: -79.8897,
    confidence: "MANUAL_REVIEW",
  },
  {
    sourceName: "Foreign Cars Italia Greensboro",
    name: "Foreign Cars Italia Greensboro Service",
    type: "SERVICE_SHOP",
    email: "service@foreigncarsitalia.com",
    phone: "(336) 810-0177",
    website: "https://www.foreigncarsitalia.com/ferrari-service",
    sourceDomain: "foreigncarsitalia.com",
    makeSpecialization: "Ferrari",
    location: "Greensboro, NC",
    streetAddress: "5603 Roanne Way",
    city: "Greensboro",
    state: "NC",
    postalCode: "27409",
    latitude: 36.0726,
    longitude: -79.8897,
    confidence: "MANUAL_REVIEW",
  },
];

async function main() {
  const restored = [];

  for (const contact of knownContacts) {
    const marketSource = await prisma.marketSource.upsert({
      where: { name: contact.sourceName },
      update: {
        type: "DEALER",
        website: contact.website,
        active: true,
      },
      create: {
        name: contact.sourceName,
        type: "DEALER",
        website: contact.website,
        active: true,
      },
    });

    const restoredContact = await upsertPartnerContact({
      ...contact,
      marketSourceId: contact.type === "DEALER" ? marketSource.id : null,
      contactSource: "PUBLIC_WEBSITE",
      active: true,
      coverage: "LOCAL",
    });

    restored.push({
      name: restoredContact.name,
      type: restoredContact.type,
      email: restoredContact.email,
      phone: restoredContact.phone,
      active: restoredContact.active,
      city: restoredContact.city,
      state: restoredContact.state,
    });
  }

  console.log(JSON.stringify({ restored }, null, 2));
}

main()
  .catch((error) => {
    console.error("Known dealer contact restore failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
