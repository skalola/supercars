/**
 * scratch/test_service_booking_package.ts
 *
 * Automated verification script for Sprint 7.6 Service Booking Package.
 * Validates:
 * 1. Vehicle Passport -> Fulfillment proof point
 * 2. createServiceBookingPackage Action execution
 * 3. All 8 required service booking package fields present in scoped payload
 * 4. Resolution of certified service shop PartnerContact (Ferrari of Beverly Hills Service)
 * 5. No upfront deposit hold before shop acceptance
 * 6. Partner ACCEPTED decision -> ACCEPTED_AWAITING_PAYMENT
 * 7. Stripe Checkout webhook -> CONFIRMED / PAID
 */

import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { createServiceBookingPackage } from "../app/actions/passport";
import {
  getPartnerFulfillmentPackage,
  getBuyerFulfillmentTransaction,
  submitPartnerDecision,
} from "../lib/fulfillment/service";
import { POST as checkoutPost } from "../app/api/payments/service-booking-checkout/route";
import { getServiceBookingFeeCents, processStripeWebhookPayload } from "../lib/payments/payment-service";

const testGlobal = globalThis as typeof globalThis & {
  mockSession?: {
    user: {
      id: string;
      email: string | null;
      name: string | null;
    };
  };
};

let originalPaymentProvider: string | undefined;
let originalStripeKey: string | undefined;
let originalServiceFee: string | undefined;
let originalFetch: typeof fetch = globalThis.fetch;

