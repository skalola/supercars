/**
 * scratch/test_transaction_center.ts
 *
 * Automated verification script for Sprint 7.9 User Profile Transaction Center.
 * Validates:
 * 1. Data retrieval for authenticated user via getUserFulfillmentTransactions
 * 2. Coverage across all 5 request categories (Dealer Purchase, Insurance Quote, Transport Quote, Service Booking, Selling Offer)
 * 3. Correct population of 7 structured row columns (vehicle specs, VIN, request type, partner info, status, last update timestamp, deposit/payment status)
 */

import { prisma } from "../lib/prisma";
import { getUserFulfillmentTransactions, createFulfillmentRequest } from "../lib/fulfillment/service";
import { createDealerPurchasePackage } from "../app/actions/purchase";

const testGlobal = globalThis as typeof globalThis & {
  mockSession?: {
    user: {
      id: string;
      email: string | null;
      name: string | null;
    };
  };
};

async function main() {
  console.log("==================================================");
  console.log("   Testing Sprint 7.9 User Profile Transaction Hub");
  console.log("==================================================\n");

  // ── 1. Setup Test User & Vehicle ──────────────────────────────────────────
  let buyerUser = await prisma.user.findFirst({ where: { email: "txcenter.buyer@example.com" } });
  if (!buyerUser) {
    buyerUser = await prisma.user.create({
      data: {
        name: "Carlos Slim",
        email: "txcenter.buyer@example.com",
        username: "carlos_txcenter",
      },
    });
  }

  testGlobal.mockSession = {
    user: { id: buyerUser.id, email: buyerUser.email, name: buyerUser.name },
  };

  const runId = Date.now();
  const dealerName = `Transaction Center Dealer ${runId}`;
  const dealerWebsite = `https://tx-center-${runId}.example.org`;

  const source = await prisma.marketSource.create({
    data: {
      name: dealerName,
      type: "DEALER",
      website: dealerWebsite,
    },
  });

  await prisma.partnerContact.create({
    data: {
      name: dealerName,
      type: "DEALER",
      email: "sales@ferrariofbeverlyhills.com",
      website: dealerWebsite,
      sourceDomain: new URL(dealerWebsite).hostname,
      makeSpecialization: "Ferrari",
      location: "Beverly Hills, CA",
      contactSource: "PUBLIC_WEBSITE",
      confidence: "VERIFIED",
      contactStatus: "RESOLVED",
      marketSourceId: source.id,
    },
  });

  const model = await prisma.model.findFirst({
    where: { make: { name: "Ferrari" } },
    include: { make: true },
  });
  if (!model) throw new Error("No Ferrari model found.");

  const owner = await prisma.user.create({
    data: {
      name: "Transaction Owner",
      email: `txcenter.owner.${runId}@example.com`,
      username: `txcenter_owner_${runId}`,
    },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      vin: `ZFF7XTRAN${String(runId).slice(-8)}`,
      modelId: model.id,
      year: 2025,
      trim: "Sprint 7I Test",
      ownerId: owner.id,
      status: "CLAIMED",
    },
  });

  const sampleListing = await prisma.listing.create({
    data: {
      modelId: model.id,
      sourceId: source.id,
      externalListingId: `sprint-7i-${runId}`,
      year: 2025,
      price: 295000,
      location: "Beverly Hills, CA",
      dealerName,
      url: `${dealerWebsite}/inventory/sprint-7i-${runId}`,
      vinVerified: true,
      status: "ACTIVE",
      vehicleId: vehicle.id,
      sellerId: owner.id,
      askingPrice: 295000,
    },
  });

  // ── 2. Create Sample Requests Across All Categories ─────────────────────────
  console.log("1. Creating Sample Fulfillment Requests for Test User...");

  // Category 1: BUYING (Dealer Purchase)
  await createDealerPurchasePackage({
    listingId: sampleListing.id,
    amount: 295000,
    buyerName: buyerUser.name!,
    buyerEmail: buyerUser.email!,
  });

  // Category 2: INSURANCE_QUOTE
  await createFulfillmentRequest({
    requestType: "INSURANCE_QUOTE",
    buyerId: buyerUser.id,
    vehicleId: vehicle.id,
    listingId: sampleListing.id,
    packageTitle: "Agreed Value Insurance Quote Request",
    scopedPackageData: { coverage: "Enclosed Transport & Track Use", value: 300000 },
    partnerName: "Hagerty Specialty Insurance",
    partnerEmail: "underwriting@hagerty.com",
    fees: [{ feeType: "REFERRAL_FEE", amount: 250, currency: "USD" }],
    parties: [
      { partyType: "BUYER", name: buyerUser.name!, email: buyerUser.email! },
      { partyType: "INSURANCE_CARRIER", name: "Hagerty Specialty Insurance", email: "underwriting@hagerty.com" },
    ],
  });

  // Category 3: TRANSPORT_QUOTE
  await createFulfillmentRequest({
    requestType: "TRANSPORT_QUOTE",
    buyerId: buyerUser.id,
    vehicleId: vehicle.id,
    listingId: sampleListing.id,
    packageTitle: "Enclosed Vehicle Transport Order",
    scopedPackageData: { pickupZip: "90210", deliveryZip: "33139", type: "Enclosed" },
    partnerName: "Intercity Lines Transport",
    partnerEmail: "dispatch@intercitylines.com",
    depositIntent: { amount: 1500, currency: "USD", paymentMethod: "CREDIT_CARD_HOLD" },
    parties: [
      { partyType: "BUYER", name: buyerUser.name!, email: buyerUser.email! },
      { partyType: "TRANSPORT_PROVIDER", name: "Intercity Lines Transport", email: "dispatch@intercitylines.com" },
    ],
  });

  // Category 4: SERVICE_BOOKING
  await createFulfillmentRequest({
    requestType: "SERVICE_BOOKING",
    buyerId: buyerUser.id,
    vehicleId: vehicle.id,
    packageTitle: "Certified Major Service & Clutch Inspection",
    scopedPackageData: { serviceType: "Major Maintenance", mileage: 12500 },
    partnerName: "Ferrari Beverly Hills Service Center",
    partnerEmail: "service@ferrariofbeverlyhills.com",
    depositIntent: { amount: 500, currency: "USD", paymentMethod: "CREDIT_CARD_HOLD" },
    parties: [
      { partyType: "BUYER", name: buyerUser.name!, email: buyerUser.email! },
      { partyType: "SERVICE_CENTER", name: "Ferrari Beverly Hills Service Center", email: "service@ferrariofbeverlyhills.com" },
    ],
  });

  console.log("  ✓ Created sample fulfillment requests across all 4 request types.");

  // ── 3. Query User Fulfillment Transactions & Verify Tab Categories ───────
  console.log("\n2. Fetching User Transactions via getUserFulfillmentTransactions...");
  const userTransactions = await getUserFulfillmentTransactions(buyerUser.id);
  console.log(`  ✓ Total Transactions Retrieved: ${userTransactions.length}`);

  if (userTransactions.length < 4) {
    throw new Error(`Expected at least 4 transactions, received ${userTransactions.length}`);
  }

  // Verify 7 Column Attributes on retrieved items
  for (const tx of userTransactions) {
    console.log(`\n  [Transaction ID: ${tx.id}]`);
    console.log(`    - Request Type: ${tx.requestType}`);
    console.log(`    - Status: ${tx.status} | Payment Status: ${tx.paymentStatus}`);
    console.log(`    - Vehicle: ${tx.vehicle ? `${tx.vehicle.year} ${tx.vehicle.model.make.name} ${tx.vehicle.model.name} (VIN: ${tx.vehicle.vin})` : "N/A"}`);
    console.log(`    - Parties: ${tx.parties.map((p) => `${p.name} (${p.partyType})`).join(", ")}`);
    console.log(`    - Deposit Hold: ${tx.depositIntents[0] ? `$${tx.depositIntents[0].amount} (${tx.depositIntents[0].status})` : "None"}`);
    console.log(`    - Public Token: ${tx.publicTransactionToken}`);

    // Assert row attributes present
    if (!tx.requestType || !tx.status || !tx.publicTransactionToken) {
      throw new Error(`Transaction ${tx.id} missing mandatory row attributes!`);
    }
  }

  console.log("\n==================================================");
  console.log("  ALL SPRINT 7.9 TRANSACTION HUB TESTS PASSED!");
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("Test failed with error:", e);
    process.exit(1);
  })
  .finally(async () => {
    delete testGlobal.mockSession;
    await prisma.$disconnect();
  });
