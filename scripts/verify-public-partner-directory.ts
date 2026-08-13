/**
 * scripts/verify-public-partner-directory.ts
 *
 * Verifies that public Directory vendors have:
 * - a reachable website
 * - a phone number stored in the registry
 * - a city/state location stored in the registry
 * - the same phone visibly published on the website
 * - if an email exists, the same email visibly published on the website
 *
 * Failed records are deactivated with --execute so they no longer appear in
 * the public Directory. This script does not delete records.
 *
 * Usage:
 *   npm run verify-public-directory
 *   npm run verify-public-directory -- --limit 25
 *   npm run verify-public-directory -- --execute
 */

import { prisma } from "../lib/prisma";
import { verifyPartnerWebsiteContact } from "../lib/directory/partner-website-verification";
import { getBatchLimit, isExecuteMode, logScriptMode } from "./lib/script-guards";

const execute = isExecuteMode();
const limit = getBatchLimit({ defaultLimit: 100, maxLimit: 500 });

async function main() {
  logScriptMode("verify-public-partner-directory", execute, limit);
  const contacts = await prisma.partnerContact.findMany({
    where: {
      active: true,
      type: { in: ["DEALER", "SERVICE_SHOP", "TRANSPORTER", "INSURER"] },
    },
    select: {
      id: true,
      name: true,
      type: true,
      website: true,
      email: true,
      phone: true,
      city: true,
      state: true,
      confidence: true,
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    take: limit,
  });

  let verified = 0;
  let failed = 0;

  console.log("==================================================");
  console.log("  SUPERCAR DASH Public Directory Verification");
  console.log("==================================================");
  console.log(`Mode: ${execute ? "deactivate failures" : "dry run"}`);
  console.log(`Active contacts inspected: ${contacts.length}\n`);

  for (const contact of contacts) {
    const result = await verifyPartnerWebsiteContact(contact);
    if (result.ok) {
      verified++;
      console.log(`OK   ${contact.type} | ${contact.name} | ${result.status || "OK"} | ${result.sourceUrl || contact.website}`);
      if (execute && !result.emailPublished && contact.email) {
        await prisma.partnerContact.update({
          where: { id: contact.id },
          data: {
            email: null,
            contactStatus: "UNRESOLVED_EMAIL",
            confidence: contact.confidence === "VERIFIED" ? "PUBLIC_SOURCE" : contact.confidence,
            lastVerifiedAt: new Date(),
          },
        });
      } else if (execute) {
        await prisma.partnerContact.update({
          where: { id: contact.id },
          data: { lastVerifiedAt: new Date() },
        });
      }
      continue;
    }

    failed++;
    console.log(`HOLD ${contact.type} | ${contact.name} | ${result.reason} | ${result.status || "ERR"} | ${result.sourceUrl || contact.website || "no website"}`);

    if (execute) {
      await prisma.partnerContact.update({
        where: { id: contact.id },
        data: {
          active: false,
          confidence: "MANUAL_REVIEW",
          lastVerifiedAt: new Date(),
        },
      });
    }
  }

  console.log("\n==================================================");
  console.log(`  Verified: ${verified}`);
  console.log(`  Held out: ${failed}`);
  console.log("==================================================");
}

main()
  .catch((error) => {
    console.error("Public directory verification failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