async function main() {
  console.log("==================================================");
  console.log("  Testing Sprint 7.6 Service Booking Package      ");
  console.log("==================================================\n");

  const runId = Date.now();
  const shopName = `Ferrari Beverly Hills Service Sprint 7F ${runId}`;
  originalPaymentProvider = process.env.PAYMENT_PROVIDER;
  originalStripeKey = process.env.STRIPE_SECRET_KEY;
  originalServiceFee = process.env.SERVICE_BOOKING_FEE_CENTS;
  originalFetch = globalThis.fetch;

  process.env.PAYMENT_PROVIDER = "stripe";
  process.env.STRIPE_SECRET_KEY = "sk_test_service_booking";
  process.env.SERVICE_BOOKING_FEE_CENTS = "10000";
  const stripeCalls: Array<{ url: string; body: string }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const body = String(init?.body);
    stripeCalls.push({ url, body });
    if (url.endsWith("/checkout/sessions")) {
      return Response.json({
        id: `cs_test_service_${runId}`,
        url: `https://checkout.stripe.test/pay/cs_test_service_${runId}`,
      });
    }
    return Response.json({ id: "ok_service_booking" });
  }) as typeof fetch;

  await prisma.partnerContact.create({
    data: {
      name: shopName,
      type: "SERVICE_SHOP",
      email: "service@ferrariofbeverlyhills.com",
      phone: "+1-310-555-0177",
      website: "https://www.ferrariofbeverlyhills.com/service/",
      makeSpecialization: "Ferrari",
      location: "Beverly Hills, CA",
      contactSource: "PUBLIC_WEBSITE",
      confidence: "VERIFIED",
      contactStatus: "RESOLVED",
    },
  });

  const model = await prisma.model.findFirst({
    where: { make: { name: "Ferrari" } },
    include: { make: true },
  });
  if (!model) throw new Error("No Ferrari model found for service booking test.");

  const owner = await prisma.user.create({
    data: {
      name: "Enzo Ferrari",
      email: `enzo.servicepkg.${runId}@gmail.com`,
      username: `enzo_servicepkg_${runId}`,
    },
  });

  const sampleVehicle = await prisma.vehicle.create({
    data: {
      vin: `ZFF7FSERV${String(runId).slice(-8)}`,
      year: 2019,
      modelId: model.id,
      ownerId: owner.id,
      status: "CLAIMED",
      mileage: 9100,
      profile: {
        create: {
          currentMileage: 9100,
        },
      },
    },
    include: { model: { include: { make: true } }, owner: true, profile: true },
  });

  testGlobal.mockSession = {
    user: { id: owner.id, email: owner.email, name: owner.name },
  };

  console.log(`Using Vehicle Passport VIN: ${sampleVehicle.vin} (${sampleVehicle.model.make.name} ${sampleVehicle.model.name}) — Owner: ${owner.name}\n`);

  // ── 1. Execute createServiceBookingPackage Action from Vehicle Passport ──
  console.log("1. Executing createServiceBookingPackage Action from Vehicle Passport...");
  const bookingResult = await createServiceBookingPackage({
    vin: sampleVehicle.vin,
    serviceName: "Annual Major Maintenance & Brake Service",
    shopName,
    preferredDate: "2026-08-25",
    preferredTime: "09:00 AM",
    notes: "Requesting factory original fluids and 101-point certified inspection.",
    customerPhone: "310-555-0133",
  });

  console.log(`  ✓ Fulfillment Request ID: ${bookingResult.fulfillmentRequestId}`);
  console.log(`  ✓ Public Transaction Token: ${bookingResult.publicTransactionToken}`);
  console.log(`  ✓ Initial Request Status: ${bookingResult.status}`);

  // ── 2. Verify No Upfront Deposit Hold Rule ──────────────────────────────
  console.log("\n2. Verifying no upfront deposit authorization...");
  const dbFulfillment = await prisma.fulfillmentRequest.findUnique({
    where: { id: bookingResult.fulfillmentRequestId },
    include: {
      packages: true,
      partnerTokens: true,
      depositIntents: true,
      fees: true,
    },
  });

  console.log(`  ✓ Deposit Intents Before Acceptance: ${dbFulfillment?.depositIntents.length}`);
  if (dbFulfillment?.depositIntents.length !== 0) {
    throw new Error("Service bookings must not authorize a deposit before shop acceptance.");
  }

  // ── 3. Verify All 8 Service Booking Package Fields ──────────────────────
  console.log("\n3. Verifying All 8 Service Booking Fields in Scoped Payload...");
  const rawScope = dbFulfillment?.packages[0]?.scope;
  if (!rawScope) throw new Error("Scoped service package payload missing!");

  const payload = JSON.parse(rawScope);
  const requiredFields = [
    "vehicle",
    "serviceRequested",
    "mileage",
    "preferredSchedule",
    "customerContact",
    "shop",
    "depositFeeRules",
    "notesAndDocuments",
  ];

  console.log(`  ✓ Vehicle VIN in Payload: ${payload.vehicle.vin}`);
  console.log(`  ✓ Service Requested: ${payload.serviceRequested}`);
  console.log(`  ✓ Preferred Schedule: ${payload.preferredSchedule.preferredDate} at ${payload.preferredSchedule.preferredTime}`);
  console.log(`  ✓ Shop Name: ${payload.shop.name}`);
  console.log(`  ✓ Platform Booking Fee: $${payload.depositFeeRules.depositAmount}`);
  console.log(`  ✓ Fee Rule: ${payload.depositFeeRules.rule}`);

  for (const field of requiredFields) {
    if (payload[field] === undefined) {
      throw new Error(`Required service booking field '${field}' missing from package!`);
    }
  }
  if (payload.vehicle.vin !== sampleVehicle.vin || payload.depositFeeRules.depositAmount !== getServiceBookingFeeCents() / 100) {
    throw new Error("Service booking package did not preserve the VIN-backed vehicle or configured platform fee.");
  }
  const serviceFee = dbFulfillment.fees.find((fee) => fee.feeType === "SERVICE_FEE");
  console.log(`  ✓ Service Fee Record: $${serviceFee?.amount} (${serviceFee?.status})`);
  if (!serviceFee || serviceFee.amount !== getServiceBookingFeeCents() / 100 || serviceFee.status !== "ESTIMATED") {
    throw new Error("Service booking fee tracking is invalid before shop acceptance.");
  }
  console.log(`  ✓ All ${requiredFields.length} required fields verified in service booking package payload.`);

  // ── 4. Simulate Service Center ACCEPTED Decision ─────────────────────────
  console.log("\n4. Simulating Certified Service Center ACCEPTED Decision...");
  const partnerToken = dbFulfillment.partnerTokens[0].token;

  const partnerView = await getPartnerFulfillmentPackage(partnerToken);
  if ("error" in partnerView) throw new Error(`Partner view failed: ${partnerView.message}`);

  const acceptResult = await submitPartnerDecision({
    token: partnerToken,
    decision: "ACCEPTED",
    note: "Service master technician assigned for August 25th 09:00 AM appointment.",
  });
  console.log(`  ✓ Service Center Decision Result: ${acceptResult.message}`);

  // ── 5. Verify Transaction Hub Live Update ───────────────────────────────
  console.log("\n5. Verifying Buyer Transaction Hub Live Update...");
  const buyerTx = await getBuyerFulfillmentTransaction(bookingResult.publicTransactionToken);
  if ("error" in buyerTx || !buyerTx.request) throw new Error("Failed to fetch buyer transaction.");

  console.log(`  ✓ Buyer Transaction Status: ${buyerTx.request.status} (Expected: ACCEPTED_AWAITING_PAYMENT)`);
  console.log(`  ✓ Payment Status: ${buyerTx.request.paymentStatus} (Expected: PAYMENT_REQUIRED)`);
  console.log(`  ✓ Latest Event Note: "${buyerTx.request.events.at(-1)?.note}"`);

  if (
    buyerTx.request.status !== "ACCEPTED_AWAITING_PAYMENT" ||
    buyerTx.request.paymentStatus !== "PAYMENT_REQUIRED" ||
    !buyerTx.request.events.some((event) => event.note?.includes(owner.email || ""))
  ) {
    throw new Error("Service booking failed to move into accepted-awaiting-payment flow!");
  }

  console.log("\n6. Creating Stripe Checkout Session for owner payment...");
  const checkoutBody = new FormData();
  checkoutBody.set("fulfillmentRequestId", bookingResult.fulfillmentRequestId);
  const checkoutResponse = await checkoutPost(
    new NextRequest("https://supercars.test/api/payments/service-booking-checkout", {
      method: "POST",
      body: checkoutBody,
    })
  );
  const checkoutAfter = await prisma.fulfillmentRequest.findUnique({
    where: { id: bookingResult.fulfillmentRequestId },
    include: { depositIntents: true, fees: true },
  });

  console.log(`  ✓ Checkout Response Status: ${checkoutResponse.status}`);
  console.log(`  ✓ Checkout Redirect: ${checkoutResponse.headers.get("location")}`);
  if (
    checkoutResponse.status !== 303 ||
    !checkoutResponse.headers.get("location")?.includes("checkout.stripe.test") ||
    checkoutAfter?.status !== "PAYMENT_PROCESSING" ||
    checkoutAfter.paymentStatus !== "PROCESSING" ||
    !checkoutAfter.depositIntents[0]?.transactionRef?.startsWith("stripe_checkout:cs_test_service_")
  ) {
    throw new Error("Stripe Checkout session was not created and stored correctly.");
  }

  console.log("\n7. Processing Stripe Checkout completion webhook...");
  const webhookResult = await processStripeWebhookPayload(JSON.stringify({
    id: `evt_service_${runId}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_test_service_${runId}`,
        amount_total: getServiceBookingFeeCents(),
        payment_intent: `pi_service_${runId}`,
        metadata: {
          serviceBookingId: bookingResult.fulfillmentRequestId,
          fulfillmentRequestId: bookingResult.fulfillmentRequestId,
          vehicleId: sampleVehicle.id,
          vin: sampleVehicle.vin,
          ownerUserId: owner.id,
          feeType: "SERVICE_BOOKING",
        },
      },
    },
  }));
  const confirmedAfter = await prisma.fulfillmentRequest.findUnique({
    where: { id: bookingResult.fulfillmentRequestId },
    include: { depositIntents: true, fees: true, events: true },
  });

  console.log(`  ✓ Webhook Event Type: ${webhookResult.eventType}`);
  console.log(`  ✓ Final Booking Status: ${confirmedAfter?.status}`);
  if (
    confirmedAfter?.status !== "CONFIRMED" ||
    confirmedAfter.paymentStatus !== "PAID" ||
    confirmedAfter.fees.find((fee) => fee.feeType === "SERVICE_FEE")?.status !== "CAPTURED" ||
    confirmedAfter.depositIntents[0]?.status !== "CAPTURED"
  ) {
    throw new Error("Stripe webhook did not confirm service booking payment.");
  }

  console.log("\n8. Verifying webhook replay is idempotent...");
  const replayResult = await processStripeWebhookPayload(JSON.stringify({
    id: `evt_service_${runId}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_test_service_${runId}`,
        amount_total: getServiceBookingFeeCents(),
        payment_intent: `pi_service_${runId}`,
        metadata: {
          serviceBookingId: bookingResult.fulfillmentRequestId,
          feeType: "SERVICE_BOOKING",
        },
      },
    },
  }));
  console.log(`  ✓ Replay Already Processed: ${replayResult.alreadyProcessed}`);
  if (!replayResult.alreadyProcessed) {
    throw new Error("Stripe webhook replay was not idempotent.");
  }

  console.log("\n==================================================");
  console.log("  ALL SPRINT 7.6 SERVICE BOOKING TESTS PASSED!    ");
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("Test failed with error:", e);
    process.exit(1);
  })
  .finally(async () => {
    delete testGlobal.mockSession;
    if (originalPaymentProvider === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = originalPaymentProvider;
    if (originalStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalStripeKey;
    if (originalServiceFee === undefined) delete process.env.SERVICE_BOOKING_FEE_CENTS;
    else process.env.SERVICE_BOOKING_FEE_CENTS = originalServiceFee;
    globalThis.fetch = originalFetch;
    await prisma.$disconnect();
  });
