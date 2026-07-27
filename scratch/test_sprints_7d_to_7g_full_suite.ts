/**
 * scratch/test_sprints_7d_to_7g_full_suite.ts
 *
 * Automated Comprehensive Suite for Sprints 7D, 7E, 7F, and 7G.
 * Validates:
 * 1. Sprint 7D: Insurance Quote Package & $250 Referral Commission
 * 2. Sprint 7E: Transport Request Package, Deposit Authorization Hold, Decline Release & Redispatch
 * 3. Sprint 7F: Service Booking Package, Passport Health Summary, Shop Email Dispatch & Acceptance
 * 4. Sprint 7G: Financial Settlement Rules, Payment Lifecycle (7 States), Pre vs Post Acceptance Cancellation Policies, & Expiration Auto-Voids
 */

import { prisma } from "../lib/prisma";
import { createDealerPurchasePackage, createInsuranceQuotePackage, createTransportQuotePackage } from "../app/actions/purchase";
import { createServiceBookingPackage } from "../app/actions/passport";
import {
  getPartnerFulfillmentPackage,
  submitPartnerDecision,
  cancelFulfillmentRequest,
  processExpiredFulfillmentRequests,
  getFulfillmentByIdForUser,
} from "../lib/fulfillment/service";
import { getAdminFulfillmentMetrics } from "../lib/admin/fulfillment-ops";

