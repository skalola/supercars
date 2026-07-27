import { prisma } from "@/lib/prisma";
import { createFulfillmentRequest } from "@/lib/fulfillment/service";

const adminEmail = process.env.ADMIN_TEST_EMAIL || "admin@supercars.test";

async function ensureAdminUser() {
  return prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: "SUPERCARS Admin", role: "ADMIN" },
    create: { email: adminEmail, name: "SUPERCARS Admin", role: "ADMIN" },
  });
}

async function ensureVehicleAndListing() {
  const make = await prisma.make.upsert({
    where: { slug: "ferrari" },
    update: {},
    create: { name: "Ferrari", slug: "ferrari" },
  });

  const model = await prisma.model.upsert({
    where: { makeId_slug: { makeId: make.id, slug: "f8-tributo" } },
    update: {},
    create: { makeId: make.id, name: "F8 Tributo", slug: "f8-tributo", years: "2020-2023" },
  });

  const vehicle = await prisma.vehicle.upsert({
    where: { vin: "ZFF92LLA0L0250001" },
    update: { modelId: model.id, year: 2020, trim: "Tributo", mileage: 4200, color: "Rosso Corsa" },
    create: {
      vin: "ZFF92LLA0L0250001",
      modelId: model.id,
      year: 2020,
      trim: "Tributo",
      mileage: 4200,
      color: "Rosso Corsa",
      status: "UNCLAIMED",
    },
  });

  const source = await prisma.marketSource.upsert({
    where: { name: "Ferrari Miami Demo Source" },
    update: { type: "DEALER", active: true },
    create: { name: "Ferrari Miami Demo Source", type: "DEALER", active: true },
  });

  const existing = await prisma.listing.findFirst({
    where: { sourceId: source.id, externalListingId: "DEMO-F8-250001" },
  });

  const listing = existing
    ? await prisma.listing.update({
        where: { id: existing.id },
        data: { vehicleId: vehicle.id, price: 329000, askingPrice: 329000, status: "ACTIVE" },
      })
    : await prisma.listing.create({
        data: {
          modelId: model.id,
          sourceId: source.id,
          externalListingId: "DEMO-F8-250001",
          year: 2020,
          price: 329000,
          askingPrice: 329000,
          mileage: 4200,
          color: "Rosso Corsa",
          dealerName: "Ferrari Miami Demo Source",
          url: "https://example.test/ferrari-miami-demo-f8",
          vehicleId: vehicle.id,
          status: "ACTIVE",
          vinVerified: true,
        },
      });

  return { vehicle, listing };
}

async function clearExistingDemoRequests() {
  await prisma.fulfillmentRequest.deleteMany({
    where: { notes: { contains: "FULFILLMENT_DEMO_SEED" } },
  });
}

async function seed() {
  const admin = await ensureAdminUser();
  const { vehicle, listing } = await ensureVehicleAndListing();
  await clearExistingDemoRequests();

  const baseBuyer = {
    partyType: "BUYER" as const,
    userId: admin.id,
    name: "Demo Buyer",
    email: admin.email || adminEmail,
    roleDescription: "Logged-in buyer testing fulfillment",
  };

  const scenarios = [
    {
      requestType: "DEALER_PURCHASE" as const,
      packageTitle: "Dealer Purchase Package",
      packageDescription: "Ready-to-process purchase request for dealer review.",
      partnerName: "Ferrari Miami Sales",
      partnerEmail: "sales@example.test",
      partnerPartyType: "DEALER" as const,
      feeType: "COMMISSION" as const,
      fee: 3290,
      deposit: 1000,
    },
    {
      requestType: "INSURANCE_QUOTE" as const,
      packageTitle: "Insurance Referral Package",
      packageDescription: "Standardized quote request for exotic vehicle coverage.",
      partnerName: "Demo Collector Insurance",
      partnerEmail: "quotes@example.test",
      partnerPartyType: "INSURANCE_CARRIER" as const,
      feeType: "REFERRAL_FEE" as const,
      fee: 250,
      deposit: 0,
    },
    {
      requestType: "TRANSPORT_QUOTE" as const,
      packageTitle: "Enclosed Transport Request",
      packageDescription: "Pickup, delivery, and vehicle details for enclosed transport.",
      partnerName: "Demo Enclosed Transport",
      partnerEmail: "dispatch@example.test",
      partnerPartyType: "TRANSPORT_PROVIDER" as const,
      feeType: "TRANSPORT_FEE" as const,
      fee: 450,
      deposit: 250,
    },
    {
      requestType: "SERVICE_BOOKING" as const,
      packageTitle: "Service Booking Package",
      packageDescription: "Vehicle Passport service request for certified shop review.",
      partnerName: "Ferrari Miami Service",
      partnerEmail: "service@example.test",
      partnerPartyType: "SERVICE_CENTER" as const,
      feeType: "SERVICE_FEE" as const,
      fee: 100,
      deposit: 100,
    },
  ];

  for (const scenario of scenarios) {
    await createFulfillmentRequest({
      requestType: scenario.requestType,
      status: "SENT",
      buyerId: admin.id,
      vehicleId: vehicle.id,
      listingId: listing.id,
      notes: `FULFILLMENT_DEMO_SEED ${scenario.requestType}`,
      packageTitle: scenario.packageTitle,
      packageDescription: scenario.packageDescription,
      scopedPackageData: {
        vin: vehicle.vin,
        year: vehicle.year,
        make: "Ferrari",
        model: "F8 Tributo",
        trim: vehicle.trim,
        mileage: vehicle.mileage,
        askingPrice: listing.askingPrice,
        listingUrl: listing.url,
        buyerName: "Demo Buyer",
        buyerEmail: admin.email || adminEmail,
        partnerAction: "Accept, decline, or ignore this request from the tokenized URL.",
      },
      parties: [
        baseBuyer,
        {
          partyType: scenario.partnerPartyType,
          name: scenario.partnerName,
          email: scenario.partnerEmail,
          companyName: scenario.partnerName,
          roleDescription: "Fulfillment partner",
        },
        {
          partyType: "PLATFORM",
          name: "SUPERCARS",
          email: "ops@supercars.test",
          roleDescription: "Commission and transaction coordinator",
        },
      ],
      fees: [
        {
          feeType: scenario.feeType,
          amount: scenario.fee,
          status: scenario.deposit > 0 ? "AUTHORIZED" : "ESTIMATED",
          description: "SUPERCARS fee tracked in ledger; capture depends on partner acceptance.",
        },
      ],
      depositIntent: scenario.deposit > 0
        ? {
            amount: scenario.deposit,
            paymentMethod: "DEMO_AUTHORIZATION_ONLY",
            transactionRef: `DEMO_AUTH_${scenario.requestType}`,
          }
        : undefined,
      partnerName: scenario.partnerName,
      partnerEmail: scenario.partnerEmail,
      partnerExpiresInDays: 7,
    });
  }

  console.log(`Seeded admin login: ${adminEmail} / ${process.env.ADMIN_TEST_PASSWORD || "supercars-admin"}`);
  console.log("Seeded 4 demo fulfillment transactions.");
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
