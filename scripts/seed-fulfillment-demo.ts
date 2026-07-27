import { prisma } from "@/lib/prisma";
import {
  createFulfillmentRequest,
  executePartnerDecisionByAction,
} from "@/lib/fulfillment/service";

const adminEmail = (process.env.ADMIN_TEST_EMAIL || "admin@supercars.test").toLowerCase();
const userEmail = (process.env.USER_TEST_EMAIL || "user@supercars.test").toLowerCase();
const fixtureTag = "SPRINT9B_TEST_FIXTURE";

type SeededRequest = {
  label: string;
  id: string;
  token: string;
  status: string;
};

async function ensureTestUsers() {
  const [admin, user] = await Promise.all([
    prisma.user.upsert({
      where: { email: adminEmail },
      update: { name: "SUPERCARS Admin", role: "ADMIN" },
      create: { email: adminEmail, name: "SUPERCARS Admin", role: "ADMIN" },
    }),
    prisma.user.upsert({
      where: { email: userEmail },
      update: { name: "SUPERCARS Test User", role: "USER" },
      create: { email: userEmail, name: "SUPERCARS Test User", role: "USER" },
    }),
  ]);

  return { admin, user };
}

async function ensureModel(makeName: string, makeSlug: string, modelName: string, modelSlug: string, years: string) {
  const make = await prisma.make.upsert({
    where: { slug: makeSlug },
    update: {},
    create: { name: makeName, slug: makeSlug },
  });

  return prisma.model.upsert({
    where: { makeId_slug: { makeId: make.id, slug: modelSlug } },
    update: { name: modelName, years },
    create: { makeId: make.id, name: modelName, slug: modelSlug, years },
  });
}

async function ensureFixtureInventory(adminId: string, userId: string) {
  const [ferrariF8, lamborghiniHuracan] = await Promise.all([
    ensureModel("Ferrari", "ferrari", "F8 Tributo", "f8-tributo", "2020-2023"),
    ensureModel("Lamborghini", "lamborghini", "Huracan", "huracan", "2015-2024"),
  ]);

  const [saleSource, serviceSource] = await Promise.all([
    prisma.marketSource.upsert({
      where: { name: "SUPERCARS 9B Ferrari Test Source" },
      update: { type: "DEALER", active: true, website: "https://example.test/supercars-9b-ferrari" },
      create: {
        name: "SUPERCARS 9B Ferrari Test Source",
        type: "DEALER",
        active: true,
        website: "https://example.test/supercars-9b-ferrari",
      },
    }),
    prisma.marketSource.upsert({
      where: { name: "SUPERCARS 9B Lamborghini Service Source" },
      update: { type: "DEALER", active: true, website: "https://example.test/supercars-9b-lamborghini" },
      create: {
        name: "SUPERCARS 9B Lamborghini Service Source",
        type: "DEALER",
        active: true,
        website: "https://example.test/supercars-9b-lamborghini",
      },
    }),
  ]);

  const [saleVehicle, serviceVehicle] = await Promise.all([
    prisma.vehicle.upsert({
      where: { vin: "ZFF92LLA0L0259001" },
      update: {
        modelId: ferrariF8.id,
        year: 2020,
        trim: "Tributo",
        mileage: 4200,
        color: "Rosso Corsa",
        status: "UNCLAIMED",
        ownerId: adminId,
      },
      create: {
        vin: "ZFF92LLA0L0259001",
        modelId: ferrariF8.id,
        year: 2020,
        trim: "Tributo",
        mileage: 4200,
        color: "Rosso Corsa",
        status: "UNCLAIMED",
        ownerId: adminId,
      },
    }),
    prisma.vehicle.upsert({
      where: { vin: "ZHWUC1ZF0HLA06901" },
      update: {
        modelId: lamborghiniHuracan.id,
        year: 2017,
        trim: "LP 610-4",
        mileage: 11600,
        color: "Bianco Monocerus",
        status: "CLAIMED",
        ownerId: userId,
      },
      create: {
        vin: "ZHWUC1ZF0HLA06901",
        modelId: lamborghiniHuracan.id,
        year: 2017,
        trim: "LP 610-4",
        mileage: 11600,
        color: "Bianco Monocerus",
        status: "CLAIMED",
        ownerId: userId,
      },
    }),
  ]);

  const existingSaleListing = await prisma.listing.findFirst({
    where: { sourceId: saleSource.id, externalListingId: "SPRINT9B-F8-TEST-001" },
  });
  const saleListing = existingSaleListing
    ? await prisma.listing.update({
        where: { id: existingSaleListing.id },
        data: {
          vehicleId: saleVehicle.id,
          sellerId: adminId,
          modelId: ferrariF8.id,
          year: saleVehicle.year,
          price: 329000,
          askingPrice: 329000,
          mileage: saleVehicle.mileage,
          color: saleVehicle.color,
          dealerName: "SUPERCARS 9B Ferrari Test Source",
          url: "https://example.test/supercars-9b-ferrari-f8",
          status: "ACTIVE",
          vinVerified: true,
        },
      })
    : await prisma.listing.create({
        data: {
          modelId: ferrariF8.id,
          sourceId: saleSource.id,
          externalListingId: "SPRINT9B-F8-TEST-001",
          year: saleVehicle.year,
          price: 329000,
          askingPrice: 329000,
          mileage: saleVehicle.mileage,
          color: saleVehicle.color,
          dealerName: "SUPERCARS 9B Ferrari Test Source",
          url: "https://example.test/supercars-9b-ferrari-f8",
          vehicleId: saleVehicle.id,
          sellerId: adminId,
          status: "ACTIVE",
          vinVerified: true,
        },
      });

  const existingServiceListing = await prisma.listing.findFirst({
    where: { sourceId: serviceSource.id, externalListingId: "SPRINT9B-HURACAN-SERVICE-001" },
  });
  const serviceListing = existingServiceListing
    ? await prisma.listing.update({
        where: { id: existingServiceListing.id },
        data: {
          vehicleId: serviceVehicle.id,
          sellerId: userId,
          modelId: lamborghiniHuracan.id,
          year: serviceVehicle.year,
          price: 219000,
          askingPrice: 219000,
          mileage: serviceVehicle.mileage,
          color: serviceVehicle.color,
          dealerName: "SUPERCARS 9B Lamborghini Service Source",
          url: "https://example.test/supercars-9b-lamborghini-service",
          status: "ACTIVE",
          vinVerified: true,
        },
      })
    : await prisma.listing.create({
        data: {
          modelId: lamborghiniHuracan.id,
          sourceId: serviceSource.id,
          externalListingId: "SPRINT9B-HURACAN-SERVICE-001",
          year: serviceVehicle.year,
          price: 219000,
          askingPrice: 219000,
          mileage: serviceVehicle.mileage,
          color: serviceVehicle.color,
          dealerName: "SUPERCARS 9B Lamborghini Service Source",
          url: "https://example.test/supercars-9b-lamborghini-service",
          vehicleId: serviceVehicle.id,
          sellerId: userId,
          status: "ACTIVE",
          vinVerified: true,
        },
      });

  return { saleVehicle, serviceVehicle, saleListing, serviceListing };
}

