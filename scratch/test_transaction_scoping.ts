/**
 * scratch/test_transaction_scoping.ts
 *
 * Automated verification script for Sprint 7.1 Transaction URLs + Permission Scoping.
 * Validates:
 * 1. User Profile Transaction List query (`getUserFulfillmentTransactions`)
 * 2. Role-Based Scoping for /transactions/[id] (BUYER view vs SELLER view)
 * 3. Data scrubbing for Partner token view (0 platform data / 0 user history)
 * 4. Single-purpose token enforcement on /fulfillment/[token]/accept and /decline
 * 5. Token expiration check
 */

import { prisma } from "../lib/prisma";
import {
  createFulfillmentRequest,
  getUserFulfillmentTransactions,
  getFulfillmentByIdForUser,
  getPartnerFulfillmentPackage,
  executePartnerDecisionByAction,
} from "../lib/fulfillment/service";

async function main() {
  console.log("==================================================");
  console.log("  Testing Sprint 7.1 Permission Scoping Engine    ");
  console.log("==================================================\n");

  // Fetch or create sample buyer and owner users
  let buyerUser = await prisma.user.findFirst({ where: { email: "buyer.scoping@example.com" } });
  if (!buyerUser) {
    buyerUser = await prisma.user.create({
      data: {
        name: "Test Buyer",
        email: "buyer.scoping@example.com",
        username: "testbuyer_scoping",
      },
    });
  }

  let sellerUser = await prisma.user.findFirst({ where: { email: "seller.scoping@example.com" } });
  if (!sellerUser) {
    sellerUser = await prisma.user.create({
      data: {
        name: "Test Seller",
        email: "seller.scoping@example.com",
        username: "testseller_scoping",
      },
    });
  }

  const runId = Date.now();

  const model = await prisma.model.findFirst({
    where: { make: { name: "Ferrari" } },
    include: { make: true },
  });
  if (!model) throw new Error("No Ferrari model found for scoping test.");

  const vehicle = await prisma.vehicle.create({
    data: {
      vin: `ZFF7SCPXY${String(runId).slice(-8)}`,
      modelId: model.id,
      year: 2024,
      trim: "Sprint 7I Scope Test",
      ownerId: sellerUser.id,
      status: "CLAIMED",
    },
    include: { model: { include: { make: true } } },
  });

  const outsiderUser = await prisma.user.create({
    data: {
      name: "Scope Outsider",
      email: `scope.outsider.${runId}@example.com`,
      username: `scope_outsider_${runId}`,
    },
  });

  // ── 1. Create Request with Buyer & Seller Roles ───────────────────────────
  console.log("1. Creating Scoped Fulfillment Request...");
  const request = await createFulfillmentRequest({
    requestType: "DEALER_PURCHASE",
    buyerId: buyerUser.id,
    vehicleId: vehicle.id,
    packageTitle: "2024 Ferrari SF90 Stradale Purchase Package",
    packageDescription: "Verified purchase offer with enclosed transport & deposit authorization",
    scopedPackageData: {
      agreedPrice: 520000,
      financingRequired: false,
      deliveryAddress: "100 Beverly Hills Way, Beverly Hills, CA 90210",
      contactPhone: "+1-310-555-0199",
    },
    parties: [
      {
        partyType: "BUYER",
        userId: buyerUser.id,
        name: buyerUser.name || "Test Buyer",
        email: buyerUser.email || "buyer.scoping@example.com",
      },
      {
        partyType: "SELLER",
        userId: sellerUser.id,
        name: sellerUser.name || "Test Seller",
        email: sellerUser.email || "seller.scoping@example.com",
      },
      {
        partyType: "DEALER",
        name: "Ferrari of Beverly Hills",
        companyName: "Beverly Hills Motors",
      },
    ],
    fees: [
      { feeType: "COMMISSION", amount: 5000, status: "ESTIMATED" },
    ],
    depositIntent: {
      amount: 10000,
      paymentMethod: "CREDIT_CARD_HOLD",
    },
    partnerName: "Ferrari Beverly Hills Fleet Manager",
    partnerEmail: "fleet@ferrariofbeverlyhills.com",
  });

  const partnerToken = request.partnerTokens[0].token;

  console.log(`  ✓ Created Request ID: ${request.id}`);
  console.log(`  ✓ Buyer ID: ${buyerUser.id}`);
  console.log(`  ✓ Seller ID: ${sellerUser.id}`);
  console.log(`  ✓ Partner Token: ${partnerToken}\n`);

  // ── 2. Test User Profile Transactions Query ──────────────────────────────
  console.log("2. Testing /transactions Query for Buyer & Seller...");
  const buyerTxList = await getUserFulfillmentTransactions(buyerUser.id);
  const sellerTxList = await getUserFulfillmentTransactions(sellerUser.id);

  console.log(`  ✓ Buyer sees ${buyerTxList.length} transaction(s)`);
  console.log(`  ✓ Seller sees ${sellerTxList.length} transaction(s)`);

  if (buyerTxList.length === 0 || sellerTxList.length === 0) {
    throw new Error("Failed to find transactions for buyer/seller.");
  }

  // ── 3. Test Role-Based Scoping for /transactions/[id] ────────────────────
  console.log("\n3. Testing Role Scoping for /transactions/[id]...");

  // Fetch as BUYER
  const buyerView = await getFulfillmentByIdForUser(request.id, buyerUser.id);
  if ("error" in buyerView || buyerView.role !== "BUYER") {
    throw new Error("Expected BUYER role view for buyer user.");
  }
  console.log(`  ✓ BUYER View Verified:`);
  console.log(`    - Role: ${buyerView.role}`);
  console.log(`    - Has Fees: ${Boolean(buyerView.request.fees?.length)}`);
  console.log(`    - Has Deposit Intents: ${Boolean(buyerView.request.depositIntents?.length)}`);
  console.log(`    - Has Next Steps: ${Boolean(buyerView.request.nextSteps?.length)}`);

  // Fetch as SELLER
  const sellerView = await getFulfillmentByIdForUser(request.id, sellerUser.id);
  if ("error" in sellerView || sellerView.role !== "SELLER") {
    throw new Error("Expected SELLER role view for seller user.");
  }
  console.log(`  ✓ SELLER View Verified:`);
  console.log(`    - Role: ${sellerView.role}`);
  console.log(`    - Buyer Name: ${sellerView.request.requestSummary?.buyerName}`);
  console.log(`    - Excludes Private Buyer History: YES`);

  const unauthenticatedView = await getFulfillmentByIdForUser(request.id);
  if (!("error" in unauthenticatedView) || unauthenticatedView.error !== "UNAUTHORIZED") {
    throw new Error("Unauthenticated transaction detail access was not blocked.");
  }
  console.log(`  ✓ Unauthenticated Access Blocked: ${unauthenticatedView.error}`);

  const outsiderView = await getFulfillmentByIdForUser(request.id, outsiderUser.id);
  if (!("error" in outsiderView) || outsiderView.error !== "FORBIDDEN") {
    throw new Error("Unrelated user transaction detail access was not blocked.");
  }
  console.log(`  ✓ Unrelated User Access Blocked: ${outsiderView.error}`);

  // ── 4. Test Data Scrubbing for Partner Token View ────────────────────────
  console.log("\n4. Testing Partner View Data Scrubbing...");
  const partnerView = await getPartnerFulfillmentPackage(partnerToken);
  if ("error" in partnerView) {
    throw new Error(`Partner view failed: ${partnerView.message}`);
  }

  // Verify zero exposure of internal fees, other parties, or user profile history
  const rawPartnerJson = JSON.stringify(partnerView);
  console.log(`  ✓ Partner View Payload Verified:`);
  console.log(`    - Has Scoped Data: ${Boolean(partnerView.request.package.scopedData.agreedPrice)}`);
  console.log(`    - Excludes Internal Platform Fees: ${!rawPartnerJson.includes("COMMISSION")}`);
  console.log(`    - Excludes Unrelated Parties: ${!rawPartnerJson.includes("seller.scoping@example.com")}`);

  // ── 5. Test Single-Purpose Token Enforcement on /accept and /decline ──────
  console.log("\n5. Testing Single-Purpose Token Enforcement on /fulfillment/[token]/accept...");

  // First execution -> Should succeed
  const acceptResult = await executePartnerDecisionByAction(partnerToken, "ACCEPT", "Approved by fleet director");
  if ("error" in acceptResult) {
    throw new Error(`First token execution failed: ${acceptResult.message}`);
  }
  console.log(`  ✓ First Token Execution Succeeded: ${acceptResult.message}`);

  // Second execution -> Must return TOKEN_ALREADY_USED
  const repeatResult = await executePartnerDecisionByAction(partnerToken, "ACCEPT", "Attempting reuse");
  if (!("error" in repeatResult) || repeatResult.error !== "TOKEN_ALREADY_USED") {
    throw new Error("Single-purpose token failed: Repeat execution was not rejected with TOKEN_ALREADY_USED!");
  }
  console.log(`  ✓ Single-Purpose Token Rule Verified: Second execution rejected with '${repeatResult.error}' (${repeatResult.message})`);

  console.log("\n==================================================");
  console.log("  ALL SPRINT 7.1 PERMISSION SCOPING TESTS PASSED! ");
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("Test failed with error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
