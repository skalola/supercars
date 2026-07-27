/**
 * scratch/test_sprint8f_admin_financial_reconciliation.ts
 *
 * Sprint 8F verification:
 * 1. Admin release/refund is provider-backed, not just a local row mutation.
 * 2. Captured accepted deposits can be refunded and reconciled by admin.
 * 3. Payment provider failures block request mutation and create an audit event.
 */

import { prisma } from "../lib/prisma";
import { adminReleaseRefund } from "../lib/admin/fulfillment-ops";
import {
  createFulfillmentRequest,
  submitPartnerDecision,
} from "../lib/fulfillment/service";

async function createAdminSettlementRequest(paymentMethod = "CREDIT_CARD_HOLD") {
  return createFulfillmentRequest({
    requestType: "TRANSPORT_QUOTE",
    status: "SENT",
    partnerName: "Sprint 8F Transport Partner",
    partnerEmail: "transport.8f@example.test",
    packageTitle: "Sprint 8F Admin Financial Reconciliation",
    packageDescription: "Provider-backed admin settlement fixture.",
    scopedPackageData: {
      route: "Miami, FL to Palm Beach, FL",
      partnerAction: "Accept this request for settlement QA.",
    },
    parties: [
      {
        partyType: "BUYER",
        name: "Sprint 8F Buyer",
        email: "buyer.8f@example.test",
      },
      {
        partyType: "TRANSPORT_PROVIDER",
        name: "Sprint 8F Transport Partner",
        email: "transport.8f@example.test",
      },
    ],
    fees: [
      {
        feeType: "TRANSPORT_FEE",
        amount: 750,
        status: "AUTHORIZED",
        description: "Sprint 8F transport fee.",
      },
    ],
    depositIntent: {
      amount: 750,
      currency: "USD",
      paymentMethod,
    },
  });
}

async function main() {
  console.log("==================================================");
  console.log(" Testing Sprint 8F Admin Financial Reconciliation ");
  console.log("==================================================\n");

  const originalPaymentProvider = process.env.PAYMENT_PROVIDER;
  const originalStripeKey = process.env.STRIPE_SECRET_KEY;
  const originalFetch = globalThis.fetch;

  try {
    process.env.PAYMENT_PROVIDER = "stripe";
    process.env.STRIPE_SECRET_KEY = "sk_test_sprint8f";

    const stripeCalls: Array<{ url: string; body: string }> = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const body = String(init?.body || "");
      stripeCalls.push({ url, body });
      if (url.endsWith("/payment_intents")) {
        return Response.json({ id: `pi_8f_${stripeCalls.length}` });
      }
      if (url.includes("/capture")) {
        return Response.json({ id: "pi_8f_captured" });
      }
      if (url.endsWith("/refunds")) {
        return Response.json({ id: "re_8f_refunded" });
      }
      return Response.json({ id: "ok_8f" });
    }) as typeof fetch;

    console.log("1. Creating accepted captured request...");
    const request = await createAdminSettlementRequest("pm_card_visa");
    await submitPartnerDecision({
      token: request.partnerTokens[0].token,
      decision: "ACCEPTED",
      note: "Sprint 8F partner acceptance fixture.",
    });

    const accepted = await prisma.fulfillmentRequest.findUnique({
      where: { id: request.id },
      include: { depositIntents: true },
    });
    console.log(`  ✓ Accepted payment status: ${accepted?.paymentStatus}`);
    if (accepted?.paymentStatus !== "CAPTURED" || accepted.depositIntents[0]?.status !== "CAPTURED") {
      throw new Error("Fixture did not reach captured state before admin reconciliation.");
    }

    console.log("\n2. Running provider-backed admin refund...");
    const refundResult = await adminReleaseRefund(
      request.id,
      "Sprint 8F admin refund reconciliation."
    );
    const reconciled = await prisma.fulfillmentRequest.findUnique({
      where: { id: request.id },
      include: {
        depositIntents: true,
        fees: true,
        events: { orderBy: { createdAt: "desc" } },
      },
    });

    console.log(`  ✓ Result: ${refundResult.message}`);
    console.log(`  ✓ Payment status: ${reconciled?.paymentStatus}`);
    console.log(`  ✓ Deposit status: ${reconciled?.depositIntents[0]?.status}`);

    if (!stripeCalls.some((call) => call.url.endsWith("/refunds") && call.body.includes("amount=75000"))) {
      throw new Error("Admin refund did not call Stripe refunds endpoint with the captured amount.");
    }
    if (
      !refundResult.success ||
      reconciled?.paymentStatus !== "REFUNDED" ||
      reconciled.depositIntents[0]?.status !== "REFUNDED" ||
      reconciled.fees[0]?.status !== "REFUNDED" ||
      reconciled.collectedAmount !== 0
    ) {
      throw new Error("Admin refund did not reconcile request, deposit, fee, and collected amount.");
    }
    if (!reconciled.events[0]?.note?.includes("Sprint 8F admin refund reconciliation")) {
      throw new Error("Admin refund did not write the reconciliation audit note.");
    }

    console.log("\n3. Verifying provider failure blocks mutation...");
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const body = String(init?.body || "");
      stripeCalls.push({ url, body });
      if (url.endsWith("/payment_intents")) {
        return Response.json({ id: `pi_8f_fail_${stripeCalls.length}` });
      }
      if (url.includes("/capture")) {
        return Response.json({ id: "pi_8f_fail_captured" });
      }
      if (url.endsWith("/refunds")) {
        return Response.json({ error: { message: "Refund window closed" } }, { status: 402 });
      }
      return Response.json({ id: "ok_8f_fail" });
    }) as typeof fetch;

    const failingRequest = await createAdminSettlementRequest("pm_card_visa");
    await submitPartnerDecision({
      token: failingRequest.partnerTokens[0].token,
      decision: "ACCEPTED",
      note: "Sprint 8F failed refund acceptance fixture.",
    });
    const failureResult = await adminReleaseRefund(
      failingRequest.id,
      "Sprint 8F failed refund should not mutate."
    );
    const failedAfter = await prisma.fulfillmentRequest.findUnique({
      where: { id: failingRequest.id },
      include: {
        depositIntents: true,
        events: { orderBy: { createdAt: "desc" } },
      },
    });

    console.log(`  ✓ Failure result: ${failureResult.message}`);
    console.log(`  ✓ Preserved payment status: ${failedAfter?.paymentStatus}`);
    if (failureResult.success) {
      throw new Error("Admin refund reported success when the payment provider failed.");
    }
    if (failedAfter?.paymentStatus !== "CAPTURED" || failedAfter.depositIntents[0]?.status !== "CAPTURED") {
      throw new Error("Failed admin refund mutated captured payment state.");
    }
    if (!failedAfter.events[0]?.note?.includes("Admin release/refund blocked")) {
      throw new Error("Failed admin refund did not create blocking audit event.");
    }

    console.log("\n==================================================");
    console.log("      SPRINT 8F ADMIN FINANCIAL TEST PASSED       ");
    console.log("==================================================");
  } finally {
    if (originalPaymentProvider === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = originalPaymentProvider;
    if (originalStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalStripeKey;
    globalThis.fetch = originalFetch;
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Test failed with error:", error);
  process.exit(1);
});
