import { prisma } from "../lib/prisma";

async function main() {
  const contacts = await prisma.partnerContact.findMany({
    where: {
      name: {
        contains: "Beverly Hills"
      },
      type: "DEALER"
    }
  });
  console.log(JSON.stringify(contacts.map(c => ({ id: c.id, name: c.name, domain: c.sourceDomain })), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
