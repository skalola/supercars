/**
 * scratch/test_sprint8g_partner_package_scoping.ts
 *
 * Sprint 8G verification:
 * 1. Partner token pages expose only the partner package decision scope.
 * 2. Platform fees, payout state, collected/refundable amounts, and decision URLs
 *    are not present in the raw partner payload.
 * 3. Partner can still see required vehicle, request status, scoped work details,
 *    and deposit hold information needed to accept or decline.
 */

import { prisma } from "../lib/prisma";
import {
  createFulfillmentRequest,
  getPartnerFulfillmentPackage,
} from "../lib/fulfillment/service";

async function ensureVehicle() {
  const make = await prisma.make.upsert({
    where: { slug: "lamborghini" },
    update: {},
    create: { name: "Lamborghini", slug: "lamborghini" },
  });

  const model = await prisma.model.upsert({
    where: { makeId_slug: { makeId: make.id, slug: "huracan-evo" } },
    update: {},
    create: {
      makeId: make.id,
      name: "Huracan EVO",
      slug: "huracan-evo",
      category: "Supercar",
    },
  });

  return prisma.vehicle.upsert({
    where: { vin: "ZHWUT5ZF0NLA80001" },
    update: {
      modelId: model.id,
      year: 2022,
      trim: "Sprint 8G QA",
      mileage: 1900,
    },
    create: {
      vin: "ZHWUT5ZF0NLA80001",
      modelId: model.id,
      year: 2022,
      trim: "Sprint 8G QA",
      mileage: 1900,
      status: "UNCLAIMED",
    },
  });
}

async function main() {
  console.log("==================================================");
  console.log("      Testing Sprint 8G Partner Package Scope     ");
  console.log("==================================================\n");

  const vehicle = await ensureVehicle();

  const request = await createFulfillmentRequest({
    requestType: "TRANSPORT_QUOTE",
    status: "SENT",
    vehicleId: vehicle.id,
    partnerName: "Sprint 8G Enclosed Transport",
    partnerEmail: "transport.8g@supercars.market",
    packageTitle: "Sprint 8G Enclosed Transport Package",
    packageDescription: "Scoped partner package for enclosed transport quote fulfillment.",
    scopedPackageData: {
      pickupCity: "Miami",
      pickupState: "FL",
      deliveryCity: "Palm Beach",
      deliveryState: "FL",
      vehicleCondition: "Running",
      decisionTokenUrl: "/fulfillment/should-not-leak",
      acceptUrl: "/fulfillment/should-not-leak/accept",
      declineUrl: "/fulfillment/should-not-leak/decline",
      platformFee: 450,
      nested: {
        expectedPlatformFee: 450,
        adminNotes: "Internal ops note should not be visible.",
        visibleInstruction: "Use enclosed transport only.",
      },
    },
    parties: [
      {
        partyType: "BUYER",
        name: "Sprint 8G Buyer",
        email: "buyer.8g@supercars.market",
      },
      {
        partyType: "TRANSPORT_PROVIDER",
        name: "Sprint 8G Enclosed Transport",
        email: "transport.8g@supercars.market",
      },
    ],
    fees: [
      {
        feeType: "TRANSPORT_FEE",
        amount: 450,
        status: "AUTHORIZED",
        description: "Internal transport platform fee.",
      },
    ],
    depositIntent: {
      amount: 450,
      paymentMethod: "SPRINT_8G_LEDGER_AUTH",
    },
  });

  console.log("1. Fetching partner token package...");
  const partnerView = await getPartnerFulfillmentPackage(request.partnerTokens[0].token);
  if ("error" in partnerView) {
    throw new Error(`Partner view failed: ${partnerView.message}`);
  }

  const payload = JSON.stringify(partnerView);
  const forbiddenFragments = [
    "expectedPlatformFee",
    "expectedPartnerCommission",
    "collectedAmount",
    "refundableAmount",
    "payoutStatus",
    "platformFee",
    "decisionTokenUrl",
    "acceptUrl",
    "declineUrl",
    "adminNotes",
    "TRANSPORT_FEE",
    "Internal transport platform fee",
  ];

  console.log("2. Verifying forbidden fields are absent...");
  for (const fragment of forbiddenFragments) {
    if (payload.includes(fragment)) {
      throw new Error(`Partner payload leaked forbidden fragment: ${fragment}`);
    }
  }
  console.log("  ✓ No internal settlement or token-url fields leaked.");

  console.log("3. Verifying required partner decision context remains...");
  if (partnerView.request.status !== "VIEWED") {
    throw new Error(`Expected partner access to transition request to VIEWED, received ${partnerView.request.status}.`);
  }
  if (partnerView.request.vehicle?.vin !== vehicle.vin) {
    throw new Error("Partner payload did not include required vehicle VIN context.");
  }
  if (partnerView.request.depositHold?.amount !== 450) {
    throw new Error("Partner payload did not include required deposit hold context.");
  }
  if (partnerView.request.package.scopedData.pickupCity !== "Miami") {
    throw new Error("Partner payload did not include required scoped transport details.");
  }
  const nested = partnerView.request.package.scopedData.nested as Record<string, unknown> | undefined;
  if (nested?.visibleInstruction !== "Use enclosed transport only.") {
    throw new Error("Partner scoped-data sanitizer removed allowed nested work instructions.");
  }

  console.log("  ✓ Vehicle, status, deposit hold, and scoped package data are intact.");

  console.log("\n==================================================");
  console.log("        SPRINT 8G PARTNER SCOPING TEST PASSED     ");
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
