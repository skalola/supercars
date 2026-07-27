/**
 * scratch/test_sprint8i_partner_decision_audit.ts
 *
 * Sprint 8I verification:
 * 1. Partner accept/decline POST routes write decision audit metadata.
 * 2. Metadata captures method, route, submittedVia, IP, user agent, referer,
 *    token id, partner name, and partner email for admin operations.
 * 3. Buyer/owner transaction event views remain sanitized and do not expose
 *    raw audit metadata.
 */

import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import {
  createFulfillmentRequest,
  getFulfillmentByIdForUser,
} from "../lib/fulfillment/service";
import { POST as acceptPost } from "../app/fulfillment/[token]/accept/route";

async function createAuditFixture() {
  const buyer = await prisma.user.upsert({
    where: { email: "buyer.8i@supercars.market" },
    update: { name: "Sprint 8I Buyer" },
    create: {
      email: "buyer.8i@supercars.market",
      name: "Sprint 8I Buyer",
      username: "sprint8i_buyer",
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner.8i@supercars.market" },
    update: { name: "Sprint 8I Owner" },
    create: {
      email: "owner.8i@supercars.market",
      name: "Sprint 8I Owner",
      username: "sprint8i_owner",
    },
  });

  const make = await prisma.make.upsert({
    where: { slug: "ferrari" },
    update: {},
    create: { name: "Ferrari", slug: "ferrari" },
  });

  const model = await prisma.model.upsert({
    where: { makeId_slug: { makeId: make.id, slug: "296-gtb" } },
    update: {},
    create: { makeId: make.id, name: "296 GTB", slug: "296-gtb", category: "Supercar" },
  });

  const vehicle = await prisma.vehicle.upsert({
    where: { vin: "ZFF99SLA0P0290001" },
    update: {
      modelId: model.id,
      year: 2023,
      trim: "Sprint 8I QA",
      ownerId: owner.id,
      status: "CLAIMED",
    },
    create: {
      vin: "ZFF99SLA0P0290001",
      modelId: model.id,
      year: 2023,
      trim: "Sprint 8I QA",
      ownerId: owner.id,
      status: "CLAIMED",
    },
  });

  const request = await createFulfillmentRequest({
    requestType: "DEALER_PURCHASE",
    status: "SENT",
    buyerId: buyer.id,
    vehicleId: vehicle.id,
    partnerName: "Sprint 8I Ferrari Dealer",
    partnerEmail: "dealer.8i@supercars.market",
    packageTitle: "Sprint 8I Dealer Purchase",
    packageDescription: "Partner audit metadata fixture.",
    scopedPackageData: {
      agreedPrice: 329000,
      partnerInstruction: "Accept with audit metadata.",
    },
    parties: [
      {
        partyType: "BUYER",
        userId: buyer.id,
        name: buyer.name || "Sprint 8I Buyer",
        email: buyer.email || "buyer.8i@supercars.market",
      },
      {
        partyType: "SELLER",
        userId: owner.id,
        name: owner.name || "Sprint 8I Owner",
        email: owner.email || "owner.8i@supercars.market",
      },
      {
        partyType: "DEALER",
        name: "Sprint 8I Ferrari Dealer",
        email: "dealer.8i@supercars.market",
      },
    ],
    depositIntent: {
      amount: 1000,
      paymentMethod: "SPRINT_8I_LEDGER_AUTH",
    },
    fees: [
      {
        feeType: "COMMISSION",
        amount: 1000,
        status: "AUTHORIZED",
        description: "Sprint 8I commission hold.",
      },
    ],
  });

  return { buyer, owner, request };
}

function routeParams(token: string) {
  return { params: Promise.resolve({ token }) };
}

async function main() {
  console.log("==================================================");
  console.log("    Testing Sprint 8I Partner Decision Audit      ");
  console.log("==================================================\n");

  const { buyer, owner, request } = await createAuditFixture();
  const token = request.partnerTokens[0].token;

  console.log("1. Posting partner accept route with audit headers...");
  const body = new URLSearchParams();
  body.set("note", "Sprint 8I partner accepts with route audit.");

  const response = await acceptPost(
    new NextRequest(`https://supercars.test/fulfillment/${token}/accept`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "203.0.113.77, 10.0.0.1",
        "user-agent": "Sprint8I-Agent/1.0 Decision QA",
        referer: "https://mail.example/secure-link",
      },
      body,
    }),
    routeParams(token)
  );

  if (response.status !== 200) {
    throw new Error(`Expected accept POST status 200, received ${response.status}.`);
  }

  console.log("2. Verifying admin audit metadata...");
  const accepted = await prisma.fulfillmentRequest.findUnique({
    where: { id: request.id },
    include: {
      events: { orderBy: { createdAt: "desc" } },
      partnerTokens: true,
    },
  });

  const partnerEvent = accepted?.events.find((event) => event.actorType === "PARTNER" && event.newStatus === "ACCEPTED");
  if (!partnerEvent?.metadata) {
    throw new Error("Expected partner decision event to include audit metadata.");
  }

  const metadata = JSON.parse(partnerEvent.metadata) as {
    decision?: string;
    tokenId?: string;
    partnerName?: string;
    partnerEmail?: string;
    auditContext?: {
      requestMethod?: string;
      routePath?: string;
      ipAddress?: string;
      userAgent?: string;
      referer?: string;
      contentType?: string;
      submittedVia?: string;
    };
  };

  console.log(`  ✓ Decision: ${metadata.decision}`);
  console.log(`  ✓ IP: ${metadata.auditContext?.ipAddress}`);
  console.log(`  ✓ Submitted Via: ${metadata.auditContext?.submittedVia}`);

  if (metadata.decision !== "ACCEPTED") {
    throw new Error("Partner audit metadata did not capture decision.");
  }
  if (metadata.tokenId !== accepted?.partnerTokens[0]?.id) {
    throw new Error("Partner audit metadata did not capture token id.");
  }
  if (metadata.partnerEmail !== "dealer.8i@supercars.market") {
    throw new Error("Partner audit metadata did not capture partner email.");
  }
  if (metadata.auditContext?.requestMethod !== "POST") {
    throw new Error("Partner audit metadata did not capture request method.");
  }
  if (metadata.auditContext?.routePath !== `/fulfillment/${token}/accept`) {
    throw new Error("Partner audit metadata did not capture route path.");
  }
  if (metadata.auditContext?.ipAddress !== "203.0.113.77") {
    throw new Error("Partner audit metadata did not normalize forwarded IP.");
  }
  if (metadata.auditContext?.submittedVia !== "FORM") {
    throw new Error("Partner audit metadata did not capture form submission mode.");
  }
  if (!metadata.auditContext?.userAgent?.includes("Sprint8I-Agent")) {
    throw new Error("Partner audit metadata did not capture user agent.");
  }
  if (metadata.auditContext?.referer !== "https://mail.example/secure-link") {
    throw new Error("Partner audit metadata did not capture referer.");
  }

  console.log("3. Verifying buyer and owner scoped events do not expose metadata...");
  const buyerView = await getFulfillmentByIdForUser(request.id, buyer.id);
  const ownerView = await getFulfillmentByIdForUser(request.id, owner.id);

  if ("error" in buyerView || "error" in ownerView) {
    throw new Error("Expected buyer and owner views to be available.");
  }

  const buyerEventsJson = JSON.stringify(buyerView.request.events);
  const ownerEventsJson = JSON.stringify(ownerView.request.events);
  if (
    buyerEventsJson.includes("203.0.113.77") ||
    buyerEventsJson.includes("Sprint8I-Agent") ||
    ownerEventsJson.includes("203.0.113.77") ||
    ownerEventsJson.includes("Sprint8I-Agent")
  ) {
    throw new Error("Customer-scoped transaction events leaked partner decision audit metadata.");
  }

  console.log("  ✓ Buyer/owner event timelines remain sanitized.");

  console.log("\n==================================================");
  console.log("       SPRINT 8I PARTNER AUDIT TEST PASSED        ");
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
