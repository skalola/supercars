import { prisma } from "../lib/prisma";

async function main() {
  const contacts = await prisma.partnerContact.findMany({
    where: {
      name: { contains: "Westlake" }
    }
  });
  console.log(JSON.stringify(contacts.map(c => ({ id: c.id, name: c.name, type: c.type, email: c.email, website: c.website, domain: c.sourceDomain, status: c.contactStatus })), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
