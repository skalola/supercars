/**
 * scratch/test_sprint8c_end_to_end_fulfillment_qa.ts
 *
 * Sprint 8C end-to-end fulfillment QA.
 *
 * Exercises the production fulfillment paths without relying on ambient local
 * data: dealer purchase, insurance quote, transport quote, service booking,
 * partner accept/decline, ignored/expired token, cancellation before/after
 * acceptance, transaction scoping, and admin completion.
 */

import { prisma } from "../lib/prisma";
import {
  createDealerPurchasePackage,
  createInsuranceQuotePackage,
  createTransportQuotePackage,
} from "../app/actions/purchase";
import { createServiceBookingPackage } from "../app/actions/passport";
import {
  cancelFulfillmentRequest,
  executePartnerDecisionByAction,
  getFulfillmentByIdForUser,
  getPartnerFulfillmentPackage,
  processExpiredFulfillmentRequests,
  submitPartnerDecision,
} from "../lib/fulfillment/service";
import { adminMarkCompleted } from "../lib/admin/fulfillment-ops";

const testGlobal = globalThis as typeof globalThis & {
  mockSession?: {
    user: {
      id: string;
      email: string | null;
      name: string | null;
    };
  };
};

async function upsertUser(email: string, name: string, username: string) {
  return prisma.user.upsert({
    where: { email },
    update: { name, username },
    create: { email, name, username },
  });
}

