import { prisma } from "@/lib/prisma";

async function main() {
  const listings = await prisma.listing.findMany({
    where: {
      imageUrl: null,
      vehicle: {
        is: {
          images: {
            some: {},
          },
        },
      },
    },
    select: {
      id: true,
      vehicle: {
        select: {
          images: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: {
              url: true,
              validationStatus: true,
            },
          },
        },
      },
    },
  });

  let updated = 0;

  for (const listing of listings) {
    const image =
      listing.vehicle?.images.find((candidate) => candidate.validationStatus === "VALID") ??
      listing.vehicle?.images[0] ??
      null;

    if (!image?.url) continue;

    await prisma.listing.update({
      where: { id: listing.id },
      data: { imageUrl: image.url },
    });
    updated++;
  }

  console.log(JSON.stringify({ inspected: listings.length, updated }, null, 2));
}

main()
  .catch((error) => {
    console.error("Listing image backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
