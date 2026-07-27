/**
 * scratch/test_service_booking_package.ts
 *
 * Automated verification script for Sprint 7.6 Service Booking Package.
 * Validates:
 * 1. Vehicle Passport -> Fulfillment proof point
 * 2. createServiceBookingPackage Action execution
 * 3. All 8 required service booking package fields present in scoped payload
 * 4. Resolution of certified service shop PartnerContact (Ferrari of Beverly Hills Service)
 * 5. REFUNDABLE BOOKING AUTHORIZATION HOLD (Deposit status: AUTHORIZED)
 * 6. Partner ACCEPTED decision -> deposit hold captured (CAPTURED) and request status ACCEPTED
 */

import { prisma } from "../lib/prisma";
import { createServiceBookingPackage } from "../app/actions/passport";
import {
  getPartnerFulfillmentPackage,
  getBuyerFulfillmentTransaction,
  submitPartnerDecision,
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
  console.log("  Testing Sprint 7.6 Service Booking Package      ");
  console.log("==================================================\n");

  const runId = Date.now();
  const shopName = `Ferrari Beverly Hills Service Sprint 7F ${runId}`;

  await prisma.partnerContact.create({
    data: {
      name: shopName,
      type: "SERVICE_SHOP",
      email: "service@ferrariofbeverlyhills.com",
      phone: "+1-310-555-0177",
      website: "https://www.ferrariofbeverlyhills.com/service/",
      makeSpecialization: "Ferrari",
      location: "Beverly Hills, CA",
      contactSource: "PUBLIC_WEBSITE",
      confidence: "VERIFIED",
      contactStatus: "RESOLVED",
    },
  });

  const model = await prisma.model.findFirst({
    where: { make: { name: "Ferrari" } },
    include: { make: true },
  });
  if (!model) throw new Error("No Ferrari model found for service booking test.");

  const owner = await prisma.user.create({
    data: {
      name: "Enzo Ferrari",
      email: `enzo.servicepkg.${runId}@example.com`,
      username: `enzo_servicepkg_${runId}`,
    },
  });

  const sampleVehicle = await prisma.vehicle.create({
    data: {
      vin: `ZFF7FSERV${String(runId).slice(-8)}`,
      year: 2019,
      modelId: model.id,
      ownerId: owner.id,
      status: "CLAIMED",
      mileage: 9100,
      profile: {
        create: {
          currentMileage: 9100,
        },
      },
    },
    include: { model: { include: { make: true } }, owner: true, profile: true },
  });

  testGlobal.mockSession = {
    user: { id: owner.id, email: owner.email, name: owner.name },
  };

  console.log(`Using Vehicle Passport VIN: ${sampleVehicle.vin} (${sampleVehicle.model.make.name} ${sampleVehicle.model.name}) — Owner: ${owner.name}\n`);

  // ── 1. Execute createServiceBookingPackage Action from Vehicle Passport ──
  console.log("1. Executing createServiceBookingPackage Action from Vehicle Passport...");
  const bookingResult = await createServiceBookingPackage({
    vin: sampleVehicle.vin,
    serviceName: "Annual Major Maintenance & Brake Service",
    shopName,
    preferredDate: "2026-08-25",
    preferredTime: "09:00 AM",
    notes: "Requesting factory original fluids and 101-point certified inspection.",
    customerPhone: "310-555-0133",
    depositAmount: 125,
  });

  console.log(`  ✓ Fulfillment Request ID: ${bookingResult.fulfillmentRequestId}`);
  console.log(`  ✓ Public Transaction Token: ${bookingResult.publicTransactionToken}`);
  console.log(`  ✓ Initial Request Status: ${bookingResult.status}`);

  // ── 2. Verify Deposit Authorization Hold Rule ───────────────────────────
  console.log("\n2. Verifying Deposit Authorization Hold Rules...");
  const dbFulfillment = await prisma.fulfillmentRequest.findUnique({
    where: { id: bookingResult.fulfillmentRequestId },
    include: {
      packages: true,
      partnerTokens: true,
      depositIntents: true,
      fees: true,
    },
  });

  const depositIntent = dbFulfillment?.depositIntents[0];
  console.log(`  ✓ Deposit Hold Amount: $${depositIntent?.amount} | Status: ${depositIntent?.status}`);
  if (!depositIntent || depositIntent.amount !== 125 || depositIntent.status !== "AUTHORIZED") {
    throw new Error("Deposit rule violated! Deposit status must be AUTHORIZED (not CAPTURED) prior to shop acceptance.");
  }

  // ── 3. Verify All 8 Service Booking Package Fields ──────────────────────
  console.log("\n3. Verifying All 8 Service Booking Fields in Scoped Payload...");
  const rawScope = dbFulfillment?.packages[0]?.scope;
  if (!rawScope) throw new Error("Scoped service package payload missing!");

  const payload = JSON.parse(rawScope);
  const requiredFields = [
    "vehicle",
    "serviceRequested",
    "mileage",
    "preferredSchedule",
    "customerContact",
    "shop",
    "depositFeeRules",
    "notesAndDocuments",
  ];

  console.log(`  ✓ Vehicle VIN in Payload: ${payload.vehicle.vin}`);
  console.log(`  ✓ Service Requested: ${payload.serviceRequested}`);
  console.log(`  ✓ Preferred Schedule: ${payload.preferredSchedule.preferredDate} at ${payload.preferredSchedule.preferredTime}`);
  console.log(`  ✓ Shop Name: ${payload.shop.name}`);
  console.log(`  ✓ Booking Deposit: $${payload.depositFeeRules.depositAmount}`);
  console.log(`  ✓ Fee Rule: ${payload.depositFeeRules.rule}`);

  for (const field of requiredFields) {
    if (payload[field] === undefined) {
      throw new Error(`Required service booking field '${field}' missing from package!`);
    }
  }
  if (payload.vehicle.vin !== sampleVehicle.vin || payload.depositFeeRules.depositAmount !== 125) {
    throw new Error("Service booking package did not preserve the VIN-backed vehicle or booking deposit.");
  }
  const serviceFee = dbFulfillment.fees.find((fee) => fee.feeType === "SERVICE_FEE");
  console.log(`  ✓ Service Fee Record: $${serviceFee?.amount} (${serviceFee?.status})`);
  if (!serviceFee || serviceFee.amount !== 125 || serviceFee.status !== "AUTHORIZED") {
    throw new Error("Service booking fee tracking is invalid before shop acceptance.");
  }
  console.log(`  ✓ All ${requiredFields.length} required fields verified in service booking package payload.`);

  // ── 4. Simulate Service Center ACCEPTED Decision ─────────────────────────
  console.log("\n4. Simulating Certified Service Center ACCEPTED Decision...");
  const partnerToken = dbFulfillment.partnerTokens[0].token;

  const partnerView = await getPartnerFulfillmentPackage(partnerToken);
  if ("error" in partnerView) throw new Error(`Partner view failed: ${partnerView.message}`);

  const acceptResult = await submitPartnerDecision({
    token: partnerToken,
    decision: "ACCEPTED",
    note: "Service master technician assigned for August 25th 09:00 AM appointment.",
  });
  console.log(`  ✓ Service Center Decision Result: ${acceptResult.message}`);

  // ── 5. Verify Transaction Hub Live Update ───────────────────────────────
  console.log("\n5. Verifying Buyer Transaction Hub Live Update...");
  const buyerTx = await getBuyerFulfillmentTransaction(bookingResult.publicTransactionToken);
  if ("error" in buyerTx || !buyerTx.request) throw new Error("Failed to fetch buyer transaction.");

  console.log(`  ✓ Buyer Transaction Status: ${buyerTx.request.status} (Expected: ACCEPTED)`);
  console.log(`  ✓ Deposit Hold Status: ${buyerTx.request.depositIntents[0]?.status} (Expected: CAPTURED)`);
  console.log(`  ✓ Latest Event Note: "${buyerTx.request.events.at(-1)?.note}"`);

  if (buyerTx.request.status !== "ACCEPTED" || buyerTx.request.depositIntents[0]?.status !== "CAPTURED") {
    throw new Error("Service booking failed to complete acceptance/capture flow!");
  }

  console.log("\n==================================================");
  console.log("  ALL SPRINT 7.6 SERVICE BOOKING TESTS PASSED!    ");
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
