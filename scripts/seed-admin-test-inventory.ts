import { prisma } from "@/lib/prisma";

const TEST_TAG = "[ADMIN TEST]";
const TEST_VIN = "ZFF90TST0R0000001";
const TEST_EXTERNAL_ID = "ADMIN_TEST_DEALER_FLOW_001";
const TEST_SOURCE_NAME = `${TEST_TAG} SUPERCAR DASH Test Dealer`;
const ADMIN_EMAIL = (process.env.ADMIN_TEST_EMAIL || process.env.ADMIN_EMAIL || "admin@supercars.test").toLowerCase();
const TEST_DEALER_EMAIL =
  process.env.TEST_DEALER_EMAIL ||
  process.env.MAIL_REPLY_TO ||
  process.env.ADMIN_EMAIL ||
  "admin@supercardash.vercel.app";
const TEST_WEBSITE = "https://supercardash.vercel.app/admin-test-dealer";
const TEST_LISTING_URL = `https://supercardash.vercel.app/vehicle/${TEST_VIN}`;
const TEST_IMAGE_URL = "/images/admin-test/f8-qa-hero-v1.png";
const TEST_GALLERY_IMAGES = [
  TEST_IMAGE_URL,
  "/images/models/ferrari/488-gtb/hero.jpg",
  "/images/models/ferrari/458-italia/hero.jpg",
  "/images/models/ferrari/f430/hero.jpg",
  "/images/models/ferrari/roma/hero.jpg",
];

