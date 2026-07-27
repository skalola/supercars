/**
 * scratch/test_transport_package.ts
 *
 * Automated verification script for Sprint 7.5 Transport Request Package.
 * Validates:
 * 1. createTransportQuotePackage Action execution
 * 2. All 9 required transport package fields present in scoped payload
 * 3. Transporter PartnerContact resolution (Reliable Carriers)
 * 4. NO IRREVERSIBLE FEES BEFORE ACCEPTANCE (Deposit status: AUTHORIZED)
 * 5. Partner DECLINED flow -> deposit hold released (RELEASED)
 * 6. Retry / Re-dispatch flow (reDispatchFulfillmentRequest) to alternative carrier (Intercity Lines)
 * 7. Partner ACCEPTED flow -> deposit hold captured (CAPTURED)
 */

import { prisma } from "../lib/prisma";
import { createTransportQuotePackage } from "../app/actions/purchase";
import {
  getBuyerFulfillmentTransaction,
  submitPartnerDecision,
  reDispatchFulfillmentRequest,
} from "../lib/fulfillment/service";

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
  console.log("  Testing Sprint 7.5 Transport Request Package   ");
  console.log("==================================================\n");

  // Mock global session
  let buyerUser = await prisma.user.findFirst({ where: { email: "buyer.transportpkg@example.com" } });
  if (!buyerUser) {
    buyerUser = await prisma.user.create({
      data: {
        name: "Tony Stark",
        email: "buyer.transportpkg@example.com",
        username: "tony_transportpkg",
      },
    });
  }

  testGlobal.mockSession = {
    user: { id: buyerUser.id, email: buyerUser.email, name: buyerUser.name },
  };

  const runId = Date.now();
  const primaryTransporterName = `Reliable Carriers Sprint 7E ${runId}`;
  const secondaryTransporterName = `Intercity Lines Sprint 7E ${runId}`;

  await prisma.partnerContact.createMany({
    data: [
      {
        name: primaryTransporterName,
        type: "TRANSPORTER",
        email: "dispatch@reliablecarriers.com",
        website: "https://www.reliablecarriers.com",
        makeSpecialization: "ALL",
        location: "Canton, MI",
        contactSource: "PUBLIC_WEBSITE",
        confidence: "VERIFIED",
        contactStatus: "RESOLVED",
      },
      {
        name: secondaryTransporterName,
        type: "TRANSPORTER",
        email: "logistics@intercitylines.com",
        website: "https://intercitylines.com",
        makeSpecialization: "ALL",
        location: "Warren, MA",
        contactSource: "PUBLIC_WEBSITE",
        confidence: "VERIFIED",
        contactStatus: "RESOLVED",
      },
    ],
  });

  const source = await prisma.marketSource.create({
    data: {
      name: `Sprint 7E Dealer Source ${runId}`,
      type: "DEALER",
      website: `https://sprint-7e-transport-${runId}.example.org`,
    },
  });

  const sampleModel = await prisma.model.findFirst({
    where: { make: { name: "Ferrari" } },
    include: { make: true },
  });
  if (!sampleModel) throw new Error("No Ferrari model found for transport test.");

  const vehicle = await prisma.vehicle.create({
    data: {
      vin: `ZFF7ETRAN${String(runId).slice(-8)}`,
      modelId: sampleModel.id,
      year: 2023,
      trim: "Sprint 7E Test",
      mileage: 1800,
    },
  });

  const listing = await prisma.listing.create({
    data: {
      modelId: sampleModel.id,
      sourceId: source.id,
      externalListingId: `sprint-7e-${runId}`,
      year: 2023,
      price: 450000,
      mileage: 1800,
      location: "Beverly Hills, CA",
      dealerName: source.name,
      url: `${source.website}/inventory/sprint-7e-${runId}`,
      vinVerified: true,
      status: "ACTIVE",
      vehicleId: vehicle.id,
      askingPrice: 450000,
    },
  });

  const purchase = await prisma.purchase.create({
    data: {
      listingId: listing.id,
      buyerId: buyerUser.id,
      amount: 450000,
      status: "PENDING",
    },
    include: { listing: { include: { vehicle: true } } },
  });

  console.log(`Using purchase ID: ${purchase.id} (Amount: $${purchase.amount.toLocaleString()})\n`);

  // ── 1. Execute createTransportQuotePackage Action ───────────────────────
  console.log("1. Executing createTransportQuotePackage Action...");
  const transportResult = await createTransportQuotePackage({
    purchaseId: purchase.id,
    address: {
      streetAddress: "10880 Wilshire Blvd",
      city: "Los Angeles",
      state: "CA",
      postalCode: "90024",
    },
    transportMethod: "ENCLOSED",
    deliveryDate: "2026-08-15",
    transporterName: primaryTransporterName,
    operableStatus: "RUNNING",
    buyerPhone: "310-555-0188",
    estimatedTransportPrice: 1950,
    depositAmount: 500,
  });

  console.log(`  ✓ Delivery Request ID: ${transportResult.id}`);
  console.log(`  ✓ Fulfillment Request ID: ${transportResult.fulfillmentRequestId}`);
  console.log(`  ✓ Public Transaction Token: ${transportResult.publicTransactionToken}`);
  console.log(`  ✓ Delivery Request Status: ${transportResult.status}`);

  // ── 2. Verify Deposit Hold (NO MONEY CAPTURED BEFORE ACCEPTANCE) ─────────
  console.log("\n2. Verifying Deposit Authorization Hold Rules...");
  const dbFulfillment = await prisma.fulfillmentRequest.findUnique({
    where: { id: transportResult.fulfillmentRequestId },
    include: {
      packages: true,
      partnerTokens: true,
      depositIntents: true,
      fees: true,
    },
  });

  const depositIntent = dbFulfillment?.depositIntents[0];
  console.log(`  ✓ Deposit Hold Amount: $${depositIntent?.amount} | Status: ${depositIntent?.status}`);
  if (!depositIntent || depositIntent.status !== "AUTHORIZED") {
    throw new Error("Deposit rule violated! Deposit status must be AUTHORIZED (not CAPTURED) prior to partner acceptance.");
  }

  // ── 3. Verify All 9 Transport Package Fields ─────────────────────────────
  console.log("\n3. Verifying All 9 Transport Package Fields in Scoped Data...");
  const rawScope = dbFulfillment?.packages[0]?.scope;
  if (!rawScope) throw new Error("Scoped transport package missing!");

  const payload = JSON.parse(rawScope);
  const requiredFields = [
    "pickupLocation",
    "deliveryLocation",
    "vehicle",
    "operableStatus",
    "preferredDeliveryDate",
    "carrierType",
    "buyerContact",
    "estimatedTransportPrice",
    "depositFeeRules",
  ];

  console.log(`  ✓ Pickup Location: ${payload.pickupLocation}`);
  console.log(`  ✓ Delivery Location: ${payload.deliveryLocation.city}, ${payload.deliveryLocation.state}`);
  console.log(`  ✓ Vehicle VIN: ${payload.vehicle.vin}`);
  console.log(`  ✓ Carrier Type: ${payload.carrierType}`);
  console.log(`  ✓ Estimated Price: $${payload.estimatedTransportPrice}`);
  console.log(`  ✓ Payment Rule: ${payload.depositFeeRules.rule}`);

  for (const field of requiredFields) {
    if (payload[field] === undefined) {
      throw new Error(`Required transport field '${field}' missing from quote package!`);
    }
  }
  if (payload.vehicle.vin !== vehicle.vin || payload.estimatedTransportPrice !== 1950) {
    throw new Error("Transport package did not preserve the VIN-backed vehicle or transport price.");
  }
  const transportFee = dbFulfillment.fees.find((fee) => fee.feeType === "TRANSPORT_FEE");
  console.log(`  ✓ Transport Fee Record: $${transportFee?.amount} (${transportFee?.status})`);
  if (!transportFee || transportFee.amount !== 1950 || transportFee.status !== "ESTIMATED") {
    throw new Error("Transport fee tracking is invalid before partner acceptance.");
  }
  console.log(`  ✓ All ${requiredFields.length} required fields verified in transport package payload.`);

  // ── 4. Simulate Transporter DECLINED Flow & Deposit Release ─────────────
  console.log("\n4. Simulating Transporter DECLINED Decision...");
  const partnerToken1 = dbFulfillment.partnerTokens[0].token;

  await submitPartnerDecision({
    token: partnerToken1,
    decision: "DECLINED",
    note: "No enclosed carrier trucks currently available on East-to-West route.",
  });

  const declinedTx = await getBuyerFulfillmentTransaction(transportResult.publicTransactionToken);
  if ("error" in declinedTx || !declinedTx.request) throw new Error("Failed to fetch buyer transaction.");

  console.log(`  ✓ Buyer Transaction Status: ${declinedTx.request.status} (Expected: DECLINED)`);
  console.log(`  ✓ Deposit Hold Status: ${declinedTx.request.depositIntents[0]?.status} (Expected: RELEASED)`);
  if (declinedTx.request.depositIntents[0]?.status !== "RELEASED") {
    throw new Error("Deposit hold was not released after transporter declined route!");
  }

  // ── 5. Execute Re-dispatch / Retry Flow to Alternative Carrier ──────────
  console.log("\n5. Executing Re-dispatch / Retry to Intercity Lines...");
  const newRequest = await reDispatchFulfillmentRequest(
    transportResult.fulfillmentRequestId,
    secondaryTransporterName,
    "logistics@intercitylines.com"
  );

  console.log(`  ✓ New Re-dispatched Request ID: ${newRequest.id}`);
  console.log(`  ✓ New Public Transaction Token: ${newRequest.publicTransactionToken}`);

  const newFulfillment = await prisma.fulfillmentRequest.findUnique({
    where: { id: newRequest.id },
    include: { partnerTokens: true, depositIntents: true, fees: true },
  });

  const partnerToken2 = newFulfillment?.partnerTokens[0]?.token;
  if (!partnerToken2) throw new Error("Failed to generate token for re-dispatched request.");
  const redispatchedTransportFee = newFulfillment.fees.find((fee) => fee.feeType === "TRANSPORT_FEE");
  console.log(`  ✓ Re-dispatched Transport Fee: $${redispatchedTransportFee?.amount} (${redispatchedTransportFee?.status})`);
  if (!redispatchedTransportFee || redispatchedTransportFee.amount !== 1950 || redispatchedTransportFee.status !== "ESTIMATED") {
    throw new Error("Re-dispatched request failed to preserve transport fee economics.");
  }

  // ── 6. Simulate Second Transporter ACCEPTED Flow & Deposit Capture ───────
  console.log("\n6. Simulating Second Transporter ACCEPTED Decision...");
  await submitPartnerDecision({
    token: partnerToken2,
    decision: "ACCEPTED",
    note: "Intercity Lines enclosed carrier confirmed pickup for August 14th.",
  });

  const acceptedTx = await getBuyerFulfillmentTransaction(newRequest.publicTransactionToken);
  if ("error" in acceptedTx || !acceptedTx.request) throw new Error("Failed to fetch buyer transaction.");

  console.log(`  ✓ Re-dispatched Transaction Status: ${acceptedTx.request.status} (Expected: ACCEPTED)`);
  console.log(`  ✓ Final Deposit Hold Status: ${acceptedTx.request.depositIntents[0]?.status} (Expected: CAPTURED)`);

  if (acceptedTx.request.status !== "ACCEPTED" || acceptedTx.request.depositIntents[0]?.status !== "CAPTURED") {
    throw new Error("Re-dispatched transport request failed to complete acceptance/capture flow!");
  }

  console.log("\n==================================================");
  console.log("  ALL SPRINT 7.5 TRANSPORT PACKAGE TESTS PASSED!  ");
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
