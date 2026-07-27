/**
 * scratch/test_sprint8a_real_email_delivery.ts
 *
 * Verifies Sprint 8A production mail readiness:
 * 1. Provider-backed delivery is used when MAIL_PROVIDER is configured.
 * 2. Generated links honor configured app base URL.
 * 3. Unresolved emails are held before any provider call.
 * 4. Provider failures create immutable FAILED audit events.
 */

import { prisma } from "../lib/prisma";
import { sendFulfillmentEmail } from "../lib/mail/mail-service";

async function createTestRequest() {
  return prisma.fulfillmentRequest.create({
    data: {
      requestType: "DEALER_PURCHASE",
      status: "SENT",
      publicTransactionToken: `mail_8a_${Date.now()}`,
    },
  });
}

async function main() {
  console.log("==================================================");
  console.log("    Testing Sprint 8A Real Email Delivery Layer   ");
  console.log("==================================================\n");

  const originalProvider = process.env.MAIL_PROVIDER;
  const originalResendKey = process.env.RESEND_API_KEY;
  const originalMailFrom = process.env.MAIL_FROM;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalFetch = globalThis.fetch;

  try {
    process.env.MAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "test_resend_key";
    process.env.MAIL_FROM = "SUPERCARS Test <no-reply@supercars.test>";
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.supercars.test";

    const request = await createTestRequest();
    let providerCalls = 0;
    let providerUrl = "";
    const providerBodies: Array<{ subject?: string; html?: string; to?: string[] }> = [];

    globalThis.fetch = (async (input, init) => {
      providerCalls += 1;
      providerUrl = String(input);
      providerBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: "email_8a_success" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const sent = await sendFulfillmentEmail({
      fulfillmentRequestId: request.id,
      templateType: "DEALER_PURCHASE_REQUEST",
      recipientName: "Ferrari Miami",
      recipientEmail: "sales@ferrarimiami.example",
      packageTitle: "Sprint 8A Purchase Package",
      vehicleSummary: "2021 Ferrari F8 Tributo (VIN: ZFF90HLA0L1234567)",
      reviewUrl: "/fulfillment/test-token-8a",
      acceptUrl: "/fulfillment/test-token-8a/accept",
      declineUrl: "/fulfillment/test-token-8a/decline",
    });

    console.log(`  ✓ Provider Send Result: ${sent.message}`);
    if (!sent.dispatched || sent.provider !== "resend" || sent.providerMessageId !== "email_8a_success") {
      throw new Error("Provider-backed email dispatch did not return expected provider metadata.");
    }
    if (providerCalls !== 1 || providerUrl !== "https://api.resend.com/emails") {
      throw new Error("Resend provider API was not called exactly once.");
    }
    if (!providerBodies[0]?.html?.includes("https://staging.supercars.test/fulfillment/test-token-8a")) {
      throw new Error("Email template did not use configured app base URL.");
    }

    const sentEvent = await prisma.fulfillmentEvent.findUnique({ where: { id: sent.eventId! } });
    if (!sentEvent?.note?.includes("Email DISPATCHED") || !sentEvent.note.includes("via resend")) {
      throw new Error("Provider dispatch audit event missing expected DISPATCHED provider note.");
    }

    const blocked = await sendFulfillmentEmail({
      fulfillmentRequestId: request.id,
      templateType: "DEALER_PURCHASE_REQUEST",
      recipientName: "Unresolved Dealer",
      recipientEmail: null,
      packageTitle: "Blocked Sprint 8A Package",
      vehicleSummary: "2021 Ferrari F8 Tributo",
      reviewUrl: "/fulfillment/blocked-8a",
    });

    console.log(`  ✓ Blocked Send Result: ${blocked.message}`);
    if (blocked.dispatched || blocked.reason !== "UNRESOLVED_EMAIL" || providerCalls !== 1) {
      throw new Error("Unresolved email was not held before provider dispatch.");
    }

    globalThis.fetch = (async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ message: "Domain is not verified" }), {
        status: 403,
        statusText: "Forbidden",
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const failed = await sendFulfillmentEmail({
      fulfillmentRequestId: request.id,
      templateType: "DEALER_PURCHASE_REQUEST",
      recipientName: "Ferrari Miami",
      recipientEmail: "sales@ferrarimiami.example",
      packageTitle: "Failed Sprint 8A Package",
      vehicleSummary: "2021 Ferrari F8 Tributo",
      reviewUrl: "/fulfillment/failure-8a",
    });

    console.log(`  ✓ Provider Failure Result: ${failed.message}`);
    if (failed.dispatched || failed.reason !== "PROVIDER_SEND_FAILED") {
      throw new Error("Provider failure did not return failed dispatch result.");
    }

    const failedEvent = await prisma.fulfillmentEvent.findUnique({ where: { id: failed.eventId! } });
    if (!failedEvent?.note?.includes("Email FAILED") || !failedEvent.note.includes("Domain is not verified")) {
      throw new Error("Provider failure audit event missing expected FAILED note.");
    }

    console.log("\n==================================================");
    console.log("  ALL SPRINT 8A REAL EMAIL DELIVERY TESTS PASSED!");
    console.log("==================================================");
  } finally {
    if (originalProvider === undefined) delete process.env.MAIL_PROVIDER;
    else process.env.MAIL_PROVIDER = originalProvider;
    if (originalResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalResendKey;
    if (originalMailFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = originalMailFrom;
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    globalThis.fetch = originalFetch;
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Test failed with error:", error);
  process.exit(1);
});
