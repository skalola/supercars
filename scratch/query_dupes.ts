import { prisma } from "../lib/prisma";

async function main() {
  const dupes = await prisma.partnerContact.findMany({
    where: { name: { contains: "Lamborghini Beverly Hills" } }
  });
  console.log(dupes);
}

main();
