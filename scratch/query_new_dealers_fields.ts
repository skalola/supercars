import { prisma } from "../lib/prisma";

async function main() {
  const contacts = await prisma.partnerContact.findMany({
    where: {
      name: { in: ["Prestige Imports", "O'Gara Coach Beverly Hills", "Chicago Motor Cars", "Chubb Collector Car Insurance"] }
    }
  });
  console.log(JSON.stringify(contacts.map(c => ({ 
    name: c.name, 
    phone: c.phone, 
    website: c.website, 
    city: c.city, 
    state: c.state 
  })), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