async function cleanupOldFixtureRequests() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to reset fulfillment requests while NODE_ENV=production.");
  }

  const result = await prisma.fulfillmentRequest.deleteMany({
    where: {},
  });

  return result.count;
}

function vehicleScope(vehicle: {
  vin: string;
  year: number;
  trim: string | null;
  mileage: number | null;
  color: string | null;
}, listingUrl: string, askingPrice?: number | null) {
  return {
    vin: vehicle.vin,
    year: vehicle.year,
    trim: vehicle.trim,
    mileage: vehicle.mileage,
    color: vehicle.color,
    listingUrl,
    askingPrice,
    fixture: fixtureTag,
  };
}

async function createSeededRequests(params: Awaited<ReturnType<typeof ensureTestUsers>> & Awaited<ReturnType<typeof ensureFixtureInventory>>) {
  const buyerParty = {
    partyType: "BUYER" as const,
    userId: params.user.id,
    name: params.user.name || "SUPERCARS Test User",
    email: params.user.email || userEmail,
    roleDescription: "Regular user testing buyer-facing fulfillment",
  };

  const ownerParty = {
    partyType: "SELLER" as const,
    userId: params.admin.id,
    name: params.admin.name || "SUPERCARS Admin",
    email: params.admin.email || adminEmail,
    roleDescription: "Seller/owner fixture visible to admin operations",
  };

  const created: SeededRequest[] = [];

  const dealerPurchase = await createFulfillmentRequest({
    requestType: "DEALER_PURCHASE",
    status: "SENT",
    buyerId: params.user.id,
    vehicleId: params.saleVehicle.id,
    listingId: params.saleListing.id,
    notes: `${fixtureTag} DEALER_PURCHASE`,
    packageTitle: "Dealer Purchase Package",
    packageDescription: "Ready-to-process purchase request for dealer review.",
    scopedPackageData: {
      ...vehicleScope(params.saleVehicle, params.saleListing.url || "", params.saleListing.askingPrice),
      make: "Ferrari",
      model: "F8 Tributo",
      buyerName: buyerParty.name,
      buyerEmail: buyerParty.email,
      transactionScenario: "Pending dealer response with authorized deposit.",
    },
    parties: [
      buyerParty,
      ownerParty,
      {
        partyType: "DEALER",
        name: "Ferrari Miami Sales",
        email: "sales@ferrarimiami.com",
        companyName: "Ferrari Miami Sales",
        roleDescription: "Dealer purchase fulfillment partner",
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
        feeType: "COMMISSION",
        amount: 3290,
        status: "AUTHORIZED",
        description: "SUPERCARS commission authorized; capture depends on dealer acceptance.",
      },
    ],
    depositIntent: {
      amount: 1000,
      paymentMethod: "SPRINT9B_LEDGER_AUTH_ONLY",
      transactionRef: "SPRINT9B_DEALER_PURCHASE_AUTH",
    },
    partnerName: "Ferrari Miami Sales",
    partnerEmail: "sales@ferrarimiami.com",
    partnerExpiresInDays: 7,
  });
  created.push({
    label: "dealer purchase pending",
    id: dealerPurchase.id,
    token: dealerPurchase.publicTransactionToken,
    status: dealerPurchase.status,
  });

  const insuranceQuote = await createFulfillmentRequest({
    requestType: "INSURANCE_QUOTE",
    status: "SENT",
    buyerId: params.user.id,
    vehicleId: params.saleVehicle.id,
    listingId: params.saleListing.id,
    notes: `${fixtureTag} INSURANCE_QUOTE`,
    packageTitle: "Insurance Referral Package",
    packageDescription: "Collector insurance quote request for test buyer review.",
    scopedPackageData: {
      ...vehicleScope(params.saleVehicle, params.saleListing.url || "", params.saleListing.askingPrice),
      make: "Ferrari",
      model: "F8 Tributo",
      coverageType: "Collector stated-value policy",
      transactionScenario: "Accepted insurer quote request without deposit capture.",
    },
    parties: [
      buyerParty,
      {
        partyType: "INSURANCE_CARRIER",
        name: "Demo Collector Insurance",
        email: "quotes@hagerty.com",
        companyName: "Demo Collector Insurance",
        roleDescription: "Insurance quote fulfillment partner",
      },
      {
        partyType: "PLATFORM",
        name: "SUPERCARS",
        email: "ops@supercars.test",
        roleDescription: "Referral coordinator",
      },
    ],
    fees: [
      {
        feeType: "REFERRAL_FEE",
        amount: 250,
        status: "ESTIMATED",
        description: "SUPERCARS referral fee tracked after partner fulfillment.",
      },
    ],
    partnerName: "Demo Collector Insurance",
    partnerEmail: "quotes@hagerty.com",
    partnerExpiresInDays: 7,
  });
  await executePartnerDecisionByAction(
    insuranceQuote.partnerTokens[0].token,
    "ACCEPT",
    "Sprint 9B fixture insurer accepted the quote request.",
    { submittedVia: "SERVICE", routePath: "scripts/seed-fulfillment-demo.ts" }
  );
  const acceptedInsurance = await prisma.fulfillmentRequest.findUniqueOrThrow({ where: { id: insuranceQuote.id } });
  created.push({
    label: "insurance quote accepted",
    id: acceptedInsurance.id,
    token: acceptedInsurance.publicTransactionToken,
    status: acceptedInsurance.status,
  });

  const transportQuote = await createFulfillmentRequest({
    requestType: "TRANSPORT_QUOTE",
    status: "SENT",
    buyerId: params.user.id,
    vehicleId: params.saleVehicle.id,
    listingId: params.saleListing.id,
    notes: `${fixtureTag} TRANSPORT_QUOTE`,
    packageTitle: "Enclosed Transport Quote",
    packageDescription: "Pickup and delivery request for enclosed carrier review.",
    scopedPackageData: {
      ...vehicleScope(params.saleVehicle, params.saleListing.url || "", params.saleListing.askingPrice),
      make: "Ferrari",
      model: "F8 Tributo",
      pickup: "Miami, FL",
      delivery: "Austin, TX",
      transactionScenario: "Declined transporter with released authorization.",
    },
    parties: [
      buyerParty,
      {
        partyType: "TRANSPORT_PROVIDER",
        name: "Demo Enclosed Transport",
        email: "dispatch@reliablecarriers.com",
        companyName: "Demo Enclosed Transport",
        roleDescription: "Transport quote fulfillment partner",
      },
      {
        partyType: "PLATFORM",
        name: "SUPERCARS",
        email: "ops@supercars.test",
        roleDescription: "Transport fee coordinator",
      },
    ],
    fees: [
      {
        feeType: "TRANSPORT_FEE",
        amount: 450,
        status: "AUTHORIZED",
        description: "Transport coordination fee authorized until partner decision.",
      },
    ],
    depositIntent: {
      amount: 250,
      paymentMethod: "SPRINT9B_LEDGER_AUTH_ONLY",
      transactionRef: "SPRINT9B_TRANSPORT_AUTH",
    },
    partnerName: "Demo Enclosed Transport",
    partnerEmail: "dispatch@reliablecarriers.com",
    partnerExpiresInDays: 3,
  });
  await executePartnerDecisionByAction(
    transportQuote.partnerTokens[0].token,
    "DECLINE",
    "Sprint 9B fixture transporter declined the route.",
    { submittedVia: "SERVICE", routePath: "scripts/seed-fulfillment-demo.ts" }
  );
  const declinedTransport = await prisma.fulfillmentRequest.findUniqueOrThrow({ where: { id: transportQuote.id } });
  created.push({
    label: "transport quote declined",
    id: declinedTransport.id,
    token: declinedTransport.publicTransactionToken,
    status: declinedTransport.status,
  });

  const serviceBooking = await createFulfillmentRequest({
    requestType: "SERVICE_BOOKING",
    status: "SENT",
    buyerId: params.user.id,
    vehicleId: params.serviceVehicle.id,
    listingId: params.serviceListing.id,
    notes: `${fixtureTag} SERVICE_BOOKING`,
    packageTitle: "Service Booking Package",
    packageDescription: "Vehicle Passport service request for certified shop review.",
    scopedPackageData: {
      ...vehicleScope(params.serviceVehicle, params.serviceListing.url || "", params.serviceListing.askingPrice),
      make: "Lamborghini",
      model: "Huracan",
      requestedService: "Annual service and inspection",
      transactionScenario: "Owner-visible service request awaiting shop response.",
    },
    parties: [
      {
        partyType: "BUYER",
        userId: params.user.id,
        name: params.user.name || "SUPERCARS Test User",
        email: params.user.email || userEmail,
        roleDescription: "Vehicle owner requesting service",
      },
      {
        partyType: "SELLER",
        userId: params.user.id,
        name: params.user.name || "SUPERCARS Test User",
        email: params.user.email || userEmail,
        roleDescription: "Vehicle owner scoped into owner transaction view",
      },
      {
        partyType: "SERVICE_CENTER",
        name: "Ferrari Miami Service",
        email: "service@ferrarimiami.com",
        companyName: "Ferrari Miami Service",
        roleDescription: "Service booking fulfillment partner",
      },
      {
        partyType: "PLATFORM",
        name: "SUPERCARS",
        email: "ops@supercars.test",
        roleDescription: "Booking fee coordinator",
      },
    ],
    fees: [
      {
        feeType: "SERVICE_FEE",
        amount: 100,
        status: "AUTHORIZED",
        description: "SUPERCARS booking fee authorized until shop acceptance.",
      },
    ],
    depositIntent: {
      amount: 100,
      paymentMethod: "SPRINT9B_LEDGER_AUTH_ONLY",
      transactionRef: "SPRINT9B_SERVICE_AUTH",
    },
    partnerName: "Ferrari Miami Service",
    partnerEmail: "service@ferrarimiami.com",
    partnerExpiresInDays: 3,
  });
  created.push({
    label: "service booking pending",
    id: serviceBooking.id,
    token: serviceBooking.publicTransactionToken,
    status: serviceBooking.status,
  });

  return created;
}

async function main() {
  process.env.MAIL_PROVIDER ||= "log";
  process.env.PAYMENT_PROVIDER ||= "ledger";

  const users = await ensureTestUsers();
  const inventory = await ensureFixtureInventory(users.admin.id, users.user.id);
  const deletedCount = await cleanupOldFixtureRequests();
  const created = await createSeededRequests({ ...users, ...inventory });

  console.log(`Cleaned ${deletedCount} local fulfillment request${deletedCount === 1 ? "" : "s"}.`);
  console.log(`Seeded admin login: ${adminEmail} / ${process.env.ADMIN_TEST_PASSWORD || "supercars-admin"}`);
  console.log(`Seeded regular user login: ${userEmail} / ${process.env.USER_TEST_PASSWORD || "supercars-user"}`);
  console.table(created);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
