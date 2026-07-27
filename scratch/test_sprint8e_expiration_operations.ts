/**
 * scratch/test_sprint8e_expiration_operations.ts
 *
 * Sprint 8E verification:
 * 1. Ignored partner token past TTL is processed by the shared expiration sweep.
 * 2. Request moves to EXPIRED.
 * 3. Partner token is invalidated with actionTaken=EXPIRED.
 * 4. Authorized deposit is released and request payment status is VOIDED.
 * 5. Admin operations wrapper reports processed work for manual ops/scheduler parity.
 */

import { prisma } from "../lib/prisma";
import { createFulfillmentRequest } from "../lib/fulfillment/service";
import { adminProcessExpiredPartnerRequests } from "../lib/admin/fulfillment-ops";

async function ensureVehicle() {
  const make = await prisma.make.upsert({
    where: { slug: "ferrari" },
    update: {},
    create: { name: "Ferrari", slug: "ferrari" },
  });

  const model = await prisma.model.upsert({
    where: { makeId_slug: { makeId: make.id, slug: "roma" } },
    update: {},
    create: { makeId: make.id, name: "Roma", slug: "roma", category: "Grand Touring" },
  });

  return prisma.vehicle.upsert({
    where: { vin: "ZFF98RNA0N0270001" },
    update: {
      modelId: model.id,
      year: 2022,
      trim: "Sprint 8E QA",
      mileage: 2800,
    },
    create: {
      vin: "ZFF98RNA0N0270001",
      modelId: model.id,
      year: 2022,
      trim: "Sprint 8E QA",
      mileage: 2800,
      status: "UNCLAIMED",
    },
  });
}

async function ensureBuyer() {
  return prisma.user.upsert({
    where: { email: "sprint8e.buyer@example.test" },
    update: { name: "Sprint 8E Buyer" },
    create: {
      name: "Sprint 8E Buyer",
      email: "sprint8e.buyer@example.test",
      username: "sprint8e_buyer",
    },
  });
}

async function main() {
  console.log("==================================================");
  console.log("  Testing Sprint 8E Expiration Operations Sweep   ");
  console.log("==================================================\n");

  const [buyer, vehicle] = await Promise.all([ensureBuyer(), ensureVehicle()]);

  const request = await createFulfillmentRequest({
    requestType: "SERVICE_BOOKING",
    status: "SENT",
    buyerId: buyer.id,
    vehicleId: vehicle.id,
    packageTitle: "Sprint 8E Expiring Service Booking",
    packageDescription: "Ignored partner-token fixture for expiration operations.",
    scopedPackageData: {
      vin: vehicle.vin,
      year: vehicle.year,
      make: "Ferrari",
      model: "Roma",
      customerName: buyer.name,
      customerEmail: buyer.email,
      serviceRequest: "Annual service and inspection.",
    },
    parties: [
      {
        partyType: "BUYER",
        userId: buyer.id,
        name: buyer.name || "Sprint 8E Buyer",
        email: buyer.email || "sprint8e.buyer@example.test",
      },
      {
        partyType: "SERVICE_CENTER",
        name: "Sprint 8E Ferrari Service",
        email: "service.sprint8e@example.test",
        companyName: "Sprint 8E Ferrari Service",
      },
    ],
    fees: [
      {
        feeType: "SERVICE_FEE",
        amount: 100,
        status: "AUTHORIZED",
        description: "Platform service booking fee.",
      },
    ],
    depositIntent: {
      amount: 100,
      paymentMethod: "SPRINT_8E_LEDGER_AUTH",
    },
    partnerName: "Sprint 8E Ferrari Service",
    partnerEmail: "service.sprint8e@example.test",
    partnerExpiresInDays: 3,
  });

  const token = request.partnerTokens[0];
  if (!token) throw new Error("Expected created fulfillment request to include a partner decision token.");

  await prisma.partnerDecisionToken.update({
    where: { id: token.id },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });

  console.log("1. Running admin expiration processor...");
  const result = await adminProcessExpiredPartnerRequests();
  console.log(`  ✓ ${result.message}`);

  if (!result.success || result.processedCount < 1) {
    throw new Error("Expected admin expiration processor to process at least one expired request.");
  }

  const expired = await prisma.fulfillmentRequest.findUnique({
    where: { id: request.id },
    include: {
      depositIntents: true,
      fees: true,
      partnerTokens: true,
      events: { orderBy: { createdAt: "desc" } },
    },
  });

  console.log("2. Verifying request, token, deposit, and audit state...");
  console.log(`  ✓ Request Status: ${expired?.status}`);
  console.log(`  ✓ Payment Status: ${expired?.paymentStatus}`);
  console.log(`  ✓ Token Action: ${expired?.partnerTokens[0]?.actionTaken}`);
  console.log(`  ✓ Deposit Status: ${expired?.depositIntents[0]?.status}`);
  console.log(`  ✓ Latest Event: ${expired?.events[0]?.newStatus}`);

  if (expired?.status !== "EXPIRED") {
    throw new Error(`Expected request status EXPIRED, received ${expired?.status}.`);
  }
  if (expired.paymentStatus !== "VOIDED") {
    throw new Error(`Expected payment status VOIDED, received ${expired.paymentStatus}.`);
  }
  if (expired.partnerTokens[0]?.actionTaken !== "EXPIRED") {
    throw new Error("Expected partner token to be invalidated as EXPIRED.");
  }
  if (expired.depositIntents[0]?.status !== "RELEASED") {
    throw new Error(`Expected released deposit, received ${expired.depositIntents[0]?.status}.`);
  }
  if (!expired.events.some((event) => event.newStatus === "EXPIRED" && event.actorType === "SYSTEM")) {
    throw new Error("Expected SYSTEM expiration audit event.");
  }

  console.log("\n==================================================");
  console.log("        SPRINT 8E EXPIRATION OPS TEST PASSED      ");
  console.log("==================================================");
}

main()
  .catch((error) => {
    console.error("Test failed with error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
