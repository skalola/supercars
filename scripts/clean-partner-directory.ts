import { prisma } from "../lib/prisma";

async function cleanPartnerDirectory() {
  console.log("Starting Partner Directory Deduplication...");

  const contacts = await prisma.partnerContact.findMany({
    include: {
      fulfillmentParties: true,
    }
  });

  const groups = new Map<string, typeof contacts>();

  for (const c of contacts) {
    const key = `${c.name.toLowerCase().trim()}|${c.type}`;
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
}

cleanPartnerDirectory()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
