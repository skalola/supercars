import { PrismaClient } from "@prisma/client";
import { buildMakeLogoUrl, getMakeMetadata } from "@/lib/makes/make-metadata";

const prisma = new PrismaClient();

async function main() {
  const makes = await prisma.make.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  let updated = 0;
  let withLogos = 0;

  for (const make of makes) {
    const metadata = getMakeMetadata(make.slug);
    const logoUrl = buildMakeLogoUrl(make.slug);

    await prisma.make.update({
      where: { id: make.id },
      data: {
        region: metadata.region,
        logoUrl,
      },
    });

    updated += 1;
    if (logoUrl) withLogos += 1;
  }

  console.log(`[backfill-make-metadata] Updated ${updated} makes. Logo URLs assigned: ${withLogos}.`);
}

main()
  .catch((error) => {
    console.error("[backfill-make-metadata] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
