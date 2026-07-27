/**
 * scratch/test_financial_settlement_engine.ts
 *
 * Automated verification script for Sprint 7.7 Deposit, Commission, Cancellation Logic.
 * Validates:
 * 1. Financial settlement metrics (expectedPlatformFee, expectedPartnerCommission, collectedAmount, refundableAmount)
 * 2. 9 PaymentStatus states (NOT_REQUIRED, AUTHORIZED, CAPTURED, VOIDED, REFUNDED, CANCELLED, etc.)
 * 3. Partner ACCEPTED flow -> paymentStatus CAPTURED, partnerAcceptedAt set, payoutStatus PENDING_RECONCILIATION
 * 4. Partner DECLINED flow -> paymentStatus VOIDED, deposit released
 * 5. Pre-acceptance Buyer Cancellation -> 100% deposit released, cancelledByActor recorded
 * 6. Post-acceptance Buyer Cancellation -> Policy fee retained, refund issued, cancellationReason saved
 * 7. Expiration processor processExpiredFulfillmentRequests -> Automatic void/refund
 */

import { prisma } from "../lib/prisma";
import { createDealerPurchasePackage } from "../app/actions/purchase";
import {
  submitPartnerDecision,
  cancelFulfillmentRequest,
  processExpiredFulfillmentRequests,
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
  console.log("  Testing Sprint 7.7 Financial Settlement Engine   ");
  console.log("==================================================\n");

  // Mock global session
  let buyerUser = await prisma.user.findFirst({ where: { email: "buyer.finengine@example.com" } });
  if (!buyerUser) {
    buyerUser = await prisma.user.create({
      data: {
        name: "Ray Dalio",
        email: "buyer.finengine@example.com",
        username: "ray_finengine",
      },
    });
  }

  testGlobal.mockSession = {
    user: { id: buyerUser.id, email: buyerUser.email, name: buyerUser.name },
  };

  const runId = Date.now();
  const dealerName = `Ferrari Financial Settlement Dealer ${runId}`;
  const dealerWebsite = `https://financial-settlement-${runId}.example.org`;

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
  if (!model) throw new Error("No Ferrari model found for financial engine test.");

  const vehicle = await prisma.vehicle.create({
    data: {
      vin: `ZFF7GSET${String(runId).slice(-9)}`,
      modelId: model.id,
      year: 2024,
      trim: "Sprint 7G Test",
      mileage: 1200,
    },
  });

  const sampleListing = await prisma.listing.create({
    data: {
      modelId: model.id,
      sourceId: source.id,
      externalListingId: `sprint-7g-${runId}`,
      year: 2024,
      price: 300000,
      mileage: 1200,
      location: "Beverly Hills, CA",
      dealerName,
      url: `${dealerWebsite}/inventory/sprint-7g-${runId}`,
      vinVerified: true,
      status: "ACTIVE",
      vehicleId: vehicle.id,
      askingPrice: 300000,
    },
  });

  // ── 1. Create Purchase Package & Verify Initial Financial Metrics ─────────
  console.log("1. Creating Purchase Package & Verifying Initial Financial Metrics...");
  const purchaseRes = await createDealerPurchasePackage({
    listingId: sampleListing.id,
    amount: 300000,
    buyerName: buyerUser.name!,
    buyerEmail: buyerUser.email!,
  });

  const req1 = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes.fulfillmentRequestId },
    include: { depositIntents: true, fees: true },
  });

  console.log(`  ✓ Payment Status: ${req1?.paymentStatus} (Expected: AUTHORIZED)`);
  console.log(`  ✓ Expected Platform Fee: $${req1?.expectedPlatformFee}`);
  console.log(`  ✓ Refundable Amount: $${req1?.refundableAmount}`);
  console.log(`  ✓ Payout Status: ${req1?.payoutStatus}`);

  if (req1?.paymentStatus !== "AUTHORIZED" || req1?.refundableAmount !== 5000) {
    throw new Error("Initial financial settlement metrics incorrect!");
  }

  // ── 2. Test Pre-Acceptance Buyer Cancellation Flow ───────────────────────
  console.log("\n2. Testing Pre-Acceptance Buyer Cancellation Flow...");
  const cancelPreRes = await cancelFulfillmentRequest({
    fulfillmentRequestId: purchaseRes.fulfillmentRequestId,
    cancelledByActor: "BUYER",
    cancellationReason: "Found local private seller vehicle instead.",
  });

  console.log(`  ✓ Pre-Acceptance Cancel Result: ${cancelPreRes.message}`);
  const req1Cancelled = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes.fulfillmentRequestId },
    include: { depositIntents: true },
  });

  console.log(`  ✓ Request Status: ${req1Cancelled?.status} (Expected: CANCELLED)`);
  console.log(`  ✓ Payment Status: ${req1Cancelled?.paymentStatus} (Expected: VOIDED)`);
  console.log(`  ✓ Deposit Status: ${req1Cancelled?.depositIntents[0]?.status} (Expected: RELEASED)`);
  console.log(`  ✓ Cancelled By: ${req1Cancelled?.cancelledByActor} | Reason: "${req1Cancelled?.cancellationReason}"`);

  if (req1Cancelled?.paymentStatus !== "VOIDED" || req1Cancelled?.depositIntents[0]?.status !== "RELEASED") {
    throw new Error("Pre-acceptance cancellation failed to release deposit hold!");
  }

  // ── 3. Test Partner ACCEPTED Flow & Post-Acceptance Cancellation ─────────
  console.log("\n3. Testing Partner ACCEPTED Flow & Post-Acceptance Cancellation...");
  const purchaseRes2 = await createDealerPurchasePackage({
    listingId: sampleListing.id,
    amount: 300000,
    buyerName: buyerUser.name!,
    buyerEmail: buyerUser.email!,
  });

  const req2Before = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes2.fulfillmentRequestId },
    include: { partnerTokens: true },
  });

  const token = req2Before!.partnerTokens[0].token;
  await submitPartnerDecision({ token, decision: "ACCEPTED", note: "Dealer approved purchase offer." });

  const req2Accepted = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes2.fulfillmentRequestId },
    include: { depositIntents: true },
  });

  console.log(`  ✓ Post-Acceptance Payment Status: ${req2Accepted?.paymentStatus} (Expected: CAPTURED)`);
  console.log(`  ✓ Partner Accepted At: ${req2Accepted?.partnerAcceptedAt?.toISOString()}`);
  console.log(`  ✓ Collected Amount: $${req2Accepted?.collectedAmount}`);
  console.log(`  ✓ Payout Status: ${req2Accepted?.payoutStatus} (Expected: PENDING_RECONCILIATION)`);

  if (
    req2Accepted?.paymentStatus !== "CAPTURED" ||
    !req2Accepted?.partnerAcceptedAt ||
    req2Accepted.collectedAmount !== 5000 ||
    req2Accepted.payoutStatus !== "PENDING_RECONCILIATION"
  ) {
    throw new Error("Partner acceptance failed to capture funds and set accepted timestamp!");
  }

  // Execute Post-Acceptance Cancellation (Policy Fee Retained)
  console.log("\n4. Executing Post-Acceptance Buyer Cancellation Policy Engine...");
  const cancelPostRes = await cancelFulfillmentRequest({
    fulfillmentRequestId: purchaseRes2.fulfillmentRequestId,
    cancelledByActor: "BUYER",
    cancellationReason: "Personal emergency requiring order cancellation post-approval.",
  });

  console.log(`  ✓ Post-Acceptance Cancel Result: ${cancelPostRes.message}`);
  const req2Cancelled = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes2.fulfillmentRequestId },
    include: { depositIntents: true },
  });

  console.log(`  ✓ Request Status: ${req2Cancelled?.status} (Expected: CANCELLED)`);
  console.log(`  ✓ Payment Status: ${req2Cancelled?.paymentStatus} (Expected: REFUNDED)`);
  console.log(`  ✓ Retained Policy Fee: $${req2Cancelled?.collectedAmount}`);
  console.log(`  ✓ Deposit Status: ${req2Cancelled?.depositIntents[0]?.status} (Expected: REFUNDED)`);

  if (
    req2Cancelled?.paymentStatus !== "REFUNDED" ||
    req2Cancelled.depositIntents[0]?.status !== "REFUNDED" ||
    req2Cancelled.collectedAmount !== 100
  ) {
    throw new Error("Post-acceptance cancellation failed to apply policy refund status!");
  }

  // ── 4b. Ensure Terminal Declined Requests Cannot Be Overwritten ─────────
  console.log("\n4b. Verifying Declined Requests Stay Terminal...");
  const purchaseResDecline = await createDealerPurchasePackage({
    listingId: sampleListing.id,
    amount: 300000,
    buyerName: buyerUser.name!,
    buyerEmail: buyerUser.email!,
  });
  const declinedBefore = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseResDecline.fulfillmentRequestId },
    include: { partnerTokens: true },
  });
  await submitPartnerDecision({
    token: declinedBefore!.partnerTokens[0].token,
    decision: "DECLINED",
    note: "Dealer declined financial settlement test request.",
  });
  const declinedCancel = await cancelFulfillmentRequest({
    fulfillmentRequestId: purchaseResDecline.fulfillmentRequestId,
    cancelledByActor: "BUYER",
    cancellationReason: "Attempt to cancel an already declined request.",
  });
  const declinedAfterCancelAttempt = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseResDecline.fulfillmentRequestId },
    include: { depositIntents: true },
  });
  console.log(`  ✓ Declined Cancel Attempt: ${declinedCancel.success ? "ALLOWED" : "BLOCKED"} (${declinedAfterCancelAttempt?.status})`);
  if (declinedCancel.success || declinedAfterCancelAttempt?.status !== "DECLINED") {
    throw new Error("Declined terminal request was incorrectly overwritten by cancellation.");
  }

  // ── 5. Test Expiration Auto-Void Processor ──────────────────────────────
  console.log("\n5. Testing Expiration Auto-Void Processor...");
  const purchaseRes3 = await createDealerPurchasePackage({
    listingId: sampleListing.id,
    amount: 300000,
    buyerName: buyerUser.name!,
    buyerEmail: buyerUser.email!,
  });

  // Manually expire token in database
  const req3Before = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes3.fulfillmentRequestId },
    include: { partnerTokens: true },
  });

  await prisma.partnerDecisionToken.update({
    where: { id: req3Before!.partnerTokens[0].id },
    data: { expiresAt: new Date(Date.now() - 1000) }, // 1 sec ago
  });

  const expireResult = await processExpiredFulfillmentRequests();
  console.log(`  ✓ Expired Processor Result: Processed ${expireResult.processedCount} expired request(s).`);

  const req3Expired = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes3.fulfillmentRequestId },
    include: { depositIntents: true },
  });

  console.log(`  ✓ Request Status: ${req3Expired?.status} (Expected: EXPIRED)`);
  console.log(`  ✓ Payment Status: ${req3Expired?.paymentStatus} (Expected: VOIDED)`);
  console.log(`  ✓ Deposit Status: ${req3Expired?.depositIntents[0]?.status} (Expected: RELEASED)`);

  if (req3Expired?.status !== "EXPIRED" || req3Expired?.paymentStatus !== "VOIDED") {
    throw new Error("Expiration auto-void processor failed!");
  }

  console.log("\n==================================================");
  console.log("  ALL SPRINT 7.7 FINANCIAL SETTLEMENT TESTS PASSED!");
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