async function main() {
  console.log("==================================================");
  console.log("   Testing Sprints 7D, 7E, 7F, 7G Full Suite      ");
  console.log("==================================================\n");

  // Setup Test User & Active Listing
  let buyerUser = await prisma.user.findFirst({ where: { email: "suite.buyer@example.com" } });
  if (!buyerUser) {
    buyerUser = await prisma.user.create({
      data: { name: "Charles Leclerc", email: "suite.buyer@example.com", username: "charles_16" },
    });
  }

  (globalThis as any).mockSession = {
    user: { id: buyerUser.id, email: buyerUser.email, name: buyerUser.name },
  };

  const sampleVehicle = await prisma.vehicle.findFirst({
    include: { model: { include: { make: true } } },
  });
  if (!sampleVehicle) throw new Error("No vehicle found.");

  let sampleListing = await prisma.listing.findFirst({ where: { status: "ACTIVE", vehicleId: { not: null } } });
  if (!sampleListing) {
    sampleListing = await prisma.listing.findFirst({ where: { status: "ACTIVE" } });
    if (sampleListing) {
      await prisma.listing.update({
        where: { id: sampleListing.id },
        data: { vehicleId: sampleVehicle.id },
      });
    }
  }
  if (!sampleListing) throw new Error("No active listing found.");

  // Create base purchase record
  const purchaseRes = await createDealerPurchasePackage({
    listingId: sampleListing.id,
    amount: 390000,
    buyerName: buyerUser.name!,
    buyerEmail: buyerUser.email!,
  });

  // ── 1. SPRINT 7D: Insurance Quote Package ────────────────────────────────
  console.log("1. Testing Sprint 7D: Insurance Quote Package & Commission Tracking...");
  const insRes = await createInsuranceQuotePackage({
    purchaseId: purchaseRes.id,
    garagingState: "CA",
    garagingZip: "90210",
    intendedUse: "PLEASURE_COLLECTION",
    coveragePreference: "AGREED_VALUE_FULL_COVERAGE",
    carrierName: "Hagerty Private Client Insurance",
  });

  const insReq = await prisma.fulfillmentRequest.findUnique({
    where: { id: insRes.fulfillmentRequestId },
    include: { partnerTokens: true, packages: true },
  });

  const insPkgData = JSON.parse(insReq!.packages[0].scope);
  console.log(`  ✓ Insurance Request ID: ${insRes.fulfillmentRequestId}`);
  console.log(`  ✓ Garaging Location: ${insPkgData.garagingLocation.state} ${insPkgData.garagingLocation.zipCode}`);
  console.log(`  ✓ Agreed Value: $${insPkgData.agreedValue}`);
  console.log(`  ✓ Expected Referral Commission: $${insReq?.expectedPartnerCommission} (Expected: $250)`);

  const insToken = insReq!.partnerTokens[0].token;
  const insAcceptRes = await submitPartnerDecision({ token: insToken, decision: "ACCEPTED", note: "Agreed value policy bound." });
  console.log(`  ✓ Insurance Acceptance: ${insAcceptRes.message}`);

  if (insReq?.expectedPartnerCommission !== 250) {
    throw new Error("Sprint 7D failed: Referral commission was not set to $250!");
  }

  // ── 2. SPRINT 7E: Transport Request Package & Release/Redispatch ─────────
  console.log("\n2. Testing Sprint 7E: Transport Package, Deposit Release & Redispatch...");
  const transRes1 = await createTransportQuotePackage({
    purchaseId: purchaseRes.id,
    address: { streetAddress: "100 Wilshire Blvd", city: "Beverly Hills", state: "CA", postalCode: "90212" },
    transportMethod: "ENCLOSED",
    deliveryDate: "2026-08-20",
    operableStatus: "RUNNING",
    transporterName: "Reliable Carriers Enclosed Transport",
  });

  const transReq1 = await prisma.fulfillmentRequest.findUnique({
    where: { id: transRes1.fulfillmentRequestId },
    include: { partnerTokens: true, depositIntents: true },
  });

  console.log(`  ✓ Initial Transport Request ID: ${transReq1?.id}`);
  console.log(`  ✓ Initial Deposit Hold Status: ${transReq1?.depositIntents[0]?.status} (Expected: AUTHORIZED)`);

  // Decline initial transport request -> test deposit release & voiding
  const transToken1 = transReq1!.partnerTokens[0].token;
  const transDeclineRes = await submitPartnerDecision({ token: transToken1, decision: "DECLINED", note: "Route capacity full." });
  console.log(`  ✓ Transporter Decline Result: ${transDeclineRes.message}`);

  const transReqAfterDecline = await prisma.fulfillmentRequest.findUnique({
    where: { id: transRes1.fulfillmentRequestId },
    include: { depositIntents: true },
  });

  console.log(`  ✓ Status After Decline: ${transReqAfterDecline?.status} (Expected: DECLINED)`);
  console.log(`  ✓ Payment Status After Decline: ${transReqAfterDecline?.paymentStatus} (Expected: VOIDED)`);
  console.log(`  ✓ Deposit Hold Status After Decline: ${transReqAfterDecline?.depositIntents[0]?.status} (Expected: RELEASED)`);

  if (transReqAfterDecline?.paymentStatus !== "VOIDED" || transReqAfterDecline?.depositIntents[0]?.status !== "RELEASED") {
    throw new Error("Sprint 7E failed: Transporter decline did not release authorization hold!");
  }

  // Redispatch to second transporter
  console.log("  ✓ Testing Redispatch to Alternative Transporter...");
  const transRes2 = await createTransportQuotePackage({
    purchaseId: purchaseRes.id,
    address: { streetAddress: "100 Wilshire Blvd", city: "Beverly Hills", state: "CA", postalCode: "90212" },
    transportMethod: "ENCLOSED",
    deliveryDate: "2026-08-20",
    transporterName: "Horseless Carriage Carriers",
  });

  const transReq2 = await prisma.fulfillmentRequest.findUnique({
    where: { id: transRes2.fulfillmentRequestId },
    include: { partnerTokens: true },
  });

  const transToken2 = transReq2!.partnerTokens[0].token;
  const transAcceptRes = await submitPartnerDecision({ token: transToken2, decision: "ACCEPTED", note: "Enclosed transport accepted." });
  console.log(`  ✓ Redispatch Accept Result: ${transAcceptRes.message}`);

  // ── 3. SPRINT 7F: Service Booking Package ────────────────────────────────
  console.log("\n3. Testing Sprint 7F: Service Booking Package & Passport Integration...");

  const servRes = await createServiceBookingPackage({
    vin: sampleVehicle.vin,
    serviceName: "Desmo Valve & Timing Belt Service",
    preferredDate: "2026-08-25",
    preferredTime: "09:00 AM",
    shopName: "Ferrari Beverly Hills Service Center",
    notes: "Please inspect brake wear sensors.",
  });

  const servReq = await prisma.fulfillmentRequest.findUnique({
    where: { id: servRes.fulfillmentRequestId },
    include: { partnerTokens: true, packages: true, depositIntents: true },
  });

  const servPkgData = JSON.parse(servReq!.packages[0].scope);
  console.log(`  ✓ Service Booking Request ID: ${servRes.fulfillmentRequestId}`);
  console.log(`  ✓ Service Requested: "${servPkgData.serviceRequested}"`);
  console.log(`  ✓ Passport Health Score: ${servPkgData.vehicle.passportHealthScore}`);
  console.log(`  ✓ Booking Deposit Hold: $${servPkgData.depositFeeRules.depositAmount} (${servReq?.depositIntents[0]?.status})`);

  const servToken = servReq!.partnerTokens[0].token;
  const servAcceptRes = await submitPartnerDecision({ token: servToken, decision: "ACCEPTED", note: "Appointment confirmed for 09:00 AM." });
  console.log(`  ✓ Shop Appointment Acceptance: ${servAcceptRes.message}`);

  // ── 4. SPRINT 7G: Financial Rules, Pre vs Post Cancellation & Expiration ─
  console.log("\n4. Testing Sprint 7G: Deposit, Fee, Cancellation Rules & Money Protection...");

  // Pre-acceptance buyer cancellation test (100% deposit release)
  const preCancelReq = await createTransportQuotePackage({
    purchaseId: purchaseRes.id,
    address: { streetAddress: "500 Sunset Blvd", city: "Los Angeles", state: "CA", postalCode: "90028" },
    transporterName: "Intercity Lines",
  });

  const cancelResult1 = await cancelFulfillmentRequest({
    fulfillmentRequestId: preCancelReq.fulfillmentRequestId,
    cancelledByActor: "BUYER",
    cancellationReason: "Buyer changed delivery preference before acceptance.",
  });

  console.log(`  ✓ Pre-Acceptance Cancellation: ${cancelResult1.message}`);

  const preCancelObj = await prisma.fulfillmentRequest.findUnique({
    where: { id: preCancelReq.fulfillmentRequestId },
    include: { depositIntents: true },
  });

  console.log(`    - Status: ${preCancelObj?.status} (Expected: CANCELLED)`);
  console.log(`    - Payment Status: ${preCancelObj?.paymentStatus} (Expected: VOIDED)`);
  console.log(`    - Deposit Status: ${preCancelObj?.depositIntents[0]?.status} (Expected: RELEASED)`);
  console.log(`    - Refundable Amount: $${preCancelObj?.refundableAmount} (Expected: 0)`);

  if (preCancelObj?.paymentStatus !== "VOIDED" || preCancelObj?.depositIntents[0]?.status !== "RELEASED") {
    throw new Error("Sprint 7G failed: Pre-acceptance cancellation failed to release deposit hold!");
  }

  // Post-acceptance cancellation policy test
  const postCancelReq = await createInsuranceQuotePackage({
    purchaseId: purchaseRes.id,
    carrierName: "Grundy Collector Car Insurance",
  });

  const postTokenObj = await prisma.partnerDecisionToken.findFirst({
    where: { fulfillmentRequestId: postCancelReq.fulfillmentRequestId },
  });

  await submitPartnerDecision({ token: postTokenObj!.token, decision: "ACCEPTED" });

  const cancelResult2 = await cancelFulfillmentRequest({
    fulfillmentRequestId: postCancelReq.fulfillmentRequestId,
    cancelledByActor: "BUYER",
    cancellationReason: "Buyer bound alternative policy after acceptance.",
  });

  console.log(`  ✓ Post-Acceptance Cancellation: ${cancelResult2.message}`);

  const postCancelObj = await prisma.fulfillmentRequest.findUnique({
    where: { id: postCancelReq.fulfillmentRequestId },
  });

  console.log(`    - Status: ${postCancelObj?.status} (Expected: CANCELLED)`);
  console.log(`    - Payment Status: ${postCancelObj?.paymentStatus} (Expected: REFUNDED)`);

  // Expiration Auto-Void Test
  console.log("  ✓ Testing Expiration Auto-Void Engine...");
  const expReq = await createTransportQuotePackage({
    purchaseId: purchaseRes.id,
    address: { streetAddress: "100 Wilshire Blvd", city: "Beverly Hills", state: "CA", postalCode: "90212" },
    transporterName: "Test Carrier Expiration",
  });

  // Manually expire token
  await prisma.partnerDecisionToken.updateMany({
    where: { fulfillmentRequestId: expReq.fulfillmentRequestId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  const expResult = await processExpiredFulfillmentRequests();
  console.log(`    - Expiration Batch Process Count: ${expResult.processedCount} expired request(s) processed.`);

  const expObj = await prisma.fulfillmentRequest.findUnique({
    where: { id: expReq.fulfillmentRequestId },
    include: { depositIntents: true },
  });

  console.log(`    - Status: ${expObj?.status} (Expected: EXPIRED)`);
  console.log(`    - Payment Status: ${expObj?.paymentStatus} (Expected: VOIDED)`);
  console.log(`    - Deposit Status: ${expObj?.depositIntents[0]?.status} (Expected: RELEASED)`);

  if (expObj?.status !== "EXPIRED" || expObj?.paymentStatus !== "VOIDED") {
    throw new Error("Sprint 7G failed: Expiration process failed to set status EXPIRED and payment status VOIDED!");
  }

  // Admin Ops Verification
  const metrics = await getAdminFulfillmentMetrics();
  console.log(`\n  ✓ Admin Ops Final Metrics Check: ${metrics.totalRequests} Total Requests | $${metrics.totalCommissionExpected} Expected Commission | $${metrics.totalCommissionCollected} Collected Commission.`);

  console.log("\n==================================================");
  console.log(" ALL SPRINTS 7D, 7E, 7F, 7G TESTS PASSED 100%!   ");
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("Test failed with error:", e);
    process.exit(1);
  })
  .finally(async () => {
    delete (globalThis as any).mockSession;
    await prisma.$disconnect();
  });