async function upsertPartnerContact(params: {
  name: string;
  type: "DEALER" | "INSURER" | "TRANSPORTER" | "SERVICE_SHOP";
  email: string;
  website?: string;
  marketSourceId?: string;
}) {
  const existing = params.marketSourceId
    ? await prisma.partnerContact.findUnique({ where: { marketSourceId: params.marketSourceId } })
    : await prisma.partnerContact.findFirst({ where: { name: params.name, type: params.type } });

  const data = {
    name: params.name,
    type: params.type,
    email: params.email,
    website: params.website || null,
    sourceDomain: params.website ? new URL(params.website).hostname : null,
    makeSpecialization: "Ferrari",
    contactSource: "PUBLIC_WEBSITE",
    confidence: "VERIFIED",
    contactStatus: "RESOLVED",
    active: true,
  };

  if (existing) {
    return prisma.partnerContact.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.partnerContact.create({
    data: {
      ...data,
      marketSourceId: params.marketSourceId,
    },
  });
}

async function seedQaFixture() {
  const runId = Date.now();
  const buyer = await upsertUser(
    `sprint8c.buyer.${runId}@supercars.market`,
    "Sprint 8C Buyer",
    `sprint8c_buyer_${runId}`,
  );
  const seller = await upsertUser(
    `sprint8c.seller.${runId}@supercars.market`,
    "Sprint 8C Seller",
    `sprint8c_seller_${runId}`,
  );
  const outsider = await prisma.user.create({
    data: {
      email: `sprint8c.outsider.${runId}@supercars.market`,
      name: "Sprint 8C Outsider",
      username: `sprint8c_outsider_${runId}`,
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
    create: {
      makeId: make.id,
      name: "F8 Tributo",
      slug: "f8-tributo",
      category: "Supercar",
    },
  });

  const dealerName = `Sprint 8C Ferrari Dealer ${runId}`;
  const dealerWebsite = `https://sprint-8c-dealer-${runId}.example.org`;
  const dealerSource = await prisma.marketSource.create({
    data: {
      name: dealerName,
      type: "DEALER",
      website: dealerWebsite,
    },
  });

  await upsertPartnerContact({
    name: dealerName,
    type: "DEALER",
    email: "dealer.8c@supercars.market",
    website: dealerWebsite,
    marketSourceId: dealerSource.id,
  });

  await upsertPartnerContact({
    name: "Sprint 8C Insurance Partner",
    type: "INSURER",
    email: "insurance.8c@supercars.market",
  });
  await upsertPartnerContact({
    name: "Sprint 8C Transport Decline Partner",
    type: "TRANSPORTER",
    email: "transport-decline.8c@supercars.market",
  });
  await upsertPartnerContact({
    name: "Sprint 8C Transport Expire Partner",
    type: "TRANSPORTER",
    email: "transport-expire.8c@supercars.market",
  });
  await upsertPartnerContact({
    name: "Sprint 8C Transport Cancel Partner",
    type: "TRANSPORTER",
    email: "transport-cancel.8c@supercars.market",
  });
  await upsertPartnerContact({
    name: "Sprint 8C Service Shop",
    type: "SERVICE_SHOP",
    email: "service.8c@supercars.market",
  });

  const saleVehicle = await prisma.vehicle.create({
    data: {
      vin: `ZFF8CE2E${String(runId).slice(-9)}`,
      modelId: model.id,
      year: 2022,
      trim: "Sprint 8C Sale Fixture",
      mileage: 2400,
      ownerId: seller.id,
      status: "CLAIMED",
    },
  });

  const serviceVehicle = await prisma.vehicle.create({
    data: {
      vin: `ZFF8CSVC${String(runId).slice(-9)}`,
      modelId: model.id,
      year: 2021,
      trim: "Sprint 8C Service Fixture",
      mileage: 3600,
      ownerId: buyer.id,
      status: "CLAIMED",
    },
  });

  await prisma.vehicleProfile.create({
    data: {
      vehicleId: serviceVehicle.id,
      currentMileage: 3600,
      ownerNotes: "Sprint 8C service QA fixture.",
    },
  });

  const listing = await prisma.listing.create({
    data: {
      modelId: model.id,
      sourceId: dealerSource.id,
      externalListingId: `sprint-8c-${runId}`,
      year: 2022,
      price: 365000,
      mileage: 2400,
      location: "Miami, FL",
      dealerName,
      url: `${dealerWebsite}/inventory/sprint-8c-${runId}`,
      vinVerified: true,
      status: "ACTIVE",
      vehicleId: saleVehicle.id,
      sellerId: seller.id,
      askingPrice: 365000,
    },
  });

  return { buyer, seller, outsider, listing, saleVehicle, serviceVehicle };
}

async function assertDepositState(requestId: string, paymentStatus: string, depositStatus: string) {
  const request = await prisma.fulfillmentRequest.findUnique({
    where: { id: requestId },
    include: { depositIntents: true },
  });
  if (request?.paymentStatus !== paymentStatus || request.depositIntents[0]?.status !== depositStatus) {
    throw new Error(
      `Expected ${requestId} payment=${paymentStatus}/deposit=${depositStatus}; got payment=${request?.paymentStatus}/deposit=${request?.depositIntents[0]?.status}`,
    );
  }
  return request;
}

async function assertPartnerDispatch(requestId: string, expectedEmail: string) {
  const request = await prisma.fulfillmentRequest.findUnique({
    where: { id: requestId },
    include: {
      partnerTokens: true,
      events: true,
    },
  });
  const partnerEmail = request?.partnerTokens[0]?.partnerEmail;
  const dispatchEvent = request?.events.find((event) =>
    event.note?.includes("Email DISPATCHED") && event.note.includes(expectedEmail),
  );

  if (partnerEmail !== expectedEmail || !dispatchEvent) {
    throw new Error(
      `Expected partner dispatch to ${expectedEmail}; got token email=${partnerEmail || "null"} and dispatch event=${dispatchEvent ? "yes" : "no"}`,
    );
  }
}

async function main() {
  console.log("==================================================");
  console.log(" Sprint 8C End-to-End Fulfillment QA");
  console.log("==================================================\n");

  const originalPaymentProvider = process.env.PAYMENT_PROVIDER;
  const originalMailProvider = process.env.MAIL_PROVIDER;

  try {
    process.env.PAYMENT_PROVIDER = "ledger";
    process.env.MAIL_PROVIDER = "log";

    const fixture = await seedQaFixture();
    testGlobal.mockSession = {
      user: { id: fixture.buyer.id, email: fixture.buyer.email, name: fixture.buyer.name },
    };

    console.log("1. Dealer purchase: package, partner portal, accept, buyer/seller scope, admin complete...");
    const dealerPurchase = await createDealerPurchasePackage({
      listingId: fixture.listing.id,
      amount: 365000,
      buyerName: fixture.buyer.name!,
      buyerEmail: fixture.buyer.email!,
      buyerPhone: "305-555-0188",
      buyerMessage: "Sprint 8C ready-to-process buyer offer.",
    });

    const dealerReq = await prisma.fulfillmentRequest.findUnique({
      where: { id: dealerPurchase.fulfillmentRequestId },
      include: { partnerTokens: true, depositIntents: true, events: true },
    });
    if (!dealerReq) throw new Error("Dealer fulfillment request was not created.");
    await assertPartnerDispatch(dealerPurchase.fulfillmentRequestId, "dealer.8c@supercars.market");
    const dealerToken = dealerReq.partnerTokens[0]?.token;
    if (!dealerToken) throw new Error("Dealer partner token missing.");

    const partnerPackage = await getPartnerFulfillmentPackage(dealerToken);
    if ("error" in partnerPackage || JSON.stringify(partnerPackage).includes("COMMISSION")) {
      throw new Error("Dealer partner package failed or leaked internal fee data.");
    }

    const dealerAccept = await executePartnerDecisionByAction(dealerToken, "ACCEPT", "Sprint 8C dealer accepted.");
    if ("error" in dealerAccept) throw new Error(`Dealer accept failed: ${dealerAccept.message}`);
    await assertDepositState(dealerPurchase.fulfillmentRequestId, "CAPTURED", "CAPTURED");

    const buyerView = await getFulfillmentByIdForUser(dealerPurchase.fulfillmentRequestId, fixture.buyer.id);
    if ("error" in buyerView || buyerView.role !== "BUYER" || buyerView.request.status !== "ACCEPTED") {
      throw new Error("Buyer transaction view did not reflect accepted dealer request.");
    }

    const sellerView = await getFulfillmentByIdForUser(dealerPurchase.fulfillmentRequestId, fixture.seller.id);
    if ("error" in sellerView || sellerView.role !== "SELLER") {
      throw new Error("Seller transaction view was not scoped correctly.");
    }

    const outsiderView = await getFulfillmentByIdForUser(dealerPurchase.fulfillmentRequestId, fixture.outsider.id);
    if (!("error" in outsiderView) || outsiderView.error !== "FORBIDDEN") {
      throw new Error("Outsider transaction access was not blocked.");
    }

    await adminMarkCompleted(dealerPurchase.fulfillmentRequestId, "Sprint 8C admin completion after dealer acceptance.");
    const completedDealerReq = await prisma.fulfillmentRequest.findUnique({
      where: { id: dealerPurchase.fulfillmentRequestId },
    });
    if (completedDealerReq?.status !== "COMPLETED" || completedDealerReq.payoutStatus !== "RECONCILED") {
      throw new Error("Admin completion did not reconcile accepted dealer request.");
    }
    console.log("  ✓ Dealer flow complete.");

    console.log("\n2. Insurance quote: no buyer capture, partner accept, referral fee stays estimated...");
    const insurance = await createInsuranceQuotePackage({
      purchaseId: dealerPurchase.id,
      carrierName: "Sprint 8C Insurance Partner",
      garagingState: "FL",
      garagingZip: "33101",
      intendedUse: "PLEASURE_COLLECTION",
      coveragePreference: "AGREED_VALUE_FULL_COVERAGE",
    });
    const insuranceReq = await prisma.fulfillmentRequest.findUnique({
      where: { id: insurance.fulfillmentRequestId },
      include: { partnerTokens: true, fees: true },
    });
    if (!insuranceReq) throw new Error("Insurance fulfillment request was not created.");
    await assertPartnerDispatch(insurance.fulfillmentRequestId, "insurance.8c@supercars.market");
    await submitPartnerDecision({
      token: insuranceReq.partnerTokens[0].token,
      decision: "ACCEPTED",
      note: "Sprint 8C insurer accepted quote request.",
    });
    const acceptedInsuranceReq = await prisma.fulfillmentRequest.findUnique({
      where: { id: insurance.fulfillmentRequestId },
      include: { fees: true },
    });
    const referralFee = acceptedInsuranceReq?.fees.find((fee) => fee.feeType === "REFERRAL_FEE");
    if (
      acceptedInsuranceReq?.status !== "ACCEPTED" ||
      acceptedInsuranceReq.paymentStatus !== "NOT_REQUIRED" ||
      referralFee?.status !== "ESTIMATED"
    ) {
      throw new Error("Insurance quote flow captured payment or referral fee prematurely.");
    }
    console.log("  ✓ Insurance flow complete.");

    console.log("\n3. Transport quote: partner decline releases authorization and token is single-use...");
    const transportDecline = await createTransportQuotePackage({
      purchaseId: dealerPurchase.id,
      address: { streetAddress: "100 Biscayne Blvd", city: "Miami", state: "FL", postalCode: "33132" },
      transportMethod: "ENCLOSED",
      deliveryDate: "2026-08-20",
      transporterName: "Sprint 8C Transport Decline Partner",
    });
    const transportDeclineReq = await prisma.fulfillmentRequest.findUnique({
      where: { id: transportDecline.fulfillmentRequestId },
      include: { partnerTokens: true },
    });
    await assertPartnerDispatch(transportDecline.fulfillmentRequestId, "transport-decline.8c@supercars.market");
    const transportDeclineToken = transportDeclineReq?.partnerTokens[0]?.token;
    if (!transportDeclineToken) throw new Error("Transport decline token missing.");
    await submitPartnerDecision({
      token: transportDeclineToken,
      decision: "DECLINED",
      note: "Sprint 8C transporter declined route.",
    });
    await assertDepositState(transportDecline.fulfillmentRequestId, "VOIDED", "RELEASED");
    const reuseResult = await executePartnerDecisionByAction(transportDeclineToken, "ACCEPT", "Attempt token reuse.");
    if (!("error" in reuseResult) || reuseResult.error !== "TOKEN_ALREADY_USED") {
      throw new Error("Used partner decision token was not rejected.");
    }
    console.log("  ✓ Transport decline flow complete.");

    console.log("\n4. Transport quote: ignored partner token expires and voids authorization...");
    const transportExpire = await createTransportQuotePackage({
      purchaseId: dealerPurchase.id,
      address: { streetAddress: "200 Ocean Dr", city: "Miami Beach", state: "FL", postalCode: "33139" },
      transportMethod: "ENCLOSED",
      deliveryDate: "2026-08-22",
      transporterName: "Sprint 8C Transport Expire Partner",
    });
    await assertPartnerDispatch(transportExpire.fulfillmentRequestId, "transport-expire.8c@supercars.market");
    await prisma.partnerDecisionToken.updateMany({
      where: { fulfillmentRequestId: transportExpire.fulfillmentRequestId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expiration = await processExpiredFulfillmentRequests();
    const expiredReq = await assertDepositState(transportExpire.fulfillmentRequestId, "VOIDED", "RELEASED");
    if (expiration.processedCount < 1 || expiredReq.status !== "EXPIRED") {
      throw new Error("Expired transport token did not finalize request as EXPIRED.");
    }
    console.log("  ✓ Transport expiration flow complete.");

    console.log("\n5. Transport quote: buyer cancellation before acceptance voids authorization...");
    const transportCancel = await createTransportQuotePackage({
      purchaseId: dealerPurchase.id,
      address: { streetAddress: "300 Brickell Ave", city: "Miami", state: "FL", postalCode: "33131" },
      transportMethod: "ENCLOSED",
      deliveryDate: "2026-08-24",
      transporterName: "Sprint 8C Transport Cancel Partner",
    });
    await assertPartnerDispatch(transportCancel.fulfillmentRequestId, "transport-cancel.8c@supercars.market");
    const preCancel = await cancelFulfillmentRequest({
      fulfillmentRequestId: transportCancel.fulfillmentRequestId,
      cancelledByActor: "BUYER",
      cancellationReason: "Sprint 8C buyer cancelled before partner acceptance.",
    });
    if (!preCancel.success) throw new Error(preCancel.message);
    const preCancelledReq = await assertDepositState(transportCancel.fulfillmentRequestId, "VOIDED", "RELEASED");
    if (preCancelledReq.status !== "CANCELLED" || preCancelledReq.cancelledByActor !== "BUYER") {
      throw new Error("Pre-accept cancellation did not record buyer cancellation.");
    }
    console.log("  ✓ Pre-accept cancellation flow complete.");

    console.log("\n6. Service booking: passport owner request, shop accept, post-accept cancellation refund policy...");
    const service = await createServiceBookingPackage({
      vin: fixture.serviceVehicle.vin,
      serviceName: "Annual Maintenance Inspection",
      preferredDate: "2026-08-27",
      preferredTime: "10:30 AM",
      shopName: "Sprint 8C Service Shop",
      notes: "Sprint 8C service QA booking.",
      depositAmount: 150,
    });
    const serviceReq = await prisma.fulfillmentRequest.findUnique({
      where: { id: service.fulfillmentRequestId },
      include: { partnerTokens: true },
    });
    if (!serviceReq?.partnerTokens[0]?.token) throw new Error("Service partner token missing.");
    await assertPartnerDispatch(service.fulfillmentRequestId, "service.8c@supercars.market");
    await submitPartnerDecision({
      token: serviceReq.partnerTokens[0].token,
      decision: "ACCEPTED",
      note: "Sprint 8C service shop accepted booking.",
    });
    await assertDepositState(service.fulfillmentRequestId, "CAPTURED", "CAPTURED");
    const serviceCancel = await cancelFulfillmentRequest({
      fulfillmentRequestId: service.fulfillmentRequestId,
      cancelledByActor: "BUYER",
      cancellationReason: "Sprint 8C post-accept service cancellation.",
    });
    if (!serviceCancel.success) throw new Error(serviceCancel.message);
    const serviceCancelledReq = await assertDepositState(service.fulfillmentRequestId, "REFUNDED", "REFUNDED");
    if (serviceCancelledReq.status !== "CANCELLED" || serviceCancelledReq.collectedAmount !== 100) {
      throw new Error("Post-accept service cancellation did not apply refund policy.");
    }
    console.log("  ✓ Service flow complete.");

    console.log("\n7. Audit trail sanity check...");
    const auditedRequestIds = [
      dealerPurchase.fulfillmentRequestId,
      insurance.fulfillmentRequestId,
      transportDecline.fulfillmentRequestId,
      transportExpire.fulfillmentRequestId,
      transportCancel.fulfillmentRequestId,
      service.fulfillmentRequestId,
    ];
    const auditEvents = await prisma.fulfillmentEvent.groupBy({
      by: ["fulfillmentRequestId"],
      where: { fulfillmentRequestId: { in: auditedRequestIds } },
      _count: { id: true },
    });
    if (auditEvents.length !== auditedRequestIds.length || auditEvents.some((event) => event._count.id < 2)) {
      throw new Error("One or more 8C flows did not produce expected audit events.");
    }
    console.log("  ✓ Audit events present for every E2E flow.");

    console.log("\n==================================================");
    console.log("  ALL SPRINT 8C END-TO-END QA TESTS PASSED!");
    console.log("==================================================");
  } finally {
    if (originalPaymentProvider === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = originalPaymentProvider;
    if (originalMailProvider === undefined) delete process.env.MAIL_PROVIDER;
    else process.env.MAIL_PROVIDER = originalMailProvider;
    delete testGlobal.mockSession;
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Test failed with error:", error);
  process.exit(1);
});
