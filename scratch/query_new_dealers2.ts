import { prisma } from "../lib/prisma";

async function main() {
  const contacts = await prisma.partnerContact.findMany({
    where: {
      name: { in: ["Prestige Imports", "O'Gara Coach Beverly Hills", "Chicago Motor Cars"] }
    }
  });
  console.log(contacts.map(c => c.contactStatus));
}

main().catch(console.error).finally(() => prisma.$disconnect());
