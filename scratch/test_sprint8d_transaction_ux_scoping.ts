/**
 * scratch/test_sprint8d_transaction_ux_scoping.ts
 *
 * Verifies Sprint 8D transaction UX data safety:
 * 1. Buyer and owner views are role-scoped.
 * 2. Outsiders cannot open transaction detail.
 * 3. Buyer detail data does not include partner decision tokens.
 * 4. Owner detail data does not include buyer email, parties, fees, or partner tokens.
 */

import { prisma } from "../lib/prisma";
import { createFulfillmentRequest, getFulfillmentByIdForUser } from "../lib/fulfillment/service";

async function main() {
  console.log("==================================================");
  console.log("    Testing Sprint 8D Transaction UX Scoping      ");
  console.log("==================================================\n");

  const runId = Date.now();
  const buyer = await prisma.user.create({
    data: {
      name: "Sprint 8D Buyer",
      email: `sprint8d.buyer.${runId}@supercars.market`,
      username: `sprint8d_buyer_${runId}`,
    },
  });
  const owner = await prisma.user.create({
    data: {
      name: "Sprint 8D Owner",
      email: `sprint8d.owner.${runId}@supercars.market`,
      username: `sprint8d_owner_${runId}`,
    },
  });
  const outsider = await prisma.user.create({
    data: {
      name: "Sprint 8D Outsider",
      email: `sprint8d.outsider.${runId}@supercars.market`,
      username: `sprint8d_outsider_${runId}`,
    },
  });

  const make = await prisma.make.upsert({
    where: { name: "Ferrari" },
    update: {},
    create: { name: "Ferrari", slug: "ferrari" },
  });
  const model = await prisma.model.upsert({
    where: { makeId_slug: { makeId: make.id, slug: "f8-tributo" } },
    update: {},
    create: { makeId: make.id, name: "F8 Tributo", slug: "f8-tributo" },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      vin: `ZFF8DUX0${String(runId).slice(-9)}`,
      modelId: model.id,
      year: 2022,
      ownerId: owner.id,
      status: "CLAIMED",
    },
  });

  const request = await createFulfillmentRequest({
    requestType: "DEALER_PURCHASE",
    buyerId: buyer.id,
    vehicleId: vehicle.id,
    packageTitle: "Sprint 8D Dealer Purchase",
    scopedPackageData: {
      buyerName: buyer.name,
      buyerEmail: buyer.email,
      decisionTokenUrl: "/fulfillment/secret-token",
      askingPrice: 350000,
    },
    partnerName: "Sprint 8D Dealer",
    partnerEmail: "dealer.8d@supercars.market",
    parties: [
      { partyType: "BUYER", userId: buyer.id, name: buyer.name!, email: buyer.email! },
      { partyType: "SELLER", userId: owner.id, name: owner.name!, email: owner.email! },
      { partyType: "DEALER", name: "Sprint 8D Dealer", email: "dealer.8d@supercars.market" },
    ],
    fees: [{ feeType: "COMMISSION", amount: 3500, status: "ESTIMATED" }],
    depositIntent: { amount: 5000, paymentMethod: "CREDIT_CARD_HOLD" },
  });

  const buyerView = await getFulfillmentByIdForUser(request.publicTransactionToken, buyer.id);
  if ("error" in buyerView || buyerView.role !== "BUYER") {
    throw new Error("Buyer view was not returned for buyer user.");
  }
  const buyerJson = JSON.stringify(buyerView);
  if (buyerJson.includes(request.partnerTokens[0].token)) {
    throw new Error("Buyer transaction view leaked partner decision token.");
  }
  console.log("  ✓ Buyer view scoped without partner token.");

  const ownerView = await getFulfillmentByIdForUser(request.publicTransactionToken, owner.id);
  if ("error" in ownerView || ownerView.role !== "SELLER") {
    throw new Error("Owner view was not returned for owner user.");
  }
  const ownerJson = JSON.stringify(ownerView);
  if (
    ownerJson.includes(buyer.email!) ||
    ownerJson.includes("parties") ||
    ownerJson.includes("fees") ||
    ownerJson.includes(request.partnerTokens[0].token)
  ) {
    throw new Error("Owner transaction view leaked buyer email, parties, fees, or partner token.");
  }
  console.log("  ✓ Owner view scoped without private buyer/fee/token data.");

  const outsiderView = await getFulfillmentByIdForUser(request.publicTransactionToken, outsider.id);
  if (!("error" in outsiderView) || outsiderView.error !== "FORBIDDEN") {
    throw new Error("Outsider transaction detail access was not blocked.");
  }
  console.log("  ✓ Outsider access blocked.");

  console.log("\n==================================================");
  console.log("  ALL SPRINT 8D TRANSACTION UX SCOPING TESTS PASSED!");
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
