import { prisma } from "@/lib/prisma";

const TEST_TAG = "[ADMIN TEST]";
const TEST_VIN = "ZFF90TST0R0000001";
const TEST_EXTERNAL_ID = "ADMIN_TEST_DEALER_FLOW_001";
const TEST_SOURCE_NAME = `${TEST_TAG} SUPERCAR DASH Test Dealer`;
const TEST_DEALER_EMAIL =
  process.env.TEST_DEALER_EMAIL ||
  process.env.MAIL_REPLY_TO ||
  process.env.ADMIN_EMAIL ||
  "admin@supercardash.vercel.app";
const TEST_WEBSITE = "https://supercardash.vercel.app/admin-test-dealer";
const TEST_LISTING_URL = `https://supercardash.vercel.app/vehicle/${TEST_VIN}`;
const TEST_IMAGE_URL =
  "https://images.unsplash.com/photo-1592198084033-aade902d1aae?auto=format&fit=crop&w=1400&q=80";

async function main() {
  const ferrari = await prisma.make.upsert({
    where: { slug: "ferrari" },
    update: { name: "Ferrari" },
    create: { name: "Ferrari", slug: "ferrari" },
  });

  const roma = await prisma.model.upsert({
    where: {
      makeId_slug: {
        makeId: ferrari.id,
        slug: "roma",
      },
    },
    update: {
      name: "Roma",
      category: "Grand Tourer",
      bodyStyle: "Coupe",
    },
    create: {
      makeId: ferrari.id,
      name: "Roma",
      slug: "roma",
      years: "2020-present",
      productionStartYear: 2020,
      category: "Grand Tourer",
      bodyStyle: "Coupe",
      description: "Front-mid-engine Ferrari grand tourer used here as an admin-only test fixture.",
    },
  });

  await prisma.modelImage.upsert({
    where: {
      modelId_url: {
        modelId: roma.id,
        url: TEST_IMAGE_URL,
      },
    },
    update: {
      source: "SUPERCAR DASH admin test fixture",
      type: "hero",
    },
    create: {
      modelId: roma.id,
      url: TEST_IMAGE_URL,
      source: "SUPERCAR DASH admin test fixture",
      type: "hero",
    },
  });

  const source = await prisma.marketSource.upsert({
    where: { name: TEST_SOURCE_NAME },
    update: {
      type: "DEALER",
      website: TEST_WEBSITE,
      active: true,
    },
    create: {
      name: TEST_SOURCE_NAME,
      type: "DEALER",
      website: TEST_WEBSITE,
      active: true,
    },
  });

  const dealer = await prisma.partnerContact.upsert({
    where: { marketSourceId: source.id },
    update: {
      name: TEST_SOURCE_NAME,
      type: "DEALER",
      email: TEST_DEALER_EMAIL,
      phone: "(704) 555-0199",
      website: TEST_WEBSITE,
      sourceDomain: "supercardash.vercel.app",
      makeSpecialization: "Ferrari",
      location: "Charlotte, NC",
      streetAddress: "100 Admin Test Drive",
      city: "Charlotte",
      state: "NC",
      postalCode: "28269",
      country: "US",
      latitude: 35.3526,
      longitude: -80.8279,
      active: true,
      contactSource: "MANUALLY_VERIFIED",
      confidence: "MANUAL_REVIEW",
      contactStatus: "RESOLVED",
      coverage: "LOCAL",
      lastVerifiedAt: new Date(),
    },
    create: {
      name: TEST_SOURCE_NAME,
      type: "DEALER",
      email: TEST_DEALER_EMAIL,
      phone: "(704) 555-0199",
      website: TEST_WEBSITE,
      sourceDomain: "supercardash.vercel.app",
      makeSpecialization: "Ferrari",
      location: "Charlotte, NC",
      streetAddress: "100 Admin Test Drive",
      city: "Charlotte",
      state: "NC",
      postalCode: "28269",
      country: "US",
      latitude: 35.3526,
      longitude: -80.8279,
      active: true,
      contactSource: "MANUALLY_VERIFIED",
      confidence: "MANUAL_REVIEW",
      contactStatus: "RESOLVED",
      coverage: "LOCAL",
      lastVerifiedAt: new Date(),
      marketSourceId: source.id,
    },
  });

  const vehicle = await prisma.vehicle.upsert({
    where: { vin: TEST_VIN },
    update: {
      modelId: roma.id,
      year: 2024,
      trim: `${TEST_TAG} Roma Test Flow`,
      manufacturer: "Ferrari",
      color: "Rosso Corsa",
      mileage: 1240,
      bodyStyle: "Coupe",
      vehicleType: "Passenger Car",
      fuelType: "Gasoline",
      transmission: "Automatic",
      drivetrain: "RWD",
      engineHP: "612",
      plantCountry: "Italy",
      status: "UNCLAIMED",
      mileageStatus: "COMPLETE",
      vinIdentityStatus: "VALID",
      vinIdentityClassification: "ADMIN_TEST_FIXTURE",
      imageValidationStatus: "VALID_IMAGE",
      inventoryStatus: "ADMIN_TEST",
    },
    create: {
      vin: TEST_VIN,
      modelId: roma.id,
      year: 2024,
      trim: `${TEST_TAG} Roma Test Flow`,
      manufacturer: "Ferrari",
      color: "Rosso Corsa",
      mileage: 1240,
      bodyStyle: "Coupe",
      vehicleType: "Passenger Car",
      fuelType: "Gasoline",
      transmission: "Automatic",
      drivetrain: "RWD",
      engineHP: "612",
      plantCountry: "Italy",
      status: "UNCLAIMED",
      mileageStatus: "COMPLETE",
      vinIdentityStatus: "VALID",
      vinIdentityClassification: "ADMIN_TEST_FIXTURE",
      imageValidationStatus: "VALID_IMAGE",
      inventoryStatus: "ADMIN_TEST",
    },
  });

  await prisma.vehicleImage.upsert({
    where: {
      id: `${vehicle.id}-admin-test-primary-image`,
    },
    update: {
      url: TEST_IMAGE_URL,
      alt: `${TEST_TAG} 2024 Ferrari Roma test listing image`,
      isPrimary: true,
      validationStatus: "VALID",
    },
    create: {
      id: `${vehicle.id}-admin-test-primary-image`,
      vehicleId: vehicle.id,
      url: TEST_IMAGE_URL,
      alt: `${TEST_TAG} 2024 Ferrari Roma test listing image`,
      isPrimary: true,
      validationStatus: "VALID",
    },
  });

  await prisma.vehicleProfile.upsert({
    where: { vehicleId: vehicle.id },
    update: {
      exteriorColor: "Rosso Corsa",
      interiorColor: "Nero",
      currentMileage: 1240,
      ownerNotes: `${TEST_TAG} Admin-only buyer workflow fixture. Do not publish as real inventory.`,
    },
    create: {
      vehicleId: vehicle.id,
      exteriorColor: "Rosso Corsa",
      interiorColor: "Nero",
      currentMileage: 1240,
      ownerNotes: `${TEST_TAG} Admin-only buyer workflow fixture. Do not publish as real inventory.`,
    },
  });

  const listing = await prisma.listing.upsert({
    where: {
      sourceId_externalListingId: {
        sourceId: source.id,
        externalListingId: TEST_EXTERNAL_ID,
      },
    },
    update: {
      modelId: roma.id,
      vehicleId: vehicle.id,
      year: 2024,
      price: 309900,
      askingPrice: 309900,
      mileage: 1240,
      color: "Rosso Corsa",
      location: "Charlotte, NC",
      dealerName: TEST_SOURCE_NAME,
      url: TEST_LISTING_URL,
      imageUrl: TEST_IMAGE_URL,
      vinVerified: true,
      validationStatus: "ADMIN_TEST",
      status: "ACTIVE",
      lastSeen: new Date(),
      priceStatus: "VALID_PRICE",
      freshnessStatus: "ACTIVE",
      sourceConfidence: "ADMIN_TEST",
    },
    create: {
      modelId: roma.id,
      sourceId: source.id,
      externalListingId: TEST_EXTERNAL_ID,
      vehicleId: vehicle.id,
      year: 2024,
      price: 309900,
      askingPrice: 309900,
      mileage: 1240,
      color: "Rosso Corsa",
      location: "Charlotte, NC",
      dealerName: TEST_SOURCE_NAME,
      url: TEST_LISTING_URL,
      imageUrl: TEST_IMAGE_URL,
      vinVerified: true,
      validationStatus: "ADMIN_TEST",
      status: "ACTIVE",
      priceStatus: "VALID_PRICE",
      freshnessStatus: "ACTIVE",
      sourceConfidence: "ADMIN_TEST",
    },
  });

  const discovery = await prisma.vinDiscovery.upsert({
    where: { vin: TEST_VIN },
    update: {
      vehicleId: vehicle.id,
      lastSeen: new Date(),
      active: true,
    },
    create: {
      vin: TEST_VIN,
      vehicleId: vehicle.id,
      active: true,
    },
  });

  await prisma.vinDiscoverySource.upsert({
    where: {
      discoveryId_sourceKey: {
        discoveryId: discovery.id,
        sourceKey: TEST_EXTERNAL_ID,
      },
    },
    update: {
      sourceId: source.id,
      sourceName: TEST_SOURCE_NAME,
      url: TEST_LISTING_URL,
      externalListingId: TEST_EXTERNAL_ID,
      lastSeen: new Date(),
      active: true,
    },
    create: {
      discoveryId: discovery.id,
      sourceId: source.id,
      sourceName: TEST_SOURCE_NAME,
      sourceKey: TEST_EXTERNAL_ID,
      url: TEST_LISTING_URL,
      externalListingId: TEST_EXTERNAL_ID,
      active: true,
    },
  });

  console.log("Admin test inventory fixture ready:");
  console.log(`- Dealer: ${dealer.name}`);
  console.log(`- Dealer email: ${dealer.email}`);
  console.log(`- VIN: ${vehicle.vin}`);
  console.log(`- Listing: ${listing.externalListingId}`);
  console.log(`- Admin vehicle URL: /vehicle/${vehicle.vin}`);
}

main()
  .catch((error) => {
    console.error("Failed to seed admin test inventory fixture:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
