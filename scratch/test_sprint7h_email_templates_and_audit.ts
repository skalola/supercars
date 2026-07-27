/**
 * scratch/test_sprint7h_email_templates_and_audit.ts
 *
 * Sprint 7H Email Templates & Dispatch Audit Verification Script.
 * Validates:
 * 1. Rendering of all 10 core email templates (subjects, HTML & plain text formatting)
 * 2. Dispatch audit event logging in FulfillmentEvent for SENT, BLOCKED, and RESENT states
 * 3. Zero Guessed Email hold audit tracking
 * 4. Admin email metrics aggregation (failed/held email counts)
 */

import { prisma } from "../lib/prisma";
import { generateEmailTemplate, EmailTemplateType } from "../lib/mail/email-templates";
import { sendFulfillmentEmail } from "../lib/mail/mail-service";
import { createFulfillmentRequest } from "../lib/fulfillment/service";
import { getAdminFulfillmentMetrics, resendFulfillmentEmailAdmin } from "../lib/admin/fulfillment-ops";

async function main() {
  console.log("==================================================");
  console.log(" Testing Sprint 7H Email Templates & Audit Trail ");
  console.log("==================================================\n");

  // ── 1. Validate All 10 Core Email Templates ──────────────────────────────
  console.log("1. Validating 10 Production Email Templates...");

  const templateTypes: EmailTemplateType[] = [
    "DEALER_PURCHASE_REQUEST",
    "INSURANCE_QUOTE_REQUEST",
    "TRANSPORT_REQUEST",
    "SERVICE_BOOKING_REQUEST",
    "BUYER_CONFIRMATION",
    "SELLER_CONFIRMATION",
    "ACCEPTED_NOTIFICATION",
    "DECLINED_NOTIFICATION",
    "EXPIRED_NOTIFICATION",
    "CANCELLATION_REFUND_NOTIFICATION",
  ];

  for (const type of templateTypes) {
    const rendered = generateEmailTemplate({
      templateType: type,
      recipientName: "Test Recipient",
      recipientEmail: "test@example.com",
      packageTitle: `Test Package — ${type}`,
      vehicleSummary: "2022 Ferrari SF90 Stradale (VIN: ZFF90...)",
      priceOrAmount: 525000,
      reviewUrl: "/fulfillment/test-token",
      acceptUrl: "/fulfillment/test-token/accept",
      declineUrl: "/fulfillment/test-token/decline",
      additionalDetails: {
        "Vehicle VIN": "ZFF90...1234",
        "Offer Price": "$525,000",
        "Platform Fee": "$5,250",
        "Customer Note": "<script>alert('x')</script>",
      },
    });

    console.log(`  ✓ Template [${type}]:`);
    console.log(`    - Subject: "${rendered.subject}"`);
    console.log(`    - HTML Length: ${rendered.html.length} chars | Text Length: ${rendered.text.length} chars`);

    if (!rendered.subject || !rendered.html.includes("SUPERCARS") || !rendered.text || rendered.html.includes("<script>")) {
      throw new Error(`Template generation failed for '${type}'!`);
    }
  }

  // ── 2. Validate Audit Trail Logging (SENT vs BLOCKED vs RESENT) ─────────────
  console.log("\n2. Validating Dispatch Audit Trail Event Logging...");

  const testReq = await createFulfillmentRequest({
    requestType: "DEALER_PURCHASE",
    partnerName: "Ferrari Beverly Hills Audit Test",
    partnerEmail: "dispatch.audit@ferrariofbeverlyhills.com",
    packageTitle: "Email Audit Test Package",
    scopedPackageData: { test: true },
    parties: [{ partyType: "BUYER", name: "Buyer Audit", email: "buyer.audit@supercars.market" }],
  });

  // State 1: Dispatched (SENT)
  const dispatchRes = await sendFulfillmentEmail({
    fulfillmentRequestId: testReq.id,
    templateType: "DEALER_PURCHASE_REQUEST",
    recipientName: "Ferrari Beverly Hills Audit Test",
    recipientEmail: "dispatch.audit@ferrariofbeverlyhills.com",
    packageTitle: "Email Audit Test Package",
    vehicleSummary: "2022 Ferrari SF90 Stradale",
    reviewUrl: `/fulfillment/${testReq.partnerTokens[0].token}`,
  });

  console.log(`  ✓ Sent Event Created: ID=${dispatchRes.eventId} | Dispatched=${dispatchRes.dispatched}`);

  // State 2: Blocked / Held (BLOCKED - Zero Guessed Email)
  const blockedRes = await sendFulfillmentEmail({
    fulfillmentRequestId: testReq.id,
    templateType: "DEALER_PURCHASE_REQUEST",
    recipientName: "Unresolved Dealer Partner",
    recipientEmail: null, // Unresolved email -> MUST be held!
    packageTitle: "Blocked Email Test",
    vehicleSummary: "2022 Ferrari SF90 Stradale",
    reviewUrl: `/fulfillment/${testReq.partnerTokens[0].token}`,
  });

  console.log(`  ✓ Blocked Event Created: ID=${blockedRes.eventId} | Dispatched=${blockedRes.dispatched} (Reason: ${blockedRes.reason})`);

  if (blockedRes.dispatched !== false || blockedRes.reason !== "UNRESOLVED_EMAIL") {
    throw new Error("Mail Service failed to block unresolved email!");
  }

  // State 3: Admin Resend (RESENT)
  const resendRes = await resendFulfillmentEmailAdmin(testReq.id);
  console.log(`  ✓ Admin Resend Result: ${resendRes.message}`);

  const reqEvents = await prisma.fulfillmentEvent.findMany({
    where: { fulfillmentRequestId: testReq.id },
    orderBy: { createdAt: "asc" },
  });

  console.log(`  ✓ Total Audit Events Logged for Request: ${reqEvents.length}`);
  reqEvents.forEach((evt, idx) => {
    console.log(`    [${idx + 1}] Actor: ${evt.actorType} | Status: ${evt.newStatus} | Note: "${evt.note}"`);
  });

  const resentEvent = reqEvents.find((evt) => evt.note?.includes("Email RESENT"));
  if (!dispatchRes.dispatched || !blockedRes.eventId || !resentEvent) {
    throw new Error("Email audit trail did not record DISPATCHED, BLOCKED, and RESENT states.");
  }

  // ── 3. Validate Admin Email Metrics Aggregation ───────────────────────────
  console.log("\n3. Validating Admin Email Metrics Aggregation...");
  const metrics = await getAdminFulfillmentMetrics();
  console.log(`  ✓ Failed/Held Email Count in Admin Dashboard: ${metrics.failedEmailsCount}`);

  if (typeof metrics.failedEmailsCount !== "number") {
    throw new Error("getAdminFulfillmentMetrics failed to report failed/held email metrics!");
  }

  console.log("\n==================================================");
  console.log(" SPRINT 7H EMAIL TEMPLATES & AUDIT TEST PASSED!  ");
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("Test failed with error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
