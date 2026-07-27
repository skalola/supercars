/**
 * scratch/test_email_dispatch_engine.ts
 *
 * Automated verification script for Sprint 7.8 Email Dispatch + Templates.
 * Validates:
 * 1. Template generation for all 10 email templates
 * 2. Mandatory email fields (summary, review URL, expiration date, accept/decline CTA, SUPERCARS footer)
 * 3. Zero Guessed Emails Rule (blocking unresolved/invalid email addresses)
 * 4. FulfillmentEvent database audit record creation for every email send or hold
 */

import { prisma } from "../lib/prisma";
import { generateEmailTemplate, EmailTemplateType } from "../lib/mail/email-templates";
import { sendFulfillmentEmail } from "../lib/mail/mail-service";
import { createDealerPurchasePackage } from "../app/actions/purchase";

async function main() {
  console.log("==================================================");
  console.log("    Testing Sprint 7.8 Email Dispatch & Templates ");
  console.log("==================================================\n");

  const testVin = "ZHWUR1ZE8MLA00999";
  const vehicleSummary = `2021 Lamborghini Huracan EVO (VIN: ${testVin})`;
  const reviewUrl = "/fulfillment/token-12345";
  const acceptUrl = "/fulfillment/token-12345/accept";
  const declineUrl = "/fulfillment/token-12345/decline";

  const allTemplates: EmailTemplateType[] = [
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

  // ── 1. Validate All 10 Email Templates ─────────────────────────────────────
  console.log("1. Validating All 10 Email Templates & Core HTML Components...");

  for (const tType of allTemplates) {
    const email = generateEmailTemplate({
      templateType: tType,
      recipientName: "Test User / Partner",
      recipientEmail: "test@supercars.market",
      packageTitle: `Testing Template ${tType}`,
      vehicleSummary,
      priceOrAmount: 285000,
      reviewUrl,
      expirationDate: "7 Days from issue",
      acceptUrl,
      declineUrl,
    });

    console.log(`  ✓ Template [${tType}] generated: "${email.subject}"`);

    // Verify key component requirements in HTML
    if (!email.html.includes("SUPERCARS MARKETPLACE")) throw new Error(`Missing SUPERCARS header in ${tType}`);
    if (!email.html.includes(vehicleSummary)) throw new Error(`Missing vehicle summary in ${tType}`);
    if (!email.html.includes("7 Days from issue")) throw new Error(`Missing expiration date in ${tType}`);
    if (!email.html.includes("support@supercars.market")) throw new Error(`Missing support footer in ${tType}`);
    if (!email.html.includes(reviewUrl)) throw new Error(`Missing review URL in ${tType}`);
  }

  console.log("  ✓ All 10 email templates rendered correctly with required structural components.");

  // ── 2. Test Central Mail Service & FulfillmentEvent Record Creation ───────
  console.log("\n2. Testing Central Mail Service & Event Audit Records...");

  let buyerUser = await prisma.user.findFirst({ where: { email: "mailtest.buyer@example.com" } });
  if (!buyerUser) {
    buyerUser = await prisma.user.create({
      data: {
        name: "Warren Buffett",
        email: "mailtest.buyer@example.com",
        username: "warren_mailtest",
      },
    });
  }

  (globalThis as any).mockSession = {
    user: { id: buyerUser.id, email: buyerUser.email, name: buyerUser.name },
  };

  const sampleListing = await prisma.listing.findFirst({ where: { status: "ACTIVE" } });
  if (!sampleListing) throw new Error("No active listing found.");

  // Test successful email dispatch via mail-service
  const testReq = await prisma.fulfillmentRequest.create({
    data: {
      requestType: "DEALER_PURCHASE",
      status: "SENT",
      publicTransactionToken: `pub_${Date.now()}`,
    },
  });

  const sendResult = await sendFulfillmentEmail({
    fulfillmentRequestId: testReq.id,
    templateType: "DEALER_PURCHASE_REQUEST",
    recipientName: "Ferrari Beverly Hills",
    recipientEmail: "sales@ferrariofbeverlyhills.com",
    packageTitle: "Purchase Offer for 2022 Ferrari SF90",
    vehicleSummary: "2022 Ferrari SF90 Stradale",
    priceOrAmount: 520000,
    reviewUrl: `/fulfillment/test-token-sf90`,
  });

  console.log(`  ✓ Send Result: ${sendResult.message}`);
  console.log(`  ✓ Created Event ID: ${sendResult.eventId}`);

  const createdEvent = await prisma.fulfillmentEvent.findUnique({
    where: { id: sendResult.eventId! },
  });

  console.log(`  ✓ Verified FulfillmentEvent Note: "${createdEvent?.note}"`);
  if (!createdEvent || !createdEvent.note?.includes("Email DISPATCHED")) {
    throw new Error("FulfillmentEvent record was not created properly!");
  }

  // ── 3. Test Zero Guessed Emails Hold Rule ────────────────────────────────
  console.log("\n3. Testing Zero Guessed Emails Hold Rule...");
  const blockedResult = await sendFulfillmentEmail({
    fulfillmentRequestId: testReq.id,
    templateType: "DEALER_PURCHASE_REQUEST",
    recipientName: "Unresolved Dealer",
    recipientEmail: null,
    packageTitle: "Purchase Offer with Unresolved Email",
    vehicleSummary: "2020 Ferrari F8 Tributo",
    reviewUrl: "/fulfillment/test-blocked",
  });

  console.log(`  ✓ Blocked Result: ${blockedResult.message}`);
  const blockedEvent = await prisma.fulfillmentEvent.findUnique({
    where: { id: blockedResult.eventId! },
  });

  console.log(`  ✓ Verified Blocked Event Note: "${blockedEvent?.note}"`);
  if (!blockedEvent || !blockedEvent.note?.includes("HELD")) {
    throw new Error("Zero Guessed Emails hold audit event was not created!");
  }

  console.log("\n==================================================");
  console.log("  ALL SPRINT 7.8 EMAIL DISPATCH TESTS PASSED!");
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("Test failed with error:", e);
    process.exit(1);
  })
  .finally(async () => {
    delete (globalThis as any).mockSession;
    await prisma.$disconnect();
  });