async function main() {
  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { email: ADMIN_EMAIL },
        { role: "ADMIN" },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  const admin = existingAdmin
    ? await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          role: "ADMIN",
          name: existingAdmin.name || "SUPERCAR DASH Admin",
        },
      })
    : await prisma.user.create({
        data: {
          email: ADMIN_EMAIL,
          role: "ADMIN",
          name: "SUPERCAR DASH Admin",
          username: "admin-test",
        },
      });


  const ferrari = await prisma.make.upsert({
    where: { slug: "ferrari" },
    update: { name: "Ferrari" },
    create: { name: "Ferrari", slug: "ferrari" },
  });

  const f8Tributo = await prisma.model.upsert({
    where: {
      makeId_slug: {
        makeId: ferrari.id,
        slug: "f8-tributo",
      },
    },
    update: {
      name: "F8 Tributo",
      years: "2020-2022",
      productionStartYear: 2020,
      productionEndYear: 2022,
      category: "Supercar",
      bodyStyle: "Coupe",
      description: "Mid-engine Ferrari V8 supercar used as the admin-only full-data vehicle page QA fixture.",
    },
    create: {
      makeId: ferrari.id,
      name: "F8 Tributo",
      slug: "f8-tributo",
      years: "2020-2022",
      productionStartYear: 2020,
      productionEndYear: 2022,
      category: "Supercar",
      bodyStyle: "Coupe",
      description: "Mid-engine Ferrari V8 supercar used as the admin-only full-data vehicle page QA fixture.",
    },
  });

  await prisma.modelImage.upsert({
    where: {
      modelId_url: {
        modelId: f8Tributo.id,
        url: TEST_IMAGE_URL,
      },
    },
    update: {
      source: "SUPERCAR DASH admin test fixture",
      type: "hero",
    },
    create: {
      modelId: f8Tributo.id,
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
      modelId: f8Tributo.id,
      year: 2022,
      trim: `${TEST_TAG} F8 Tributo QA`,
      manufacturer: "Ferrari",
      color: "Rosso Corsa",
      mileage: 6842,
      bodyStyle: "Coupe",
      vehicleType: "Passenger Car",
      fuelType: "Gasoline",
      engine: "3.9L twin-turbo V8",
      transmission: "7-speed F1 DCT",
      drivetrain: "RWD",
      engineHP: "710",
      plantCountry: "Italy",
      status: "CLAIMED",
      ownerId: admin.id,
      mileageStatus: "COMPLETE",
      vinIdentityStatus: "VALID",
      vinIdentityClassification: "ADMIN_TEST_FIXTURE",
      imageValidationStatus: "VALID_IMAGE",
      inventoryStatus: "ADMIN_TEST",
    },
    create: {
      vin: TEST_VIN,
      modelId: f8Tributo.id,
      year: 2022,
      trim: `${TEST_TAG} F8 Tributo QA`,
      manufacturer: "Ferrari",
      color: "Rosso Corsa",
      mileage: 6842,
      bodyStyle: "Coupe",
      vehicleType: "Passenger Car",
      fuelType: "Gasoline",
      engine: "3.9L twin-turbo V8",
      transmission: "7-speed F1 DCT",
      drivetrain: "RWD",
      engineHP: "710",
      plantCountry: "Italy",
      status: "CLAIMED",
      ownerId: admin.id,
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
      alt: `${TEST_TAG} Ferrari F8 Tributo QA hero image`,
      isPrimary: true,
      validationStatus: "VALID",
    },
    create: {
      id: `${vehicle.id}-admin-test-primary-image`,
      vehicleId: vehicle.id,
      url: TEST_IMAGE_URL,
      alt: `${TEST_TAG} Ferrari F8 Tributo QA hero image`,
      isPrimary: true,
      validationStatus: "VALID",
    },
  });

  await prisma.vehicleImage.deleteMany({ where: { vehicleId: vehicle.id } });

  for (const [index, imageUrl] of TEST_GALLERY_IMAGES.entries()) {
    await prisma.vehicleImage.create({
      data: {
        vehicleId: vehicle.id,
        url: imageUrl,
        alt: `${TEST_TAG} Ferrari F8 Tributo QA image ${index + 1}`,
        isPrimary: index === 0,
        validationStatus: "VALID",
      },
    });
  }

  await prisma.vehiclePhoto.deleteMany({ where: { vehicleId: vehicle.id } });

  for (const [index, imageUrl] of TEST_GALLERY_IMAGES.entries()) {
    await prisma.vehiclePhoto.create({
      data: {
        vehicleId: vehicle.id,
        filePath: imageUrl,
        caption: `${TEST_TAG} Admin QA gallery image ${index + 1}`,
        displayOrder: index,
        isHero: index === 0,
      },
    });
  }

  await prisma.vehicleProfile.upsert({
    where: { vehicleId: vehicle.id },
    update: {
      exteriorColor: "Rosso Corsa",
      interiorColor: "Nero",
      currentMileage: 6842,
      ownerNotes: `${TEST_TAG} Admin-only buyer workflow fixture. Do not publish as real inventory.`,
    },
    create: {
      vehicleId: vehicle.id,
      exteriorColor: "Rosso Corsa",
      interiorColor: "Nero",
      currentMileage: 6842,
      ownerNotes: `${TEST_TAG} Admin-only buyer workflow fixture. Do not publish as real inventory.`,
    },
  });

  await prisma.serviceRecord.deleteMany({ where: { vehicleId: vehicle.id } });
  await prisma.serviceRecord.createMany({
    data: [
      {
        vehicleId: vehicle.id,
        serviceDate: new Date("2025-04-28"),
        mileage: 6321,
        shopName: "Ferrari of Newport Beach",
        description: "[Oil Service] Annual Service · Oil Service · Vehicle Check",
        cost: 1850,
      },
      {
        vehicleId: vehicle.id,
        serviceDate: new Date("2024-11-12"),
        mileage: 5214,
        shopName: "Ferrari of Newport Beach",
        description: "[Brake Service] Brake Fluid Flush · Air Filter Replace",
        cost: 1420,
      },
      {
        vehicleId: vehicle.id,
        serviceDate: new Date("2024-06-18"),
        mileage: 3842,
        shopName: "Ferrari of Newport Beach",
        description: "[Inspection] Tire Rotation · Alignment Check · Health Check",
        cost: 890,
      },
      {
        vehicleId: vehicle.id,
        serviceDate: new Date("2024-01-05"),
        mileage: 1256,
        shopName: "Ferrari of Newport Beach",
        description: "[Delivery] Pre-Delivery Inspection",
        cost: 0,
      },
      {
        vehicleId: vehicle.id,
        serviceDate: new Date("2024-01-05"),
        mileage: 1256,
        shopName: "Ferrari of Newport Beach",
        description: "[Transmission] F1 DCT Adaptation · Gearbox Scan · Clutch Wear Check",
        cost: 0,
      },
      {
        vehicleId: vehicle.id,
        serviceDate: new Date("2024-01-05"),
        mileage: 1256,
        shopName: "Ferrari of Newport Beach",
        description: "[Battery] Electrical System Test · Battery Tender Setup",
        cost: 0,
      },
    ],
  });

  const [exhaustCategory, intakeCategory, ecuCategory, wheelCategory] = await Promise.all([
    prisma.partCategory.findUnique({ where: { slug: "exhaust" } }),
    prisma.partCategory.findUnique({ where: { slug: "intake" } }),
    prisma.partCategory.findUnique({ where: { slug: "ecu-tuning" } }),
    prisma.partCategory.findUnique({ where: { slug: "wheels-tires" } }),
  ]);
  const [brakeCategory, coolingCategory] = await Promise.all([
    prisma.partCategory.findUnique({ where: { slug: "brakes" } }),
    prisma.partCategory.findUnique({ where: { slug: "cooling" } }),
  ]);

  const f8ExhaustPart = await prisma.performancePart.findFirst({
    where: {
      status: "ACTIVE",
      compatibility: {
        some: {
          modelId: f8Tributo.id,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const qaRecommendedParts = [
    {
      brand: "Pagid Racing",
      slug: "pagid-racing",
      categoryId: brakeCategory?.id,
      name: "RS29 Endurance Brake Pad Set",
      price: 48900,
      imageUrl: "/images/admin-test/parts/brake-kit-v1.png",
      hp: null,
      tq: null,
    },
    {
      brand: "Shell",
      slug: "shell",
      categoryId: coolingCategory?.id ?? intakeCategory?.id,
      name: "Helix Ultra 5W-40 Service Kit",
      price: 12900,
      imageUrl: "/images/admin-test/parts/oil-service-kit-v1.png",
      hp: null,
      tq: null,
    },
    {
      brand: "Michelin",
      slug: "michelin",
      categoryId: wheelCategory?.id,
      name: "Pilot Sport 4S Tire Set",
      price: 189900,
      imageUrl: "/images/admin-test/parts/performance-tire-v1.png",
      hp: null,
      tq: null,
    },
  ];

  for (const recommendedPart of qaRecommendedParts) {
    if (!recommendedPart.categoryId) continue;

    const brand = await prisma.partBrand.upsert({
      where: { slug: recommendedPart.slug },
      update: {
        name: recommendedPart.brand,
        active: true,
      },
      create: {
        name: recommendedPart.brand,
        slug: recommendedPart.slug,
        active: true,
      },
    });

    const part = await prisma.performancePart.upsert({
      where: {
        brandId_slug: {
          brandId: brand.id,
          slug: toSlug(`${recommendedPart.name} admin qa`),
        },
      },
      update: {
        categoryId: recommendedPart.categoryId,
        name: recommendedPart.name,
        sourceName: "SUPERCAR DASH admin test fixture",
        sourceUrl: TEST_LISTING_URL,
        sourceConfidence: "ADMIN_TEST",
        status: "ACTIVE",
        imageUrl: recommendedPart.imageUrl,
        retailPriceCents: recommendedPart.price,
        estimatedHpGain: recommendedPart.hp,
        estimatedTorqueGain: recommendedPart.tq,
        trackingStatus: "NOT_CONFIGURED",
      },
      create: {
        categoryId: recommendedPart.categoryId,
        brandId: brand.id,
        name: recommendedPart.name,
        slug: toSlug(`${recommendedPart.name} admin qa`),
        sourceName: "SUPERCAR DASH admin test fixture",
        sourceUrl: TEST_LISTING_URL,
        sourceConfidence: "ADMIN_TEST",
        status: "ACTIVE",
        imageUrl: recommendedPart.imageUrl,
        retailPriceCents: recommendedPart.price,
        estimatedHpGain: recommendedPart.hp,
        estimatedTorqueGain: recommendedPart.tq,
        trackingStatus: "NOT_CONFIGURED",
      },
    });

    await prisma.partCompatibility.deleteMany({
      where: {
        partId: part.id,
        makeId: ferrari.id,
        modelId: f8Tributo.id,
        confidence: "ADMIN_TEST",
      },
    });

    await prisma.partCompatibility.create({
      data: {
        partId: part.id,
        makeId: ferrari.id,
        modelId: f8Tributo.id,
        yearStart: 2020,
        yearEnd: 2022,
        confidence: "ADMIN_TEST",
      },
    });
  }

  await prisma.vehicleInstalledPart.deleteMany({ where: { vehicleId: vehicle.id } });
  await prisma.vehicleModification.deleteMany({ where: { vehicleId: vehicle.id } });

  await prisma.vehicleInstalledPart.createMany({
    data: [
      {
        vehicleId: vehicle.id,
        partId: f8ExhaustPart?.id ?? null,
        categoryId: exhaustCategory?.id ?? null,
        userId: admin.id,
        installedDate: "2025-02-15",
        customName: f8ExhaustPart ? null : "Valved Performance Exhaust",
        customBrandName: f8ExhaustPart ? null : "Novitec",
        hpGainOverride: 18,
        torqueGainOverride: 18,
        verificationStatus: "ADMIN_TEST",
        notes: `${TEST_TAG} Admin QA installed exhaust row.`,
      },
      {
        vehicleId: vehicle.id,
        categoryId: intakeCategory?.id ?? null,
        userId: admin.id,
        installedDate: "2025-02-15",
        customName: "High-Flow Air Filters",
        customBrandName: "BMC",
        hpGainOverride: 12,
        torqueGainOverride: 9,
        verificationStatus: "ADMIN_TEST",
        notes: `${TEST_TAG} Admin QA installed intake row.`,
      },
      {
        vehicleId: vehicle.id,
        categoryId: ecuCategory?.id ?? null,
        userId: admin.id,
        installedDate: "2025-02-20",
        customName: "GTS Black ECU Tune",
        customBrandName: "RaceChip",
        hpGainOverride: 78,
        torqueGainOverride: 65,
        verificationStatus: "ADMIN_TEST",
        notes: `${TEST_TAG} Admin QA installed ECU row.`,
      },
      {
        vehicleId: vehicle.id,
        categoryId: wheelCategory?.id ?? null,
        userId: admin.id,
        installedDate: "2025-01-30",
        customName: "FF15 Lightweight Wheel Set",
        customBrandName: "HRE",
        verificationStatus: "ADMIN_TEST",
        notes: `${TEST_TAG} Admin QA installed wheel row.`,
      },
    ],
  });

  const listing = await prisma.listing.upsert({
    where: {
      sourceId_externalListingId: {
        sourceId: source.id,
        externalListingId: TEST_EXTERNAL_ID,
      },
    },
    update: {
      modelId: f8Tributo.id,
      vehicleId: vehicle.id,
      year: 2022,
      price: 276500,
      askingPrice: 276500,
      mileage: 6842,
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
      modelId: f8Tributo.id,
      sourceId: source.id,
      externalListingId: TEST_EXTERNAL_ID,
      vehicleId: vehicle.id,
      year: 2022,
      price: 276500,
      askingPrice: 276500,
      mileage: 6842,
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
  console.log(`- Admin owner: ${admin.email}`);
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

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
