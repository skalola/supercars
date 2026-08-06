import { prisma } from "../lib/prisma";

async function cleanPartnerDirectory() {
  console.log("Starting Partner Directory Deduplication...");

  const testContacts = await prisma.partnerContact.findMany({
    where: {
      OR: [
        { website: { contains: ".example.", mode: "insensitive" } },
        { website: { contains: "example.org", mode: "insensitive" } },
        { website: { contains: "example.com", mode: "insensitive" } },
        { email: { contains: "@example.", mode: "insensitive" } },
        { name: { contains: "Sprint", mode: "insensitive" } },
        { name: { contains: "Test", mode: "insensitive" } },
        { name: { contains: "Transaction Center", mode: "insensitive" } },
        { name: { contains: "Financial Settlement", mode: "insensitive" } },
        { name: { contains: "Admin Ops", mode: "insensitive" } },
      ],
    },
    include: { fulfillmentParties: true },
  });

  let removedTestContacts = 0;
  let deactivatedTestContacts = 0;
  for (const contact of testContacts) {
    if (contact.fulfillmentParties.length > 0) {
      await prisma.partnerContact.update({
        where: { id: contact.id },
        data: { active: false, confidence: "MANUAL_REVIEW" },
      });
      deactivatedTestContacts++;
      continue;
    }

    await prisma.partnerContact.delete({ where: { id: contact.id } });
    removedTestContacts++;
  }

  const contacts = await prisma.partnerContact.findMany({
    include: {
      fulfillmentParties: true,
    }
  });

  const groups = new Map<string, typeof contacts>();

  for (const c of contacts) {
    const key = `${canonicalContactKey(c)}|${c.type}|${c.makeSpecialization || "ALL"}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(c);
  }

  let deletedCount = 0;
  let migratedCount = 0;

  for (const [key, group] of Array.from(groups.entries())) {
    if (group.length > 1) {
      console.log(`Found ${group.length} duplicates for "${key}"`);
      
      // Sort to find primary: prefer RESOLVED, then prefer most recently updated
      group.sort((a, b) => {
        if (a.contactStatus === "RESOLVED" && b.contactStatus !== "RESOLVED") return -1;
        if (b.contactStatus === "RESOLVED" && a.contactStatus !== "RESOLVED") return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });

      const [primary, ...duplicates] = group;
      console.log(`  -> Primary: ${primary.id} (${primary.email || 'no-email'})`);

      for (const dup of duplicates) {
        console.log(`  -> Deleting duplicate: ${dup.id} (${dup.email || 'no-email'})`);
        
        if (dup.fulfillmentParties.length > 0) {
          // Migrate fulfillment parties
          for (const party of dup.fulfillmentParties) {
            await prisma.fulfillmentParty.update({
              where: { id: party.id },
              data: { partnerContactId: primary.id }
            });
            migratedCount++;
          }
          console.log(`    - Migrated ${dup.fulfillmentParties.length} fulfillment parties to primary`);
        }

        await prisma.partnerContact.delete({
          where: { id: dup.id }
        });
        deletedCount++;
      }
    }
  }

  console.log(`\nDeduplication complete! Deleted ${deletedCount} duplicate contacts. Migrated ${migratedCount} fulfillment relations.`);
  console.log(`Removed test/example contacts: ${removedTestContacts}. Deactivated protected test contacts: ${deactivatedTestContacts}.`);
}

function canonicalContactKey(contact: { name: string; website: string | null; sourceDomain: string | null; makeSpecialization?: string | null; city?: string | null; state?: string | null }) {
  const domain = contact.sourceDomain || domainFromUrl(contact.website);
  if (domain && shouldDedupeByDomain(contact.makeSpecialization, domain)) return domain;
  return [
    contact.name,
    contact.city || "",
    contact.state || "",
  ].join("|").toLowerCase().replace(/\b(of|the|inc|llc|corp|co|dealership|auto|motors)\b/g, "").replace(/[^a-z0-9|]+/g, "");
}

function domainFromUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isManufacturerLocatorDomain(domain: string) {
  return /(^|\.)lamborghini\.com$/i.test(domain) || /(^|\.)ferraridealers\.com$/i.test(domain) || /(^|\.)mclaren\.com$/i.test(domain);
}

function shouldDedupeByDomain(make: string | null | undefined, domain: string) {
  if (isManufacturerLocatorDomain(domain) || isGenericOrRedirectDomain(domain)) return false;
  if (!make || make === "ALL") return true;
  if (make === "Ferrari") return /ferrari/i.test(domain);
  if (make === "Lamborghini") return /lamborghini/i.test(domain);
  if (make === "McLaren") return /mclaren/i.test(domain);
  return true;
}

function isGenericOrRedirectDomain(domain: string) {
  return /(^|\.)google\.com$/i.test(domain) || /(^|\.)goo\.gl$/i.test(domain);
}

cleanPartnerDirectory()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
