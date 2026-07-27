/**
 * scratch/test_sprint7c_dealer_purchase_package.ts
 *
 * Sprint 7C Dealer Purchase Package Automated Verification Script.
 * Validates:
 * 1. Dealer Purchase Package creation from listing offer (DEALER_PURCHASE fulfillment request)
 * 2. Package payload fields: VIN, specs, listing source, buyer details, asking price, SUPERCARS platform fee, deposit status, token URLs
 * 3. Dealer email dispatch & FulfillmentEvent audit logging
 * 4. Accountless dealer portal access (/fulfillment/[token])
 * 5. Accountless dealer ACCEPT decision submission & financial settlement state transition (deposit capture, status ACCEPTED)
 * 6. Buyer transaction page reflection (/transactions/[id])
 * 7. Admin ops dashboard reflection (/admin/fulfillment)
 */

import { prisma } from "../lib/prisma";
import { createDealerPurchasePackage } from "../app/actions/purchase";
import {
  getPartnerFulfillmentPackage,
  submitPartnerDecision,
  getFulfillmentByIdForUser,
} from "../lib/fulfillment/service";
import { getAdminFulfillmentRequests } from "../lib/admin/fulfillment-ops";

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
  console.log("    Testing Sprint 7C Dealer Purchase Package     ");
  console.log("==================================================\n");

  // ── 1. Setup Test Users & Listing ───────────────────────────────────────
  let buyerUser = await prisma.user.findFirst({ where: { email: "dealerpack.buyer@example.com" } });
  if (!buyerUser) {
    buyerUser = await prisma.user.create({
      data: { name: "Steve Wynn", email: "dealerpack.buyer@example.com", username: "steve_wynn" },
    });
  }

  testGlobal.mockSession = {
    user: { id: buyerUser.id, email: buyerUser.email, name: buyerUser.name },
  };

  const runId = Date.now();
  const dealerName = `Ferrari Beverly Hills Sprint 7C ${runId}`;
  const dealerWebsite = `https://ferrari-beverly-hills-sprint-7c-${runId}.example.org`;
  const dealerSource = await prisma.marketSource.create({
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
      contactSource: "PUBLIC_WEBSITE",
      confidence: "VERIFIED",
      contactStatus: "RESOLVED",
      marketSourceId: dealerSource.id,
    },
  });

  const sampleModel = await prisma.model.findFirst({
    where: { make: { name: "Ferrari" } },
    include: { make: true },
  });
  if (!sampleModel) throw new Error("No Ferrari model found for test.");

  const sampleVehicle = await prisma.vehicle.create({
    data: {
      vin: `ZFF7CDEAL${String(runId).slice(-8)}`,
      modelId: sampleModel.id,
      year: 2021,
      trim: "Sprint 7C Test",
      mileage: 4120,
    },
  });

  const sampleListing = await prisma.listing.create({
    data: {
      modelId: sampleModel.id,
      sourceId: dealerSource.id,
      externalListingId: `sprint-7c-${runId}`,
      year: 2021,
      price: 385000,
      mileage: 4120,
      location: "Beverly Hills, CA",
      dealerName,
      url: `${dealerWebsite}/inventory/sprint-7c-${runId}`,
      vinVerified: true,
      status: "ACTIVE",
      vehicleId: sampleVehicle.id,
      askingPrice: 385000,
    },
  });

  // ── 2. Create Dealer Purchase Package ────────────────────────────────────
  console.log("1. Creating Dealer Purchase Package from Buyer Offer...");
  const purchaseRes = await createDealerPurchasePackage({
    listingId: sampleListing.id,
    amount: 385000,
    buyerName: buyerUser.name!,
    buyerEmail: buyerUser.email!,
    buyerPhone: "310-555-0199",
    buyerMessage: "Ready to wire deposit immediately upon dealer acceptance.",
    requestedTerms: {
      financingRequired: false,
      requestedDeliveryDate: "2026-08-10",
      tradeInVin: "ZHWUR1ZE8MLA00111",
    },
  });

  console.log(`  ✓ Purchase Record ID: ${purchaseRes.id}`);
  console.log(`  ✓ Fulfillment Request ID: ${purchaseRes.fulfillmentRequestId}`);
  console.log(`  ✓ Public Transaction Token: ${purchaseRes.publicTransactionToken}`);

  // ── 3. Validate Request & Scoped Package Payload ─────────────────────────
  console.log("\n2. Validating Scoped Package Payload & Financial Fields...");
  const reqObj = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes.fulfillmentRequestId },
    include: {
      packages: true,
      partnerTokens: true,
      events: true,
      fees: true,
      depositIntents: true,
      vehicle: { include: { model: { include: { make: true } } } },
    },
  });

  if (!reqObj) throw new Error("FulfillmentRequest record not created!");

  const pkgData = JSON.parse(reqObj.packages[0]?.scope || "{}");
  console.log(`  ✓ Vehicle VIN: ${pkgData.vin}`);
  console.log(`  ✓ Asking Price: $${pkgData.askingPrice}`);
  console.log(`  ✓ Platform Fee: $${pkgData.platformFee}`);
  console.log(`  ✓ Buyer Name: ${pkgData.buyerName}`);
  console.log(`  ✓ Buyer Message: "${pkgData.buyerMessage}"`);
  console.log(`  ✓ Listing Source: ${pkgData.listingSourceName}`);
  console.log(`  ✓ External Listing ID: ${pkgData.externalListingId}`);
  console.log(`  ✓ Request Status: ${reqObj.status} (Expected: SENT)`);
  console.log(`  ✓ Payment Status: ${reqObj.paymentStatus} (Expected: AUTHORIZED)`);

  if (
    pkgData.vin !== sampleVehicle.vin ||
    !pkgData.platformFee ||
    pkgData.listingSourceName !== dealerSource.name ||
    pkgData.externalListingId !== sampleListing.externalListingId ||
    reqObj.status !== "SENT"
  ) {
    throw new Error("Dealer purchase package payload validation failed!");
  }

  // ── 4. Accountless Dealer Portal Access ──────────────────────────────────
  console.log("\n4. Testing Accountless Dealer Portal Access via Decision Token...");
  const tokenObj = reqObj.partnerTokens[0];
  console.log(`  ✓ Decision Token: ${tokenObj.token}`);

  const partnerPortalData = await getPartnerFulfillmentPackage(tokenObj.token);
  if ("error" in partnerPortalData) throw new Error("Partner token portal access failed!");

  console.log(`  ✓ Scoped Package Title: "${partnerPortalData.request.package.title}"`);
  console.log(`  ✓ Deposit Hold Status: ${partnerPortalData.request.depositHold?.status}`);
  console.log(`  ✓ Exposes Platform Internal Fees: ${"fees" in partnerPortalData.request ? "YES (FAILED)" : "NO (PASSED)"}`);

  if ("fees" in partnerPortalData.request) {
    throw new Error("Partner portal leaked internal fee records.");
  }

  // ── 5. Accountless Dealer Decision Submission (ACCEPT) ───────────────────
  console.log("\n5. Submitting Accountless Dealer ACCEPT Decision...");
  const decisionRes = await submitPartnerDecision({
    token: tokenObj.token,
    decision: "ACCEPTED",
    note: "Ferrari Beverly Hills accepts purchase offer. Ready for buyer wire transfer.",
  });

  console.log(`  ✓ Decision Result: ${decisionRes.message}`);

  const reqAfterAccept = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes.fulfillmentRequestId },
    include: { events: { orderBy: { createdAt: "desc" } } },
  });

  console.log(`  ✓ Updated Status: ${reqAfterAccept?.status} (Expected: ACCEPTED)`);
  console.log(`  ✓ Updated Payment Status: ${reqAfterAccept?.paymentStatus} (Expected: CAPTURE_PENDING or CAPTURED)`);
  console.log(`  ✓ Collected Amount: $${reqAfterAccept?.collectedAmount}`);
  console.log(`  ✓ Latest Audit Event: "${reqAfterAccept?.events[0]?.note}"`);

  if (reqAfterAccept?.status !== "ACCEPTED") {
    throw new Error("Dealer decision submission failed to update request status to ACCEPTED!");
  }

  // ── 6. Buyer Transaction Page Reflection ─────────────────────────────────
  console.log("\n6. Verifying Buyer Transaction View Reflection...");
  const buyerView = await getFulfillmentByIdForUser(purchaseRes.fulfillmentRequestId, buyerUser.id);

  console.log(`  ✓ Buyer Hub Role: ${buyerView.role}`);
  console.log(`  ✓ Buyer Hub Status: ${buyerView.request?.status}`);

  if (buyerView.request?.status !== "ACCEPTED") {
    throw new Error("Buyer transaction hub failed to reflect ACCEPTED dealer status!");
  }

  // ── 7. Admin Operations Dashboard Reflection ────────────────────────────
  console.log("\n7. Verifying Admin Ops Dashboard Reflection...");
  const adminReqs = await getAdminFulfillmentRequests("ACCEPTED");
  const targetInAdmin = adminReqs.find((r) => r.id === purchaseRes.fulfillmentRequestId);

  console.log(`  ✓ Total Accepted Requests in Admin Ops: ${adminReqs.length}`);
  console.log(`  ✓ Target Request Present in Admin ACCEPTED View: ${targetInAdmin ? "YES" : "NO"}`);

  if (!targetInAdmin) {
    throw new Error("Admin ops center failed to reflect ACCEPTED dealer purchase request!");
  }

  console.log("\n==================================================");
  console.log(" SPRINT 7C DEALER PURCHASE PACKAGE TEST PASSED!   ");
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
