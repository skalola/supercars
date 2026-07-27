/**
 * scratch/test_admin_ops_layer.ts
 *
 * Automated verification script for Sprint 8.0 Admin/Operations Review Layer.
 * Validates:
 * 1. KPI Metrics calculation (total requests, accepted/declined, stuck/expired, failed emails, pending refunds, commission totals, partner confidence)
 * 2. Operational tab filtering (getAdminFulfillmentRequests)
 * 3. Execution of Admin operational controls (resendFulfillmentEmailAdmin, adminCancelAndRefund, adminMarkCompleted)
 * 4. Verification that admin actions produce immutable FulfillmentEvent records with actorType: "ADMIN"
 */

import { prisma } from "../lib/prisma";
import {
  getAdminFulfillmentMetrics,
  getAdminFulfillmentRequests,
  resendFulfillmentEmailAdmin,
  adminCancelAndRefund,
  adminMarkCompleted,
} from "../lib/admin/fulfillment-ops";
import { submitPartnerDecision } from "../lib/fulfillment/service";
import { createDealerPurchasePackage } from "../app/actions/purchase";

async function seedAdminOpsListing() {
  const runId = Date.now().toString();
  const dealerName = "Admin Ops Test Ferrari Miami";
  const dealerWebsite = "https://admin-ops-test.ferrarimiami.example";
  const source = await prisma.marketSource.upsert({
    where: { name: dealerName },
    update: {
      type: "DEALER",
      website: dealerWebsite,
      active: true,
    },
    create: {
      name: dealerName,
      type: "DEALER",
      website: dealerWebsite,
      active: true,
    },
  });

  await prisma.partnerContact.upsert({
    where: { marketSourceId: source.id },
    update: {
      name: dealerName,
      type: "DEALER",
      email: "purchase.adminops@ferrarimiami.example",
      website: dealerWebsite,
      makeSpecialization: "Ferrari",
      contactSource: "MANUALLY_VERIFIED",
      confidence: "VERIFIED",
      contactStatus: "RESOLVED",
      active: true,
    },
    create: {
      name: dealerName,
      type: "DEALER",
      email: "purchase.adminops@ferrarimiami.example",
      website: dealerWebsite,
      makeSpecialization: "Ferrari",
      contactSource: "MANUALLY_VERIFIED",
      confidence: "VERIFIED",
      contactStatus: "RESOLVED",
      marketSourceId: source.id,
    },
  });

  const make = await prisma.make.upsert({
    where: { name: "Ferrari" },
    update: {},
    create: { name: "Ferrari", slug: "ferrari" },
  });

  const model = await prisma.model.upsert({
    where: {
      makeId_slug: {
        makeId: make.id,
        slug: "f8-tributo",
      },
    },
    update: {},
    create: {
      makeId: make.id,
      name: "F8 Tributo",
      slug: "f8-tributo",
      category: "Supercar",
    },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      vin: `ZFF90HLA0L${runId.slice(-7)}`,
      modelId: model.id,
      year: 2021,
      trim: "Admin Ops Test",
      mileage: 3100,
    },
  });

  return prisma.listing.create({
    data: {
      modelId: model.id,
      sourceId: source.id,
      externalListingId: `admin-ops-${runId}`,
      year: 2021,
      price: 350000,
      mileage: 3100,
      location: "Miami, FL",
      dealerName,
      url: `${dealerWebsite}/inventory/admin-ops-${runId}`,
      vinVerified: true,
      status: "ACTIVE",
      vehicleId: vehicle.id,
      askingPrice: 350000,
    },
  });
}

