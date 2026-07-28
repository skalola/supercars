/**
 * scratch/test_sprint8b_payment_provider.ts
 *
 * Verifies Sprint 8B payment processor integration:
 * 1. Ledger provider authorizes, captures, voids, and refunds through fulfillment lifecycle.
 * 2. Stripe provider uses manual-capture PaymentIntents when configured.
 * 3. Failed capture does not finalize partner token or request acceptance.
 * 4. Stripe webhooks create fulfillment audit events and update failed payment state.
 */

import { prisma } from "../lib/prisma";
import {
  cancelFulfillmentRequest,
  createFulfillmentRequest,
  submitPartnerDecision,
} from "../lib/fulfillment/service";
import { processStripeWebhookPayload } from "../lib/payments/payment-service";

async function createPaymentTestRequest(paymentMethod = "CREDIT_CARD_HOLD") {
  return createFulfillmentRequest({
    requestType: "TRANSPORT_QUOTE",
    status: "SENT",
    partnerName: "Sprint 8B Transport Partner",
    partnerEmail: "transport.8b@example.com",
    packageTitle: "Sprint 8B Transport Payment Test",
    scopedPackageData: { sprint: "8B" },
    parties: [
      {
        partyType: "BUYER",
        name: "Payment Test Buyer",
        email: "buyer.8b@example.com",
      },
      {
        partyType: "TRANSPORT_PROVIDER",
        name: "Sprint 8B Transport Partner",
        email: "transport.8b@example.com",
      },
    ],
    depositIntent: {
      amount: 1500,
      currency: "USD",
      paymentMethod,
    },
    fees: [
      {
        feeType: "DEPOSIT",
        amount: 1500,
        status: "AUTHORIZED",
        description: "Sprint 8B refundable authorization hold",
      },
    ],
  });
}

