import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const listings = await prisma.listing.findMany({
    where: {
      OR: [{ imageUrl: null }, { imageUrl: { contains: "placeholder" } }]
    },
    select: { url: true, id: true }
  });
  console.log(`Found ${listings.length} listings missing images.`);
  const sample = listings.slice(0, 10).map(l => l.url);
  console.log("Sample URLs:", sample);
}
main().finally(() => prisma.$disconnect());