async function main() {
  console.log("==================================================");
  console.log("    Testing Sprint 8.0 Admin Ops Review Layer     ");
  console.log("==================================================\n");

  // ── 1. Setup Test Data ──────────────────────────────────────────────────
  let buyerUser = await prisma.user.findFirst({ where: { email: "adminops.buyer@example.com" } });
  if (!buyerUser) {
    buyerUser = await prisma.user.create({
      data: {
        name: "Bernard Arnault",
        email: "adminops.buyer@example.com",
        username: "bernard_ops",
      },
    });
  }

  (globalThis as any).mockSession = {
    user: { id: buyerUser.id, email: buyerUser.email, name: buyerUser.name },
  };

  const sampleListing = await seedAdminOpsListing();

  // Create a purchase package
  console.log("1. Seeding Fulfillment Request for Operational Control Tests...");
  const purchaseRes = await createDealerPurchasePackage({
    listingId: sampleListing.id,
    amount: 350000,
    buyerName: buyerUser.name!,
    buyerEmail: buyerUser.email!,
  });

  // ── 2. Test getAdminFulfillmentMetrics Aggregation ───────────────────────
  console.log("\n2. Testing getAdminFulfillmentMetrics Aggregation...");
  const metrics = await getAdminFulfillmentMetrics();

  console.log(`  ✓ Total Requests: ${metrics.totalRequests}`);
  console.log(`  ✓ Accepted Count: ${metrics.acceptedCount}`);
  console.log(`  ✓ Declined Count: ${metrics.declinedCount}`);
  console.log(`  ✓ Stuck / Expired Count: ${metrics.stuckOrExpiredCount}`);
  console.log(`  ✓ Failed Email Count: ${metrics.failedEmailsCount}`);
  console.log(`  ✓ Pending Refunds Count: ${metrics.pendingRefundsCount}`);
  console.log(`  ✓ Total Commission Expected: $${metrics.totalCommissionExpected}`);
  console.log(`  ✓ Total Commission Collected: $${metrics.totalCommissionCollected}`);
  console.log(`  ✓ Partner Confidence: Verified=${metrics.partnerConfidence.verified}, Public=${metrics.partnerConfidence.publicSource}, Unresolved=${metrics.partnerConfidence.unresolvedEmail}`);

  if (typeof metrics.totalRequests !== "number" || typeof metrics.stuckOrExpiredCount !== "number") {
    throw new Error("getAdminFulfillmentMetrics failed to return valid metric counts!");
  }

  // ── 3. Test getAdminFulfillmentRequests Tab Filters ─────────────────────
  console.log("\n3. Testing getAdminFulfillmentRequests Tab Filters...");
  const allReqs = await getAdminFulfillmentRequests("ALL");
  const stuckReqs = await getAdminFulfillmentRequests("STUCK_EXPIRED");

  console.log(`  ✓ All Requests Count: ${allReqs.length}`);
  console.log(`  ✓ Stuck/Expired Requests Count: ${stuckReqs.length}`);

  if (!Array.isArray(allReqs) || !Array.isArray(stuckReqs)) {
    throw new Error("getAdminFulfillmentRequests failed to return array of requests!");
  }

  // ── 4. Test Admin Action: Resend Email Notification ──────────────────────
  console.log("\n4. Testing Admin Action: Resend Email Notification...");
  const resendResult = await resendFulfillmentEmailAdmin(purchaseRes.fulfillmentRequestId);
  console.log(`  ✓ Resend Result: ${resendResult.message}`);

  const reqAfterResend = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes.fulfillmentRequestId },
    include: {
      partnerTokens: true,
      events: { orderBy: { createdAt: "desc" } },
    },
  });

  const latestResendEvent = reqAfterResend?.events[0];
  console.log(`  ✓ Latest Event Actor: ${latestResendEvent?.actorType} | Note: "${latestResendEvent?.note}"`);

  if (latestResendEvent?.actorType !== "ADMIN") {
    throw new Error("Admin resend action failed to log ADMIN actorType event!");
  }

  // ── 5. Test Admin Action: Mark Completed Manually ────────────────────────
  console.log("\n5. Testing Admin Action: Mark Completed Manually...");
  const firstPartnerToken = reqAfterResend?.partnerTokens[0]?.token;
  if (!firstPartnerToken) throw new Error("Missing partner decision token for admin completion test.");

  await submitPartnerDecision({
    token: firstPartnerToken,
    decision: "ACCEPTED",
    note: "Partner accepted admin ops completion fixture.",
  });

  const completeResult = await adminMarkCompleted(
    purchaseRes.fulfillmentRequestId,
    "Admin manual completion override post-inspection."
  );

  console.log(`  ✓ Mark Complete Result: ${completeResult.message}`);

  const reqCompleted = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes.fulfillmentRequestId },
    include: { events: { orderBy: { createdAt: "desc" } } },
  });

  console.log(`  ✓ Status: ${reqCompleted?.status} (Expected: COMPLETED)`);
  console.log(`  ✓ Payout Status: ${reqCompleted?.payoutStatus} (Expected: RECONCILED)`);
  console.log(`  ✓ Completed At: ${reqCompleted?.completedAt?.toISOString()}`);
  console.log(`  ✓ Latest Event Actor: ${reqCompleted?.events[0]?.actorType}`);

  if (reqCompleted?.status !== "COMPLETED" || reqCompleted?.payoutStatus !== "RECONCILED") {
    throw new Error("Admin mark completed action failed to update request status and payout status!");
  }

  // ── 6. Test Admin Action: Cancel and Refund ─────────────────────────────
  console.log("\n6. Testing Admin Action: Admin Cancel and Refund...");
  const purchaseRes2 = await createDealerPurchasePackage({
    listingId: sampleListing.id,
    amount: 350000,
    buyerName: buyerUser.name!,
    buyerEmail: buyerUser.email!,
  });

  const reqBeforeCancel = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes2.fulfillmentRequestId },
    include: { partnerTokens: true },
  });
  const secondPartnerToken = reqBeforeCancel?.partnerTokens[0]?.token;
  if (!secondPartnerToken) throw new Error("Missing partner decision token for admin cancellation test.");

  await submitPartnerDecision({
    token: secondPartnerToken,
    decision: "ACCEPTED",
    note: "Partner accepted admin ops cancellation fixture.",
  });

  const cancelResult = await adminCancelAndRefund(
    purchaseRes2.fulfillmentRequestId,
    "Admin manual cancellation override."
  );

  console.log(`  ✓ Admin Cancel Result: ${cancelResult.message}`);

  const reqCancelled = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes2.fulfillmentRequestId },
    include: { depositIntents: true },
  });

  console.log(`  ✓ Status: ${reqCancelled?.status} (Expected: CANCELLED)`);
  console.log(`  ✓ Payment Status: ${reqCancelled?.paymentStatus}`);
  console.log(`  ✓ Cancelled By Actor: ${reqCancelled?.cancelledByActor} (Expected: ADMIN)`);

  if (reqCancelled?.status !== "CANCELLED" || reqCancelled?.cancelledByActor !== "ADMIN") {
    throw new Error("Admin cancel and refund action failed!");
  }

  const settlementReqs = await getAdminFulfillmentRequests("PENDING_REFUNDS");
  if (!settlementReqs.some((req) => req.id === purchaseRes2.fulfillmentRequestId)) {
    throw new Error("Pending refund/settlement filter did not include admin-cancelled accepted request.");
  }

  console.log("\n==================================================");
  console.log("  ALL SPRINT 8.0 ADMIN OPS LAYER TESTS PASSED!");
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
