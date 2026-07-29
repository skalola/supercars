/**
 * scripts/clean-partner-directory.ts
 *
 * Deactivates test/demo PartnerContact rows and duplicate active contacts so
 * the public directory only displays real, deduped fulfillment vendors.
 *
 * Usage:
 *   npm run clean-partner-directory
 *   npm run clean-partner-directory -- --execute
 */

import { prisma } from "../lib/prisma";
import { isValidEmail } from "../lib/fulfillment/partner-registry";

const execute = process.argv.includes("--execute");

const testNamePatterns = [
  /\bsprint\s*\d+[a-z]?\b/i,
  /\bsprint\s*7[a-z]?\b/i,
  /\btest\b/i,
  /\bdemo\b/i,
  /\bdummy\b/i,
  /\bfinancial\s+settlement\b/i,
  /\btransaction\s+center\b/i,
  /\bspecialty\s+vehicle\s+transport\b/i,
  /\bshiv'?s\s+autoshop\b/i,
];

async function main() {
  const contacts = await prisma.partnerContact.findMany({
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
  });

  const testContacts = contacts.filter((contact) =>
    contact.active &&
    testNamePatterns.some((pattern) => pattern.test(contact.name)),
  );

  const duplicateGroups = new Map<string, typeof contacts>();
  for (const contact of contacts.filter((c) => c.active && !testContacts.some((t) => t.id === c.id))) {
    const key = dedupeKey(contact);
    const group = duplicateGroups.get(key) || [];
    group.push(contact);
    duplicateGroups.set(key, group);
  }

  const duplicateLosers: Array<{ loserId: string; keepId: string; name: string; keepName: string }> = [];
  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((a, b) => scoreContact(b) - scoreContact(a));
    const keep = sorted[0];
    for (const loser of sorted.slice(1)) {
      duplicateLosers.push({
        loserId: loser.id,
        keepId: keep.id,
        name: loser.name,
        keepName: keep.name,
      });
    }
  }

  console.log("Partner directory cleanup");
  console.log(`Mode: ${execute ? "EXECUTE" : "DRY RUN"}`);
  console.log(`Contacts scanned: ${contacts.length}`);
  console.log(`Test/demo contacts to deactivate: ${testContacts.length}`);
  for (const contact of testContacts) {
    console.log(`  TEST  ${contact.type} | ${contact.name} | ${contact.email || "no email"}`);
  }

  console.log(`Duplicate contacts to deactivate: ${duplicateLosers.length}`);
  for (const duplicate of duplicateLosers) {
    console.log(`  DUPE  ${duplicate.name} -> keep ${duplicate.keepName}`);
  }

  if (!execute) {
    console.log("Dry run only. Re-run with --execute to update the database.");
    return;
  }

  for (const contact of testContacts) {
    await prisma.partnerContact.update({
      where: { id: contact.id },
      data: { active: false },
    });
  }

  for (const duplicate of duplicateLosers) {
    await prisma.fulfillmentParty.updateMany({
      where: { partnerContactId: duplicate.loserId },
      data: { partnerContactId: duplicate.keepId },
    });

    await prisma.partnerContact.update({
      where: { id: duplicate.loserId },
      data: { active: false },
    });
  }

  console.log("Cleanup complete.");
}

function dedupeKey(contact: {
  type: string;
  name: string;
  email: string | null;
  phone: string | null;
  sourceDomain: string | null;
  location: string | null;
}) {
  if (contact.sourceDomain) return `${contact.type}|domain:${normalize(contact.sourceDomain)}`;
  if (contact.email) return `${contact.type}|email:${normalize(contact.email)}`;
  if (contact.phone) return `${contact.type}|phone:${normalize(contact.phone)}`;

  return `${contact.type}|name:${canonicalName(contact.name)}|location:${normalize(contact.location || "")}`;
}

function scoreContact(contact: {
  active: boolean;
  email: string | null;
  confidence: string;
  marketSourceId: string | null;
  updatedAt: Date;
}) {
  let score = 0;
  if (contact.active) score += 1000;
  if (isValidEmail(contact.email)) score += 200;
  if (contact.confidence === "VERIFIED") score += 100;
  if (contact.confidence === "PUBLIC_SOURCE") score += 50;
  if (contact.marketSourceId) score += 25;
  score += contact.updatedAt.getTime() / 1_000_000_000_000;
  return score;
}

function canonicalName(value: string) {
  return normalize(
    value
      .replace(/\bservice\s+center\b/gi, "service")
      .replace(/\bsales\s+team\b/gi, "sales")
      .replace(/\binc\b|\bllc\b|\bcorp\b|\bco\b/gi, ""),
  );
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9@.]+/g, "");
}

main()
  .catch((error) => {
    console.error("Partner directory cleanup failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
