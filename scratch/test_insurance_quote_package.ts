/**
 * scratch/test_insurance_quote_package.ts
 *
 * Automated verification script for Sprint 7.4 Insurance Referral Package.
 * Validates:
 * 1. createInsuranceQuotePackage Action execution
 * 2. All 8 required insurance quote package fields present in scoped payload
 * 3. Resolution of verified insurance PartnerContact (Hagerty Private Client Insurance)
 * 4. Referral commission tracking (status: ESTIMATED / PENDING_BIND)
 * 5. NO PREMATURE COMPLETION rule (status: QUOTE_STARTED / SENT, NOT COMPLETED)
 * 6. Live buyer hub update on partner accept ("Quote Accepted — Partner will contact you directly")
 */

import { prisma } from "../lib/prisma";
import { createInsuranceQuotePackage } from "../app/actions/purchase";
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
  console.log("  Testing Sprint 7.4 Insurance Referral Package   ");
  console.log("==================================================\n");

  // Mock global session
  let buyerUser = await prisma.user.findFirst({ where: { email: "buyer.insurancepkg@example.com" } });
  if (!buyerUser) {
    buyerUser = await prisma.user.create({
      data: {
        name: "Bruce Wayne",
        email: "buyer.insurancepkg@example.com",
        username: "bruce_insurancepkg",
      },
    });
  }

  testGlobal.mockSession = {
    user: { id: buyerUser.id, email: buyerUser.email, name: buyerUser.name },
  };

  const runId = Date.now();
  const carrierName = `Hagerty Private Client Insurance Sprint 7D ${runId}`;
  await prisma.partnerContact.create({
    data: {
      name: carrierName,
      type: "INSURER",
      email: "privateclient@hagerty.com",
      phone: "+1-888-347-4357",
      website: "https://www.hagerty.com",
      makeSpecialization: "ALL",
      location: "Traverse City, MI",
      contactSource: "PUBLIC_WEBSITE",
      confidence: "VERIFIED",
      contactStatus: "RESOLVED",
    },
  });

  const source = await prisma.marketSource.create({
    data: {
      name: `Sprint 7D Insurance Test Source ${runId}`,
      type: "DEALER",
      website: `https://sprint-7d-insurance-${runId}.example.org`,
    },
  });

  const sampleModel = await prisma.model.findFirst({
    where: { make: { name: "Ferrari" } },
    include: { make: true },
  });
  if (!sampleModel) throw new Error("No Ferrari model found for insurance test.");

  const vehicle = await prisma.vehicle.create({
    data: {
      vin: `ZFF7DREF${String(runId).slice(-9)}`,
      modelId: sampleModel.id,
      year: 2022,
      trim: "Sprint 7D Test",
      mileage: 2750,
    },
  });

  const listing = await prisma.listing.create({
    data: {
      modelId: sampleModel.id,
      sourceId: source.id,
      externalListingId: `sprint-7d-${runId}`,
      year: 2022,
      price: 350000,
      mileage: 2750,
      location: "Miami, FL",
      dealerName: source.name,
      url: `${source.website}/inventory/sprint-7d-${runId}`,
      vinVerified: true,
      status: "ACTIVE",
      vehicleId: vehicle.id,
      askingPrice: 350000,
    },
  });

  const purchase = await prisma.purchase.create({
    data: {
      listingId: listing.id,
      buyerId: buyerUser.id,
      amount: 350000,
      status: "PENDING",
    },
    include: { listing: { include: { vehicle: true } } },
  });

  console.log(`Using purchase ID: ${purchase.id} (Amount: $${purchase.amount.toLocaleString()})\n`);

  // ── 1. Execute createInsuranceQuotePackage Action ───────────────────────
  console.log("1. Executing createInsuranceQuotePackage Action...");
  const quoteResult = await createInsuranceQuotePackage({
    purchaseId: purchase.id,
    carrierName,
    intendedUse: "PLEASURE_COLLECTION",
    coveragePreference: "AGREED_VALUE_FULL_COVERAGE",
    garagingState: "CA",
    garagingZip: "90210",
  });

  console.log(`  ✓ Insurance Request ID: ${quoteResult.id}`);
  console.log(`  ✓ Fulfillment Request ID: ${quoteResult.fulfillmentRequestId}`);
  console.log(`  ✓ Public Transaction Token: ${quoteResult.publicTransactionToken}`);
  console.log(`  ✓ Insurance Request Status: ${quoteResult.status} (Expected: QUOTE_STARTED / SENT)`);

  // ── 2. Verify NO PREMATURE COMPLETION Rule ───────────────────────────────
  console.log("\n2. Verifying NO PREMATURE COMPLETION Rule...");
  const dbInsuranceReq = await prisma.insuranceRequest.findUnique({
    where: { id: quoteResult.id },
  });

  console.log(`  ✓ DB Insurance Request Status: ${dbInsuranceReq?.status} (Expected: QUOTE_STARTED, NOT COMPLETED!)`);
  if (dbInsuranceReq?.status === "COMPLETED") {
    throw new Error("Premature completion rule violated! Insurance request was marked COMPLETED upon quote selection.");
  }

  // ── 3. Verify All 8 Quote Package Fields in Scoped Payload ───────────────
  console.log("\n3. Verifying All 8 Insurance Package Fields in Scoped Data...");
  const dbFulfillment = await prisma.fulfillmentRequest.findUnique({
    where: { id: quoteResult.fulfillmentRequestId },
    include: {
      packages: true,
      partnerTokens: true,
      fees: true,
    },
  });

  const rawScope = dbFulfillment?.packages[0]?.scope;
  if (!rawScope) throw new Error("Scoped quote package missing!");

  const payload = JSON.parse(rawScope);
  const requiredFields = [
    "buyerContact",
    "vehicle",
    "agreedValue",
    "garagingLocation",
    "intendedUse",
    "coveragePreference",
    "requestedQuoteDeadline",
    "referralCommissionMetadata",
  ];

  console.log(`  ✓ Scoped Package Title: "${dbFulfillment.packages[0].title}"`);
  console.log(`  ✓ Agreed Value: $${payload.agreedValue.toLocaleString()}`);
  console.log(`  ✓ Intended Use: ${payload.intendedUse}`);
  console.log(`  ✓ Vehicle VIN: ${payload.vehicle.vin}`);
  console.log(`  ✓ Referral Commission: $${payload.referralCommissionMetadata.estimatedCommission} (${payload.referralCommissionMetadata.status})`);

  for (const field of requiredFields) {
    if (payload[field] === undefined) {
      throw new Error(`Required insurance field '${field}' missing from quote package!`);
    }
  }
  if (payload.vehicle.vin !== vehicle.vin) {
    throw new Error("Insurance package did not use the VIN-backed vehicle from the purchase listing!");
  }
  console.log(`  ✓ All ${requiredFields.length} required fields verified in insurance package payload.`);

  // ── 4. Verify Referral Fee Tracking ─────────────────────────────────────
  console.log("\n4. Verifying Referral Commission Fee Record...");
  const referralFee = dbFulfillment.fees.find((f) => f.feeType === "REFERRAL_FEE");
  console.log(`  ✓ Fee Type: ${referralFee?.feeType} | Amount: $${referralFee?.amount} | Status: ${referralFee?.status}`);
  if (!referralFee || referralFee.amount !== 250 || referralFee.status !== "ESTIMATED") {
    throw new Error("Referral fee tracking status is invalid!");
  }

  // ── 5. Simulate Insurance Partner Decision (ACCEPT) ──────────────────────
  console.log("\n5. Simulating Insurance Partner Accept Decision...");
  const partnerToken = dbFulfillment.partnerTokens[0].token;

  const partnerView = await getPartnerFulfillmentPackage(partnerToken);
  if ("error" in partnerView) throw new Error(`Partner view failed: ${partnerView.message}`);

  const acceptResult = await submitPartnerDecision({
    token: partnerToken,
    decision: "ACCEPTED",
    note: "Hagerty Private Client underwriting team accepted quote parameters. Broker assigned.",
  });
  console.log(`  ✓ Partner Decision Result: ${acceptResult.message}`);

  const requestAfterAccept = await prisma.fulfillmentRequest.findUnique({
    where: { id: quoteResult.fulfillmentRequestId },
    include: { fees: true },
  });
  const referralAfterAccept = requestAfterAccept?.fees.find((f) => f.feeType === "REFERRAL_FEE");
  console.log(`  ✓ Referral Fee After Accept: ${referralAfterAccept?.status} (Expected: ESTIMATED / PENDING_BIND)`);
  if (referralAfterAccept?.status !== "ESTIMATED" || requestAfterAccept?.paymentStatus !== "NOT_REQUIRED") {
    throw new Error("Insurance partner acceptance prematurely captured referral commission or payment.");
  }

  // ── 6. Verify Buyer Hub Shows Accepted Callout ───────────────────────────
  console.log("\n6. Verifying Buyer Transaction Hub Quote Accepted Banner...");
  const buyerTx = await getBuyerFulfillmentTransaction(quoteResult.publicTransactionToken);
  if ("error" in buyerTx || !buyerTx.request) throw new Error("Failed to fetch buyer transaction.");

  console.log(`  ✓ Buyer Transaction Hub Status: ${buyerTx.request.status} (Expected: ACCEPTED)`);
  console.log(`  ✓ Latest Timeline Note: "${buyerTx.request.events.at(-1)?.note}"`);

  if (buyerTx.request.status !== "ACCEPTED") {
    throw new Error("Buyer transaction status failed to update to ACCEPTED after partner quote acceptance!");
  }

  console.log("\n==================================================");
  console.log("  ALL SPRINT 7.4 INSURANCE PACKAGE TESTS PASSED!  ");
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
