/**
 * scratch/test_sprint8h_partner_decision_confirmation.ts
 *
 * Sprint 8H verification:
 * 1. GET /fulfillment/[token]/accept and /decline render confirmation pages only.
 * 2. GET requests do not consume single-purpose tokens or finalize status.
 * 3. POST form submission executes accept.
 * 4. POST JSON submission executes decline.
 */

import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { createFulfillmentRequest } from "../lib/fulfillment/service";
import { GET as acceptGet, POST as acceptPost } from "../app/fulfillment/[token]/accept/route";
import { GET as declineGet, POST as declinePost } from "../app/fulfillment/[token]/decline/route";

async function createDecisionRouteFixture(suffix: string) {
  return createFulfillmentRequest({
    requestType: "SERVICE_BOOKING",
    status: "SENT",
    partnerName: `Sprint 8H Service Partner ${suffix}`,
    partnerEmail: `service.8h.${suffix}@supercars.market`,
    packageTitle: `Sprint 8H Partner Decision ${suffix}`,
    packageDescription: "Confirmation-page route fixture.",
    scopedPackageData: {
      serviceRequest: "Annual service inspection",
    },
    parties: [
      {
        partyType: "BUYER",
        name: `Sprint 8H Buyer ${suffix}`,
        email: `buyer.8h.${suffix}@supercars.market`,
      },
      {
        partyType: "SERVICE_CENTER",
        name: `Sprint 8H Service Partner ${suffix}`,
        email: `service.8h.${suffix}@supercars.market`,
      },
    ],
    fees: [
      {
        feeType: "SERVICE_FEE",
        amount: 125,
        status: "ESTIMATED",
        description: "Sprint 8H service booking fee.",
      },
    ],
  });
}

function routeParams(token: string) {
  return { params: Promise.resolve({ token }) };
}

async function main() {
  console.log("==================================================");
  console.log("   Testing Sprint 8H Partner Decision Confirm UI  ");
  console.log("==================================================\n");

  console.log("1. Verifying GET accept does not finalize token...");
  const acceptFixture = await createDecisionRouteFixture(`accept.${Date.now()}`);
  const acceptToken = acceptFixture.partnerTokens[0].token;
  const acceptGetResponse = await acceptGet(
    new NextRequest(`https://supercars.test/fulfillment/${acceptToken}/accept`),
    routeParams(acceptToken)
  );
  const acceptHtml = await acceptGetResponse.text();
  const afterAcceptGet = await prisma.fulfillmentRequest.findUnique({
    where: { id: acceptFixture.id },
    include: { partnerTokens: true, depositIntents: true },
  });

  console.log(`  ✓ GET accept status: ${acceptGetResponse.status}`);
  console.log(`  ✓ Request status after GET: ${afterAcceptGet?.status}`);
  if (!acceptHtml.includes("Confirm Accept")) {
    throw new Error("GET accept did not render a confirmation page.");
  }
  if (
    afterAcceptGet?.status === "ACCEPTED_AWAITING_PAYMENT" ||
    afterAcceptGet?.partnerTokens[0]?.actionTaken ||
    afterAcceptGet?.depositIntents.length !== 0
  ) {
    throw new Error("GET accept finalized token or moved payment state.");
  }

  console.log("\n2. Verifying POST form accept executes decision...");
  const formBody = new URLSearchParams();
  formBody.set("note", "Sprint 8H form accept confirmation.");
  const acceptPostResponse = await acceptPost(
    new NextRequest(`https://supercars.test/fulfillment/${acceptToken}/accept`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody,
    }),
    routeParams(acceptToken)
  );
  const acceptedAfterPost = await prisma.fulfillmentRequest.findUnique({
    where: { id: acceptFixture.id },
    include: {
      partnerTokens: true,
      depositIntents: true,
      events: { orderBy: { createdAt: "desc" } },
    },
  });

  console.log(`  ✓ POST accept status: ${acceptPostResponse.status}`);
  console.log(`  ✓ POST accept redirect: ${acceptPostResponse.headers.get("location")}`);
  if (
    acceptPostResponse.status !== 303 ||
    !acceptPostResponse.headers.get("location")?.endsWith(`/fulfillment/${acceptToken}`) ||
    acceptedAfterPost?.status !== "ACCEPTED_AWAITING_PAYMENT" ||
    acceptedAfterPost.paymentStatus !== "PAYMENT_REQUIRED" ||
    acceptedAfterPost.partnerTokens[0]?.actionTaken !== "ACCEPTED" ||
    acceptedAfterPost.depositIntents.length !== 0 ||
    !acceptedAfterPost.events.some((event) => event.note?.includes("Sprint 8H form accept confirmation"))
  ) {
    throw new Error("POST form accept did not execute and audit the partner decision.");
  }

  console.log("\n3. Verifying GET decline does not finalize token...");
  const declineFixture = await createDecisionRouteFixture(`decline.${Date.now()}`);
  const declineToken = declineFixture.partnerTokens[0].token;
  const declineGetResponse = await declineGet(
    new NextRequest(`https://supercars.test/fulfillment/${declineToken}/decline`),
    routeParams(declineToken)
  );
  const declineHtml = await declineGetResponse.text();
  const afterDeclineGet = await prisma.fulfillmentRequest.findUnique({
    where: { id: declineFixture.id },
    include: { partnerTokens: true, depositIntents: true },
  });

  console.log(`  ✓ GET decline status: ${declineGetResponse.status}`);
  console.log(`  ✓ Request status after GET: ${afterDeclineGet?.status}`);
  if (!declineHtml.includes("Confirm Decline")) {
    throw new Error("GET decline did not render a confirmation page.");
  }
  if (
    afterDeclineGet?.status === "DECLINED" ||
    afterDeclineGet?.partnerTokens[0]?.actionTaken ||
    afterDeclineGet?.depositIntents.length !== 0
  ) {
    throw new Error("GET decline finalized token or moved payment state.");
  }

  console.log("\n4. Verifying POST JSON decline executes decision...");
  const declinePostResponse = await declinePost(
    new NextRequest(`https://supercars.test/fulfillment/${declineToken}/decline`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "Sprint 8H JSON decline confirmation." }),
    }),
    routeParams(declineToken)
  );
  const declinedAfterPost = await prisma.fulfillmentRequest.findUnique({
    where: { id: declineFixture.id },
    include: {
      partnerTokens: true,
      depositIntents: true,
      events: { orderBy: { createdAt: "desc" } },
    },
  });

  console.log(`  ✓ POST decline status: ${declinePostResponse.status}`);
  if (
    declinePostResponse.status !== 200 ||
    declinedAfterPost?.status !== "DECLINED" ||
    declinedAfterPost.partnerTokens[0]?.actionTaken !== "DECLINED" ||
    declinedAfterPost.depositIntents.length !== 0 ||
    !declinedAfterPost.events.some((event) => event.note?.includes("Sprint 8H JSON decline confirmation"))
  ) {
    throw new Error("POST JSON decline did not execute and audit the partner decision.");
  }

  console.log("\n==================================================");
  console.log("       SPRINT 8H DECISION CONFIRM TEST PASSED     ");
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