async function main() {
  console.log("==================================================");
  console.log("    Testing Sprint 8B Payment Provider Layer      ");
  console.log("==================================================\n");

  const originalPaymentProvider = process.env.PAYMENT_PROVIDER;
  const originalStripeKey = process.env.STRIPE_SECRET_KEY;
  const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const originalFetch = globalThis.fetch;

  try {
    process.env.PAYMENT_PROVIDER = "ledger";

    console.log("1. Verifying ledger authorization and capture on partner accept...");
    const acceptedReq = await createPaymentTestRequest();
    const acceptedDeposit = acceptedReq.depositIntents[0];
    if (!acceptedDeposit?.transactionRef?.startsWith("ledger:auth_")) {
      throw new Error("Ledger authorization did not write a provider transaction reference.");
    }

    await submitPartnerDecision({
      token: acceptedReq.partnerTokens[0].token,
      decision: "ACCEPTED",
      note: "Sprint 8B ledger accept fixture.",
    });

    const acceptedAfter = await prisma.fulfillmentRequest.findUnique({
      where: { id: acceptedReq.id },
      include: { depositIntents: true },
    });
    console.log(`  ✓ Accepted Payment Status: ${acceptedAfter?.paymentStatus}`);
    if (acceptedAfter?.paymentStatus !== "CAPTURED" || acceptedAfter.depositIntents[0]?.status !== "CAPTURED") {
      throw new Error("Ledger acceptance failed to capture authorization hold.");
    }

    console.log("\n2. Verifying ledger void on partner decline...");
    const declinedReq = await createPaymentTestRequest();
    await submitPartnerDecision({
      token: declinedReq.partnerTokens[0].token,
      decision: "DECLINED",
      note: "Sprint 8B ledger decline fixture.",
    });
    const declinedAfter = await prisma.fulfillmentRequest.findUnique({
      where: { id: declinedReq.id },
      include: { depositIntents: true },
    });
    console.log(`  ✓ Declined Payment Status: ${declinedAfter?.paymentStatus}`);
    if (declinedAfter?.paymentStatus !== "VOIDED" || declinedAfter.depositIntents[0]?.status !== "RELEASED") {
      throw new Error("Ledger decline failed to void authorization hold.");
    }

    console.log("\n3. Verifying ledger refund on post-accept cancellation...");
    const cancelledReq = await createPaymentTestRequest();
    await submitPartnerDecision({
      token: cancelledReq.partnerTokens[0].token,
      decision: "ACCEPTED",
      note: "Sprint 8B ledger cancellation fixture.",
    });
    await cancelFulfillmentRequest({
      fulfillmentRequestId: cancelledReq.id,
      cancelledByActor: "BUYER",
      cancellationReason: "Sprint 8B post-accept refund fixture.",
    });
    const cancelledAfter = await prisma.fulfillmentRequest.findUnique({
      where: { id: cancelledReq.id },
      include: { depositIntents: true },
    });
    console.log(`  ✓ Cancelled Payment Status: ${cancelledAfter?.paymentStatus}`);
    if (
      cancelledAfter?.paymentStatus !== "REFUNDED" ||
      cancelledAfter.depositIntents[0]?.status !== "REFUNDED" ||
      cancelledAfter.collectedAmount !== 100
    ) {
      throw new Error("Ledger post-accept cancellation failed to apply refund policy.");
    }

    console.log("\n4. Verifying Stripe manual authorization and capture calls...");
    process.env.PAYMENT_PROVIDER = "stripe";
    process.env.STRIPE_SECRET_KEY = "sk_test_sprint8b";
    const stripeCalls: Array<{ url: string; body: string }> = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const body = String(init?.body);
      stripeCalls.push({ url, body });
      if (url.endsWith("/payment_intents")) {
        return Response.json({ id: `pi_8b_${stripeCalls.length}` });
      }
      if (url.includes("/capture")) {
        return Response.json({ id: "pi_8b_captured" });
      }
      return Response.json({ id: "ok_8b" });
    }) as typeof fetch;

    const stripeReq = await createPaymentTestRequest("pm_card_visa");
    await submitPartnerDecision({
      token: stripeReq.partnerTokens[0].token,
      decision: "ACCEPTED",
      note: "Sprint 8B Stripe accept fixture.",
    });
    const stripeAfter = await prisma.fulfillmentRequest.findUnique({
      where: { id: stripeReq.id },
      include: { depositIntents: true },
    });
    console.log(`  ✓ Stripe Transaction Ref: ${stripeAfter?.depositIntents[0]?.transactionRef}`);
    if (!stripeCalls[0]?.body.includes("capture_method=manual") || !stripeAfter?.depositIntents[0]?.transactionRef?.startsWith("stripe:pi_8b_")) {
      throw new Error("Stripe authorization did not use manual capture PaymentIntent flow.");
    }
    if (!stripeCalls.some((call) => call.url.includes("/capture"))) {
      throw new Error("Stripe capture endpoint was not called on partner acceptance.");
    }

    console.log("\n5. Verifying placeholder holds stay on ledger while Stripe is configured...");
    const callCountBeforePlaceholder = stripeCalls.length;
    const placeholderReq = await createPaymentTestRequest("CREDIT_CARD_HOLD");
    const placeholderDeposit = placeholderReq.depositIntents[0];
    console.log(`  ✓ Placeholder Transaction Ref: ${placeholderDeposit?.transactionRef}`);
    if (!placeholderDeposit?.transactionRef?.startsWith("ledger:auth_")) {
      throw new Error("Placeholder authorization should use the internal ledger instead of Stripe.");
    }
    if (stripeCalls.length !== callCountBeforePlaceholder) {
      throw new Error("Placeholder authorization made an external Stripe request.");
    }

    console.log("\n6. Verifying failed Stripe capture does not finalize partner decision...");
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.endsWith("/payment_intents")) {
        return Response.json({ id: "pi_8b_capture_fail" });
      }
      return Response.json({ error: { message: "Card authorization can no longer be captured" } }, { status: 402 });
    }) as typeof fetch;

    const failingReq = await createPaymentTestRequest("pm_card_visa");
    const failedDecision = await submitPartnerDecision({
      token: failingReq.partnerTokens[0].token,
      decision: "ACCEPTED",
      note: "Sprint 8B failed capture fixture.",
    });
    const failingAfter = await prisma.fulfillmentRequest.findUnique({
      where: { id: failingReq.id },
      include: { partnerTokens: true },
    });
    console.log(`  ✓ Failed Capture Error: ${failedDecision.error}`);
    if (
      failedDecision.error !== "PAYMENT_CAPTURE_FAILED" ||
      failingAfter?.status === "ACCEPTED" ||
      failingAfter?.partnerTokens[0]?.actionTaken
    ) {
      throw new Error("Failed capture finalized request or consumed partner token.");
    }

    console.log("\n7. Verifying Stripe webhook audit and failure state update...");
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const webhookResult = await processStripeWebhookPayload(JSON.stringify({
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_8b_capture_fail",
          metadata: { publicTransactionToken: failingReq.publicTransactionToken },
        },
      },
    }));
    const webhookAfter = await prisma.fulfillmentRequest.findUnique({
      where: { id: failingReq.id },
      include: { events: { orderBy: { createdAt: "desc" } } },
    });
    console.log(`  ✓ Webhook Event Type: ${webhookResult.eventType}`);
    const hasWebhookAudit = webhookAfter?.events.some((event) => event.note?.includes("Stripe webhook received"));
    if (webhookAfter?.paymentStatus !== "FAILED" || !hasWebhookAudit) {
      throw new Error("Stripe webhook did not audit event or update failed payment state.");
    }

    console.log("\n==================================================");
    console.log("  ALL SPRINT 8B PAYMENT PROVIDER TESTS PASSED!");
    console.log("==================================================");
  } finally {
    if (originalPaymentProvider === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = originalPaymentProvider;
    if (originalStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalStripeKey;
    if (originalWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
    globalThis.fetch = originalFetch;
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Test failed with error:", error);
  process.exit(1);
});
