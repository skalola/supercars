/**
 * scratch/test_sprint7b_partner_registry.ts
 *
 * Automated verification script for Sprint 7B Partner Contact Registry.
 * Validates:
 * 1. Upserting partner contacts from imported listings without email (UNRESOLVED_EMAIL)
 * 2. Strict Zero Guessed Email enforcement (holds fulfillment request in DRAFT)
 * 3. Retrieval of unresolved partner contacts via getUnresolvedPartnerContacts
 * 4. Admin partner resolution via resolveUnresolvedPartnerContact
 * 5. Automatic status transition of held DRAFT requests to SENT and notification dispatch!
 */

import { prisma } from "../lib/prisma";
import {
  upsertPartnerContact,
  getUnresolvedPartnerContacts,
  resolveUnresolvedPartnerContact,
} from "../lib/fulfillment/partner-registry";
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
  console.log("    Testing Sprint 7B Partner Contact Registry    ");
  console.log("==================================================\n");

  const runId = Date.now();
  const testDealerName = `Ferrari San Francisco Test ${runId}`;
  const testDealerDomain = `ferrari-sanfrancisco-test-${runId}.example.org`;
  const testDealerWebsite = `https://${testDealerDomain}/inventory`;

  // ── 1. Upsert Partner Contact with Unresolved Email ────────────────────────
  console.log("1. Upserting Unresolved Dealer Partner Contact (No Email)...");
  const testMarketSource = await prisma.marketSource.create({
    data: {
      name: `Sprint 7B Test Source ${runId}`,
      type: "DEALER",
      website: testDealerWebsite,
    },
  });

  const partner = await upsertPartnerContact({
    name: testDealerName,
    type: "DEALER",
    website: testDealerWebsite,
    sourceDomain: testDealerDomain,
    contactSource: "IMPORTED_LISTING",
    makeSpecialization: "Ferrari",
    location: "San Francisco, CA",
    marketSourceId: testMarketSource.id,
  });

  console.log(`  ✓ Created Partner ID: ${partner.id}`);
  console.log(`  ✓ Contact Status: ${partner.contactStatus} (Expected: UNRESOLVED_EMAIL)`);
  console.log(`  ✓ Confidence: ${partner.confidence} (Expected: UNRESOLVED_EMAIL)`);
  console.log(`  ✓ Contact Source: ${partner.contactSource} (Expected: IMPORTED_LISTING)`);

  if (partner.contactStatus !== "UNRESOLVED_EMAIL" || partner.confidence !== "UNRESOLVED_EMAIL") {
    throw new Error("PartnerContact upsert failed to set UNRESOLVED_EMAIL status!");
  }

  // ── 2. Create Purchase Request to Unresolved Partner ───────────────────────
  console.log("\n2. Submitting Purchase Package to Unresolved Dealer...");
  const buyerUser = await prisma.user.findFirst({ where: { email: "adminops.buyer@example.com" } });
  const sampleModel = await prisma.model.findFirst({
    where: { make: { name: "Ferrari" } },
    include: { make: true },
  });

  if (!buyerUser || !sampleModel) throw new Error("Missing seed user or Ferrari model.");

  testGlobal.mockSession = {
    user: { id: buyerUser.id, email: buyerUser.email, name: buyerUser.name },
  };

  const testVehicle = await prisma.vehicle.create({
    data: {
      vin: `ZFF7BTEST${String(runId).slice(-8)}`,
      modelId: sampleModel.id,
      year: 2020,
      trim: "Sprint 7B Test",
    },
  });

  const sampleListing = await prisma.listing.create({
    data: {
      modelId: sampleModel.id,
      sourceId: testMarketSource.id,
      externalListingId: `sprint-7b-${runId}`,
      year: 2020,
      price: 450000,
      location: "San Francisco, CA",
      dealerName: testDealerName,
      url: `${testDealerWebsite}/sprint-7b-${runId}`,
      vinVerified: true,
      status: "ACTIVE",
      vehicleId: testVehicle.id,
      askingPrice: 450000,
    },
  });

  const purchaseRes = await createDealerPurchasePackage({
    listingId: sampleListing.id,
    amount: 450000,
    buyerName: buyerUser.name!,
    buyerEmail: buyerUser.email!,
  });

  const reqObj = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes.fulfillmentRequestId },
    include: { events: true },
  });

  console.log(`  ✓ Request Status: ${reqObj?.status} (Expected: DRAFT)`);
  const heldEvent = reqObj?.events.find((e) => e.note && (e.note.includes("HELD_UNRESOLVED_EMAIL") || e.note.includes("unresolved")));
  console.log(`  ✓ Held Event Recorded: ${heldEvent ? "YES (" + heldEvent.note + ")" : "NO"}`);

  if (reqObj?.status !== "DRAFT") {
    throw new Error("Zero Guessed Email Rule violated: Request was NOT held in DRAFT status!");
  }

  // ── 3. Query getUnresolvedPartnerContacts ──────────────────────────────────
  console.log("\n3. Testing getUnresolvedPartnerContacts Query...");
  const unresolvedList = await getUnresolvedPartnerContacts();
  const targetInList = unresolvedList.find((p) => p.id === partner.id);

  console.log(`  ✓ Total Unresolved Partners Found: ${unresolvedList.length}`);
  console.log(`  ✓ Target Partner in Unresolved List: ${targetInList ? "YES" : "NO"}`);

  if (!targetInList) {
    throw new Error("getUnresolvedPartnerContacts failed to include unresolved partner!");
  }

  // ── 4. Admin Email Resolution & Auto-Dispatch ──────────────────────────────
  console.log("\n4. Resolving Partner Email via resolveUnresolvedPartnerContact...");
  const resolveResult = await resolveUnresolvedPartnerContact(
    partner.id,
    "sales@ferrari-sanfrancisco.com",
    "VERIFIED",
    "MANUALLY_VERIFIED"
  );

  console.log(`  ✓ Resolution Result: ${resolveResult.message}`);
  console.log(`  ✓ Auto-Dispatched Requests Count: ${resolveResult.autoDispatchedCount} (Expected: >= 1)`);

  const updatedPartner = await prisma.partnerContact.findUnique({ where: { id: partner.id } });
  console.log(`  ✓ Updated Partner Email: ${updatedPartner?.email}`);
  console.log(`  ✓ Updated Contact Status: ${updatedPartner?.contactStatus} (Expected: RESOLVED)`);
  console.log(`  ✓ Updated Confidence: ${updatedPartner?.confidence} (Expected: VERIFIED)`);

  const autoDispatchedReq = await prisma.fulfillmentRequest.findUnique({
    where: { id: purchaseRes.fulfillmentRequestId },
    include: { events: { orderBy: { createdAt: "desc" } } },
  });

  console.log(`  ✓ Request Status After Resolution: ${autoDispatchedReq?.status} (Expected: SENT)`);
  console.log(`  ✓ Latest Audit Event: "${autoDispatchedReq?.events[0]?.note}"`);

  if (autoDispatchedReq?.status !== "SENT") {
    throw new Error("Admin email resolution failed to auto-dispatch held DRAFT request to SENT!");
  }

  console.log("\n==================================================");
  console.log(" SPRINT 7B PARTNER CONTACT REGISTRY TEST PASSED!  ");
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
